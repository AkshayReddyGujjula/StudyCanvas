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
    /** Called when the zoom scale changes (for persisting viewer state). */
    onZoomChange?: (scale: number) => void
    initialPage?: number
    /** Optional initial zoom scale to restore (overrides fit-to-width). */
    initialScale?: number
    scrollPositions?: Record<number, number>
    onScrollPositionChange?: (page: number, position: number) => void
    className?: string
    containerWidth?: number
    /** Optional override: ContentNode-controlled viewer height (px). */
    viewerHeight?: number
    autoAsk?: boolean
    /** Rendered in the middle of the toolbar */
    customToolbarMiddle?: React.ReactNode
    /** Whether the PDF viewer node is locked (no move/resize) */
    isLocked?: boolean
    /** Toggle lock state */
    onLockToggle?: () => void
    /** Initial render DPR (resolution quality) */
    initialRenderDpr?: number
    /** Called when render DPR changes */
    onRenderDprChange?: (dpr: number) => void
}

export default function PDFViewer({
    pdfData,
    onTextSelection,
    onLoad,
    onFitHeightChange,
    onPageChange,
    onZoomChange,
    initialPage = 1,
    initialScale,
    className = '',
    containerWidth: initialContainerWidth,
    customToolbarMiddle,
    isLocked = false,
    onLockToggle,
    initialRenderDpr,
    onRenderDprChange,
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
    const [, setFitViewerHeight] = useState<number>(600)
    // Natural (unscaled) PDF page dimensions — needed for accurate zoom-to-center math.
    const pdfNaturalWidthRef = useRef<number>(0)
    const pdfNaturalHeightRef = useRef<number>(0)
    const [containerWidth, setContainerWidth] = useState<number | undefined>(initialContainerWidth)

    // ── Resolution quality (DPR) ─────────────────────────────────────────────
    const nativeDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    const minDpr = Math.max(Math.round(nativeDpr * 5) / 10, 1) // half native, min 1, rounded to 0.5
    const maxDpr = 6
    const defaultDpr = initialRenderDpr ?? Math.max(nativeDpr, 4)
    const [renderDpr, setRenderDpr] = useState<number>(Math.min(Math.max(defaultDpr, minDpr), maxDpr))
    const onRenderDprChangeRef = useRef(onRenderDprChange)
    useEffect(() => { onRenderDprChangeRef.current = onRenderDprChange }, [onRenderDprChange])

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
    const initialScaleRef = useRef(initialScale)
    useEffect(() => { initialScaleRef.current = initialScale }, [initialScale])
    const onZoomChangeRef = useRef(onZoomChange)
    useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])

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
                // Use restored scale if provided, otherwise fit-to-width
                const startScale = initialScaleRef.current ?? fit
                setScale(startScale)
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

    // ── Block wheel events from reaching React Flow ───────────────────────────
    // React synthetic `onWheel` fires at the #root delegate (after all native
    // bubble handlers), so by then React Flow has already processed the event.
    // Attaching a native listener on the scroll container stops propagation
    // before the event reaches any ancestor listener.
    useEffect(() => {
        const el = outerRef.current
        if (!el) return
        const handler = (e: WheelEvent) => {
            e.stopPropagation()
        }
        el.addEventListener('wheel', handler)
        return () => el.removeEventListener('wheel', handler)
    }, [])

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

                // Canvas — HiDPI with user-controlled resolution quality
                const dpr = renderDpr
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
    }, [pdfDoc, currentPage, scale, renderDpr])

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
        const selection = window.getSelection()
        const text = selection?.toString().trim() ?? ''
        console.log('[PDFViewer handleMouseUp] Text length:', text.length, 'rangeCount:', selection?.rangeCount)
        if (text.length >= 3 && selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            console.log('[PDFViewer handleMouseUp] triggering onTextSelection with:', rect)
            onTextSelection?.(text, rect, { x: e.clientX, y: e.clientY })
        }
    }, [onTextSelection])

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
                {/* Left: Zoom controls */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-gray-500 flex-shrink-0">Zoom:</span>
                    <input
                        type="range"
                        min="25"
                        max="300"
                        value={scale !== null ? Math.round(scale * 100) : 100}
                        onChange={(e) => {
                            const newScale = parseInt(e.target.value, 10) / 100
                            if (scale !== null) scheduleZoomScroll(scale, newScale)
                            setScale(newScale)
                            onZoomChangeRef.current?.(newScale)
                        }}
                        className="w-16 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer flex-shrink-0"
                    />
                    <span className="text-xs text-gray-500 min-w-[36px] flex-shrink-0">
                        {scale !== null ? Math.round(scale * 100) : 100}%
                    </span>
                    <button
                        onClick={() => {
                            if (outerRef.current) {
                                outerRef.current.scrollLeft = 0
                                outerRef.current.scrollTop = 0
                            }
                            setScale(fitScaleRef.current)
                            onZoomChangeRef.current?.(fitScaleRef.current)
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 px-1 leading-none flex-shrink-0"
                        title="Reset zoom to fit width"
                    >↺</button>
                </div>

                {/* Centre: View Mode buttons */}
                {customToolbarMiddle && (
                    <div className="flex-shrink-0 flex justify-center">
                        {customToolbarMiddle}
                    </div>
                )}

                {/* Right: Quality + Lock + Page nav */}
                <div className="flex items-center justify-end gap-1.5 min-w-0">
                    {/* Resolution / Quality slider */}
                    <span className="text-xs text-gray-500 flex-shrink-0">Quality:</span>
                    <input
                        type="range"
                        min={minDpr * 10}
                        max={maxDpr * 10}
                        step={5}
                        value={Math.round(renderDpr * 10)}
                        onChange={(e) => {
                            const newDpr = parseInt(e.target.value, 10) / 10
                            setRenderDpr(newDpr)
                            onRenderDprChangeRef.current?.(newDpr)
                        }}
                        className="w-14 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer flex-shrink-0"
                        title={`Render quality: ${renderDpr}x DPR (${minDpr}x min – ${maxDpr}x max)`}
                    />
                    <span className="text-xs text-gray-500 min-w-[24px] flex-shrink-0">
                        {renderDpr.toFixed(1)}x
                    </span>

                    {/* Separator */}
                    <div className="w-px h-4 bg-gray-300 flex-shrink-0" />

                    {/* Lock toggle */}
                    <button
                        onClick={onLockToggle}
                        className={`p-1 rounded transition-colors flex-shrink-0 ${
                            isLocked
                                ? 'bg-indigo-100 text-indigo-600'
                                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                        }`}
                        title={isLocked ? 'Unlock viewer (allow move & resize)' : 'Lock viewer (prevent move & resize)'}
                    >
                        {isLocked ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                        )}
                    </button>

                    {/* Separator */}
                    <div className="w-px h-4 bg-gray-300 flex-shrink-0" />

                    {/* Page navigation */}
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
                className="overflow-auto bg-gray-100 nopan flex-1 min-h-0"
                onMouseUp={handleMouseUp}
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
                    </div>
                </div>
            </div>
        </div>
    )
}
