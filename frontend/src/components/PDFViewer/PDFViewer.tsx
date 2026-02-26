import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import { useCanvasStore } from '../../store/canvasStore'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface PDFViewerProps {
    pdfData: ArrayBuffer
    onTextSelection?: (text: string, rect?: DOMRect, mousePos?: { x: number; y: number }, autoAsk?: boolean) => void
    onLoad?: (dimensions: { width: number; height: number }) => void
    /** Called whenever the auto fit-height changes (use as min for manual resize). */
    onFitHeightChange?: (h: number) => void
    /** Called when the page changes in the PDF viewer (for syncing with canvas store). */
    onPageChange?: (page: number) => void
    initialPage?: number
    scrollPositions?: Record<number, number>
    onScrollPositionChange?: (page: number, position: number) => void
    className?: string
    containerWidth?: number
    /** Optional override: ContentNode-controlled viewer height (px). */
    viewerHeight?: number
    autoAsk?: boolean
    /** Rendered in the middle of the toolbar */
    customToolbarMiddle?: React.ReactNode
}

export default function PDFViewer({
    pdfData,
    onTextSelection,
    onLoad,
    onFitHeightChange,
    onPageChange,
    initialPage = 1,
    className = '',
    containerWidth: initialContainerWidth,
    viewerHeight: viewerHeightProp,
    customToolbarMiddle,
}: PDFViewerProps) {
    const outerRef = useRef<HTMLDivElement>(null)       // scroll container
    const pageContainerRef = useRef<HTMLDivElement>(null) // white page card
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const textLayerRef = useRef<HTMLDivElement>(null)

    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
    const [numPages, setNumPages] = useState(0)
    const [currentPage, setCurrentPage] = useState(initialPage)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [scale, setScale] = useState<number | null>(null)
    const [isEditingPage, setIsEditingPage] = useState(false)
    const [pageInputValue, setPageInputValue] = useState('')

    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)
    const fitScaleRef = useRef<number>(1.0)
    // Fixed height of the scroll viewport at fit scale. Locked so zooming never
    // resizes the panel. viewerHeightProp overrides this when ContentNode controls height.
    const [fitViewerHeight, setFitViewerHeight] = useState<number>(600)
    // Natural (unscaled) PDF page dimensions — needed for accurate zoom-to-center math.
    const pdfNaturalWidthRef = useRef<number>(0)
    const pdfNaturalHeightRef = useRef<number>(0)
    const [containerWidth, setContainerWidth] = useState<number | undefined>(initialContainerWidth)

    // Keep refs so load/resize effects can read latest values without being
    // re-triggered by every prop update (especially initialContainerWidth which
    // changes on every resize drag event).
    const initialContainerWidthRef = useRef(initialContainerWidth)
    useEffect(() => { initialContainerWidthRef.current = initialContainerWidth }, [initialContainerWidth])
    const onLoadRef = useRef(onLoad)
    useEffect(() => { onLoadRef.current = onLoad }, [onLoad])
    const initialPageRef = useRef(initialPage)
    useEffect(() => { initialPageRef.current = initialPage }, [initialPage])
    const onFitHeightChangeRef = useRef(onFitHeightChange)
    useEffect(() => { onFitHeightChangeRef.current = onFitHeightChange }, [onFitHeightChange])

    // ── Measure container width ──────────────────────────────────────────────
    useEffect(() => {
        if (initialContainerWidth) {
            setContainerWidth(initialContainerWidth)
            return
        }
        const measure = () => {
            if (outerRef.current) setContainerWidth(Math.max(outerRef.current.clientWidth, 100))
        }
        measure()
        const ro = new ResizeObserver(measure)
        if (outerRef.current) ro.observe(outerRef.current)
        return () => ro.disconnect()
    }, [initialContainerWidth])

    // ── Load PDF document (only when pdfData changes, NOT on every resize) ───
    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                setIsLoading(true)
                setError(null)
                const copy = pdfData.slice(0)
                const pdf = await pdfjsLib.getDocument({ data: copy }).promise
                if (cancelled) return
                setPdfDoc(pdf)
                setNumPages(pdf.numPages)
                setCurrentPage(initialPageRef.current)

                // Calculate fit-to-width scale from first page
                const firstPage = await pdf.getPage(1)
                const vp = firstPage.getViewport({ scale: 1.0 })
                const w = initialContainerWidthRef.current ?? 500
                const fit = (w - 32) / vp.width
                fitScaleRef.current = fit
                pdfNaturalWidthRef.current = vp.width
                pdfNaturalHeightRef.current = vp.height
                const fh = vp.height * fit + 32  // page h at fit scale + p-4 top+bottom
                setFitViewerHeight(fh)
                onLoadRef.current?.({ width: vp.width, height: vp.height })
                onFitHeightChange?.(fh)
                setScale(fit)
            } catch (e) {
                if (!cancelled) setError('Failed to load PDF. Please try again.')
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        if (pdfData) load()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfData])  // ← intentionally omit initialContainerWidth & onLoad; use refs instead

    // ── Sync page from outside (e.g. store navigation) without reloading PDF ─
    useEffect(() => {
        setCurrentPage(initialPage)
    }, [initialPage])

    // ── Render current page (canvas + text layer) ────────────────────────────
    useEffect(() => {
        if (!pdfDoc || scale === null) return

        const canvas = canvasRef.current
        const textLayerDiv = textLayerRef.current
        const pageCard = pageContainerRef.current
        if (!canvas || !textLayerDiv || !pageCard) return

        let cancelled = false

        async function renderCurrentPage() {
            try {
                // Cancel any in-progress render
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel()
                    renderTaskRef.current = null
                }

                const page = await pdfDoc!.getPage(currentPage)
                if (cancelled) return

                const viewport = page.getViewport({ scale: scale! })

                // Size the page card to the viewport so nothing overflows
                pageCard!.style.width = `${viewport.width}px`
                pageCard!.style.height = `${viewport.height}px`

                // Canvas — HiDPI with minimum 4x resolution for sharp text
                const dpr = Math.max(window.devicePixelRatio || 1, 4)
                canvas!.width = Math.floor(viewport.width * dpr)
                canvas!.height = Math.floor(viewport.height * dpr)
                canvas!.style.width = `${viewport.width}px`
                canvas!.style.height = `${viewport.height}px`

                const ctx = canvas!.getContext('2d')
                if (!ctx) return
                ctx.scale(dpr, dpr)

                // Render canvas
                const task = page.render({ canvasContext: ctx, viewport })
                renderTaskRef.current = task
                await task.promise
                if (cancelled) return

                // ── Text layer (for selection, like Chrome PDF viewer) ───────
                textLayerDiv!.innerHTML = ''
                textLayerDiv!.style.width = `${viewport.width}px`
                textLayerDiv!.style.height = `${viewport.height}px`
                textLayerDiv!.style.setProperty('--scale-factor', viewport.scale.toString())

                const textLayer = new TextLayer({
                    textContentSource: await page.getTextContent(),
                    container: textLayerDiv!,
                    viewport,
                })
                await textLayer.render()
                if (cancelled) return

                // Spans are transparent by default — selection highlight is
                // applied via the .pdf-text-layer ::selection CSS rule below.
                // Just ensure pointer-events and cursor are correct.
                textLayerDiv!.querySelectorAll<HTMLElement>('span, br').forEach((el) => {
                    el.style.pointerEvents = 'auto'
                    el.style.cursor = 'text'
                    el.style.userSelect = 'text'
                    el.style.color = 'transparent'
                })
            } catch (err: unknown) {
                if ((err as Error)?.name !== 'RenderingCancelledException' && !cancelled) {
                    console.error('[PDFViewer] Render error:', err)
                }
            }
        }

        renderCurrentPage()
        return () => { cancelled = true }
    }, [pdfDoc, currentPage, scale])

    // ── Recalculate fit scale AND fit viewer height when container width changes ─
    // The viewer height must track the aspect-ratio-correct page height at the
    // current fit-to-width scale so there is never excess empty space below
    // the rendered page.
    useEffect(() => {
        if (!pdfNaturalWidthRef.current || !containerWidth) return
        const fit = (containerWidth - 32) / pdfNaturalWidthRef.current
        fitScaleRef.current = fit
        const fh = Math.round(pdfNaturalHeightRef.current * fit + 32)
        setFitViewerHeight(fh)
        onFitHeightChangeRef.current?.(fh)
    }, [containerWidth])

    const isSnippingMode = useCanvasStore((s) => s.isSnippingMode)
    const setIsSnippingMode = useCanvasStore((s) => s.setIsSnippingMode)

    // Snipping State
    const [snipStart, setSnipStart] = useState<{ x: number, y: number } | null>(null)
    const [snipCurrent, setSnipCurrent] = useState<{ x: number, y: number } | null>(null)
    const [isExtracting, setIsExtracting] = useState(false)
    const [snipErrorMsg, setSnipErrorMsg] = useState<string | null>(null)

    // Handle Escape to exit snipping mode.
    // NOTE: Ctrl+Shift+S is handled ONLY by the global handler in Canvas.tsx.
    // Having a second handler here caused a double-toggle race condition
    // (Zustand's synchronous set meant the Canvas handler read the already-
    // flipped value and toggled it back, making snipping mode appear broken
    // in PDF view).
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isSnippingMode) {
                setIsSnippingMode(false)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isSnippingMode, setIsSnippingMode])

    // ── Zoom helper — call before setScale to schedule scroll correction ─────
    // Returns a function that applies the scroll correction in a rAF.
    // This keeps correctoin synchronous with the scale change (no separate effect).
    const scheduleZoomScroll = useCallback((oldScale: number, newScale: number) => {
        const outer = outerRef.current
        if (!outer || oldScale === newScale) return
        const nW = pdfNaturalWidthRef.current
        const nH = pdfNaturalHeightRef.current
        if (!nW || !nH) return

        // Current page dimensions at oldScale
        const pageCW = nW * oldScale
        const pageCH = nH * oldScale
        // Page card left edge in scroll coords.
        // With the inner-wrapper centering approach:
        //   - overflow: cardLeft = 16 (wrapper padding)
        //   - no overflow: cardLeft = (outer.clientWidth - pageCW) / 2
        const cardLeft = Math.max(16, (outer.clientWidth - pageCW) / 2)
        const cardTop = 16  // always 16 px (wrapper padding-top)

        // Center of visible viewport in page-local coordinates
        const viewCxInPage = outer.scrollLeft + outer.clientWidth / 2 - cardLeft
        const viewCyInPage = outer.scrollTop + outer.clientHeight / 2 - cardTop
        // Fractional position on the page (safe even outside 0-1)
        const fracX = pageCW > 0 ? viewCxInPage / pageCW : 0.5
        const fracY = pageCH > 0 ? viewCyInPage / pageCH : 0.5

        requestAnimationFrame(() => {
            const newPageCW = nW * newScale
            const newPageCH = nH * newScale
            const newCardLeft = Math.max(16, (outer.clientWidth - newPageCW) / 2)
            outer.scrollLeft = fracX * newPageCW + newCardLeft - outer.clientWidth / 2
            outer.scrollTop = fracY * newPageCH + cardTop - outer.clientHeight / 2
        })
    }, [])


    // ── Helpers ──────────────────────────────────────────────────────────────
    const goToPage = useCallback((p: number) => {
        const newPage = Math.max(1, Math.min(numPages, p))
        setCurrentPage(newPage)
        // Notify parent component when page changes (for syncing with canvas store)
        onPageChange?.(newPage)
    }, [numPages, onPageChange])

    const handlePageClick = useCallback(() => {
        setPageInputValue(String(currentPage))
        setIsEditingPage(true)
    }, [currentPage])

    const handlePageSubmit = useCallback(() => {
        const n = parseInt(pageInputValue, 10)
        if (!isNaN(n) && n >= 1 && n <= numPages) {
            setCurrentPage(n)
            // Notify parent component when page changes (for syncing with canvas store)
            onPageChange?.(n)
        }
        setIsEditingPage(false)
    }, [pageInputValue, numPages, onPageChange])

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        if (isSnippingMode) return // Handled by Snipping overlay
        const selection = window.getSelection()
        const text = selection?.toString().trim() ?? ''
        console.log('[PDFViewer handleMouseUp] Text length:', text.length, 'rangeCount:', selection?.rangeCount)
        if (text.length >= 3 && selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            console.log('[PDFViewer handleMouseUp] triggering onTextSelection with:', rect)
            onTextSelection?.(text, rect, { x: e.clientX, y: e.clientY })
        }
    }, [onTextSelection, isSnippingMode])

    // ── Snipping Tool Handlers ───────────────────────────────────────────────
    const handleSnipMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = pageContainerRef.current?.getBoundingClientRect()
        if (!rect) return
        setSnipStart({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        })
        setSnipCurrent({
            x: e.clientX - rect.left,
            y: Math.max(0, e.clientY - rect.top) // constrain to page
        })
    }

    const handleSnipMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!snipStart) return
        const rect = pageContainerRef.current?.getBoundingClientRect()
        if (!rect) return
        setSnipCurrent({
            x: e.clientX - rect.left,
            y: Math.max(0, e.clientY - rect.top) // constrain to page
        })
    }

    const handleSnipMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!snipStart || !snipCurrent || !canvasRef.current) {
            setSnipStart(null)
            setSnipCurrent(null)
            return
        }

        const clientX = e.clientX
        const clientY = e.clientY

        const x = Math.min(snipStart.x, snipCurrent.x)
        const y = Math.min(snipStart.y, snipCurrent.y)
        const width = Math.max(10, Math.abs(snipStart.x - snipCurrent.x))
        const height = Math.max(10, Math.abs(snipStart.y - snipCurrent.y))
        const dpr = window.devicePixelRatio || 1

        setSnipStart(null)
        setSnipCurrent(null)

        // Only process if it's a reasonably sized box (avoids accidental clicks)
        if (width < 20 || height < 20) return

        setIsExtracting(true)
        try {
            // Create a temporary canvas to crop the image
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = Math.floor(width * dpr)
            tempCanvas.height = Math.floor(height * dpr)
            const ctx = tempCanvas.getContext('2d')
            if (!ctx) return

            // Draw the cropped portion from the main PDF canvas
            ctx.drawImage(
                canvasRef.current,
                x * dpr, y * dpr, width * dpr, height * dpr, // Source rect
                0, 0, tempCanvas.width, tempCanvas.height  // Destination rect
            )

            // Convert to base64
            const base64Image = tempCanvas.toDataURL('image/jpeg', 0.9)

            // Send to backend OCR endpoint
            const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
            const response = await fetch(`${API_BASE}/api/vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64Image })
            })

            if (!response.ok) {
                const errBody = await response.json().catch(() => null)
                const detail = errBody?.detail ?? `HTTP ${response.status}`
                throw new Error(detail)
            }

            const data = await response.json()
            if (data.text && data.text.trim().length > 0) {
                // Return to normal mode and trigger selection
                setIsSnippingMode(false)

                const pgRect = pageContainerRef.current?.getBoundingClientRect()
                const domRect = new DOMRect(
                    (pgRect?.left ?? 0) + x,
                    (pgRect?.top ?? 0) + y,
                    width,
                    height
                )

                onTextSelection?.(data.text.trim(), domRect, { x: clientX, y: clientY }, true)
            } else {
                // No text detected — exit snipping mode and tell the user.
                setIsSnippingMode(false)
                setSnipErrorMsg('No text detected — try selecting a larger area with text')
                setTimeout(() => setSnipErrorMsg(null), 3500)
            }
        } catch (err) {
            console.error('[PDFViewer] Vision extract error:', err)
            // Exit snipping mode and surface the error to the user.
            setIsSnippingMode(false)
            const errMsg = err instanceof Error ? err.message : ''
            const isNetworkErr = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('ERR_CONNECTION')
            setSnipErrorMsg(
                isNetworkErr
                    ? 'Cannot reach backend server — is it running on port 8000?'
                    : `Text extraction failed: ${errMsg || 'check connection and try again'}`
            )
            setTimeout(() => setSnipErrorMsg(null), 5000)
        } finally {
            setIsExtracting(false)
        }
    }

    if (isLoading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading PDF...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <div className="text-center text-red-600">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className={`flex flex-col ${className}`}>
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0 gap-2 relative">
                {/* Zoom */}
                <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-xs text-gray-500">Zoom:</span>
                    <input
                        type="range"
                        min="25"
                        max="300"
                        value={scale !== null ? Math.round(scale * 100) : 100}
                        onChange={(e) => {
                            const newScale = parseInt(e.target.value, 10) / 100
                            if (scale !== null) scheduleZoomScroll(scale, newScale)
                            setScale(newScale)
                        }}
                        className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 min-w-[36px]">
                        {scale !== null ? Math.round(scale * 100) : 100}%
                    </span>
                    <button
                        onClick={() => {
                            if (outerRef.current) {
                                outerRef.current.scrollLeft = 0
                                outerRef.current.scrollTop = 0
                            }
                            setScale(fitScaleRef.current)
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 px-1 leading-none"
                        title="Reset zoom to fit width"
                    >↺</button>
                </div>

                {/* Custom Toolbar Middle */}
                {customToolbarMiddle && (
                    <div className="flex-shrink-0 flex justify-center">
                        {customToolbarMiddle}
                    </div>
                )}

                {/* Page navigation */}
                <div className="flex items-center justify-end gap-1 flex-1">
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-600 transition-colors"
                        title="Previous page"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="text-xs text-gray-500">
                        {numPages > 0 && (isEditingPage ? (
                            <input
                                type="text"
                                value={pageInputValue}
                                onChange={(e) => setPageInputValue(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handlePageSubmit()
                                    if (e.key === 'Escape') setIsEditingPage(false)
                                }}
                                onBlur={handlePageSubmit}
                                autoFocus
                                className="w-10 px-1 py-0.5 text-xs border border-indigo-300 rounded text-center"
                            />
                        ) : (
                            <span
                                className="cursor-pointer hover:text-indigo-600 select-none"
                                onClick={handlePageClick}
                                title="Click to jump to page"
                            >
                                {currentPage}&nbsp;/&nbsp;{numPages}
                            </span>
                        ))}
                    </div>
                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= numPages}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-600 transition-colors"
                        title="Next page"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Single page viewport ──
              * Height is controlled by viewerHeightProp (ContentNode override)
              * or falls back to fitViewerHeight (auto from fit scale at load time).
              * The scroll container is locked to this height so zoom / container-
              * width changes never expand the panel unexpectedly.
              *
              * The INNER wrapper (minWidth:100%) guarantees the page card is
              * always horizontally centred and that scroll-coordinate math is
              * exact: cardLeft = max(16, (outer.clientWidth - pageW) / 2).
              */}
            <div
                ref={outerRef}
                className="overflow-auto bg-gray-100 nopan flex-shrink-0"
                style={{ height: `${viewerHeightProp ?? fitViewerHeight}px` }}
                onMouseUp={handleMouseUp}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Inner centering wrapper — must be ≥ scroll-container width.
                  * Uses width:fit-content + margin:0 auto on the page card instead of
                  * justify-content:center to avoid the well-known CSS issue where
                  * centered overflow content becomes unreachable on the start side.
                  * minWidth is computed declaratively from scale so the scroll range
                  * is correct even before the render useEffect updates the page card.
                  */}
                <div style={{
                    minWidth: pdfNaturalWidthRef.current && scale
                        ? `max(100%, ${Math.ceil(pdfNaturalWidthRef.current * scale) + 32}px)`
                        : '100%',
                    width: 'fit-content',
                    padding: 16,
                    boxSizing: 'border-box',
                }}>
                    <div
                        ref={pageContainerRef}
                        className="relative shadow-lg bg-white"
                        style={{ userSelect: 'text', margin: '0 auto' }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{ display: 'block' }}
                        />
                        {/* Text layer: transparent positioned spans */}
                        <div
                            ref={textLayerRef}
                            className="textLayer absolute top-0 left-0"
                            style={{
                                overflow: 'hidden',
                                pointerEvents: isSnippingMode ? 'none' : 'auto',
                                userSelect: isSnippingMode ? 'none' : 'text',
                                zIndex: 10,
                                opacity: 1,
                            }}
                        />

                        {/* Snipping Tool Overlay */}
                        {isSnippingMode && (
                            <div
                                className={`absolute top-0 left-0 w-full h-full z-20 ${isExtracting ? 'cursor-wait' : 'cursor-crosshair'}`}
                                style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
                                onMouseDown={!isExtracting ? handleSnipMouseDown : undefined}
                                onMouseMove={!isExtracting ? handleSnipMouseMove : undefined}
                                onMouseUp={!isExtracting ? handleSnipMouseUp : undefined}
                                onMouseLeave={!isExtracting ? handleSnipMouseUp : undefined}
                            >
                                {snipStart && snipCurrent && (
                                    <div
                                        className="absolute border-2 border-indigo-500 bg-indigo-500/20"
                                        style={{
                                            left: Math.min(snipStart.x, snipCurrent.x),
                                            top: Math.min(snipStart.y, snipCurrent.y),
                                            width: Math.abs(snipStart.x - snipCurrent.x),
                                            height: Math.abs(snipStart.y - snipCurrent.y),
                                        }}
                                    />
                                )}
                                {isExtracting && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-30">
                                        <div className="bg-white p-4 rounded-lg shadow-xl flex items-center gap-3">
                                            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-sm font-medium text-gray-700">Extracting text with Vision AI...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Snip error toast — shown briefly after a failed OCR attempt */}
                        {snipErrorMsg && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-gray-800 text-white text-xs font-medium rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
                                {snipErrorMsg}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
