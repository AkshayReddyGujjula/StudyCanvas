import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface PDFViewerProps {
    pdfData: ArrayBuffer
    onTextSelection?: (text: string) => void
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
    const pdfNaturalWidthRef  = useRef<number>(0)
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
                pdfNaturalWidthRef.current  = vp.width
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

                // Canvas — HiDPI
                const dpr = window.devicePixelRatio || 1
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

    // ── Recalculate fit scale when container width changes ───────────────────
    // NOTE: we deliberately do NOT call setFitViewerHeight here so that a node
    // width resize never causes the viewer height to change (independent axes).
    // fitViewerHeight is only set at load time. If the user ↺ resets zoom the
    // scale updates and the rendered page fills the new width correctly.
    useEffect(() => {
        if (!pdfNaturalWidthRef.current || !containerWidth) return
        const fit = (containerWidth - 32) / pdfNaturalWidthRef.current
        fitScaleRef.current = fit
    }, [containerWidth])

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
        const cardTop  = 16  // always 16 px (wrapper padding-top)

        // Center of visible viewport in page-local coordinates
        const viewCxInPage = outer.scrollLeft + outer.clientWidth  / 2 - cardLeft
        const viewCyInPage = outer.scrollTop  + outer.clientHeight / 2 - cardTop
        // Fractional position on the page (safe even outside 0-1)
        const fracX = pageCW > 0 ? viewCxInPage / pageCW : 0.5
        const fracY = pageCH > 0 ? viewCyInPage / pageCH : 0.5

        requestAnimationFrame(() => {
            const newPageCW   = nW * newScale
            const newPageCH   = nH * newScale
            const newCardLeft = Math.max(16, (outer.clientWidth - newPageCW) / 2)
            outer.scrollLeft  = fracX * newPageCW + newCardLeft - outer.clientWidth  / 2
            outer.scrollTop   = fracY * newPageCH + cardTop     - outer.clientHeight / 2
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

    const handleMouseUp = useCallback(() => {
        const text = window.getSelection()?.toString().trim() ?? ''
        if (text.length >= 3) onTextSelection?.(text)
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
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0 gap-2">
                {/* Zoom */}
                <div className="flex items-center gap-1.5">
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
                                outerRef.current.scrollTop  = 0
                            }
                            setScale(fitScaleRef.current)
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 px-1 leading-none"
                        title="Reset zoom to fit width"
                    >↺</button>
                </div>

                {/* Page navigation */}
                <div className="flex items-center gap-1">
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
            >
                {/* Inner centering wrapper — must be ≥ scroll-container width */}
                <div style={{
                    minWidth: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    padding: 16,
                    boxSizing: 'border-box',
                }}>
                    <div
                        ref={pageContainerRef}
                        className="relative shadow-lg bg-white"
                        style={{ userSelect: 'text' }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{ display: 'block' }}
                        />
                        {/* Text layer: transparent positioned spans */}
                        <div
                            ref={textLayerRef}
                            className="pdf-text-layer absolute top-0 left-0"
                            style={{
                                overflow: 'hidden',
                                pointerEvents: 'auto',
                                userSelect: 'text',
                                zIndex: 10,
                                lineHeight: 1,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
