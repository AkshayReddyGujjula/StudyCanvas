/**
 * canvasExport.ts — Visual canvas export utilities.
 *
 * Captures the ENTIRE canvas (React Flow nodes, edges, DrawingCanvas pen strokes,
 * PDF viewer, text annotations, flashcards, quizzes) as a high-resolution raster
 * screenshot, then assembles images into a downloadable PDF.
 *
 * Strategy:
 *  1. Save the current React Flow viewport.
 *  2. Call fitView() to zoom / pan so ALL nodes for the current page are visible.
 *  3. Wait for React re-render + DrawingCanvas stroke redraw.
 *  4. Temporarily fix flashcards to show only the ANSWER side (3D CSS not supported).
 *  5. Capture the full container (DrawingCanvas + ReactFlow) via html-to-image.
 *  6. Restore flashcards and original viewport.
 *
 * Uses html-to-image for DOM capture (handles SVG edges + canvas strokes) and
 * jsPDF for PDF assembly.
 */

import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import type { AnswerNodeData, QuizQuestionNodeData, FlashcardNodeData, TextNodeData } from '../types'

// ─── Safety constants ────────────────────────────────────────────────────────

/** Maximum number of annotated pages allowed for "Save All" export */
const MAX_EXPORT_PAGES = 50

/** Browser canvas pixel limit per dimension */
const MAX_CANVAS_DIMENSION = 16384

/** Per-page capture timeout in milliseconds */
const PAGE_CAPTURE_TIMEOUT_MS = 30_000

/** Delay after fitView / page navigation to let React + DrawingCanvas settle (ms) */
const SETTLE_DELAY_MS = 800

/** Default capture scale factor (2× for high resolution) */
const DEFAULT_SCALE = 2

/** Maximum pixel ratio used when capturing a tile (prevents out-of-memory at very low zooms).
 *  Quality scales up automatically as zoom decreases, but is hard-capped here. */
const MAX_CAPTURE_SCALE = 8

/** Auto-tile when the full-fit zoom falls below this level — content would be unreadably small.
 *  Raised from 0.2 → 0.5 so that medium-large canvases are also split into tiles,
 *  producing higher-quality PDF output instead of one greatly zoomed-out page. */
const MIN_TILE_ZOOM = 0.5

/** Reference zoom used to calibrate quality scaling.
 *  At this zoom level DEFAULT_SCALE gives acceptable quality;
 *  lower zooms receive proportionally higher scale values. */
const TARGET_TILE_ZOOM = 0.75

/** Fraction of tile HEIGHT shared between adjacent tiles (prevents edge clipping) */
const TILE_OVERLAP = 0.05

// ─── Mutual-exclusion flag ───────────────────────────────────────────────────

let _isExporting = false

export function isExportInProgress(): boolean {
    return _isExporting
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExportProgressCallback {
    (message: string): void
}

interface ViewportState {
    x: number
    y: number
    zoom: number
}

export interface ExportOptions {
    /** The root container element (the div wrapping DrawingCanvas + ReactFlow) */
    containerEl: HTMLElement
    /** Filename base (without extension) for the downloaded PDF */
    filenameBase: string
    /** Callback to show progress messages to the user */
    onProgress?: ExportProgressCallback
    /** AbortSignal for cancellation support */
    signal?: AbortSignal
    /** React Flow fitView — zooms / pans so every visible node fills the viewport */
    fitView: (opts?: { padding?: number; duration?: number }) => void
    /** React Flow getViewport — returns current { x, y, zoom } */
    getViewport: () => ViewportState
    /** React Flow setViewport — restores a previously saved viewport */
    setViewport: (vp: ViewportState, opts?: { duration?: number }) => void
    /** React Flow getNodes — returns all currently rendered nodes with measured dimensions */
    getNodes: () => Node[]
}

export interface ExportAllOptions extends ExportOptions {
    /** Function to navigate to a specific page (1-based) */
    goToPage: (page: number) => void
    /** Total number of pages */
    totalPages: number
    /** Current page index (1-based) to restore after export */
    currentPage: number
    /**
     * Optional explicit list of page numbers (1-based) to export.
     * When provided, these pages are exported directly (no pageHasContent check).
     * When omitted the function checks all pages via pageHasContent as usual.
     */
    overridePagesToExport?: number[]
    /** Optional custom filename suffix (defaults to "AllPages") */
    filenameSuffix?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine whether a given page has any user-created content (annotations,
 * nodes, or drawing strokes).
 */
export function pageHasContent(pageIndex: number): boolean {
    const state = useCanvasStore.getState()
    const { nodes, drawingStrokes } = state

    const hasNodes = nodes.some((n) => {
        if (n.type === 'contentNode') return false
        if (n.type === 'textNode') {
            return (n.data as unknown as TextNodeData).pageIndex === pageIndex
        }
        if (n.type === 'quizQuestionNode') {
            return (n.data as unknown as QuizQuestionNodeData).pageIndex === pageIndex
        }
        if (n.type === 'flashcardNode') {
            return (n.data as unknown as FlashcardNodeData).pageIndex === pageIndex
        }
        if (n.type === 'answerNode') {
            return (n.data as unknown as AnswerNodeData).pageIndex === pageIndex
        }
        return false
    })

    if (hasNodes) return true
    return drawingStrokes.some((s) => s.pageIndex === pageIndex)
}

/** Clamp scale so the output canvas stays within browser limits. */
function computeSafeScale(w: number, h: number, desired: number): number {
    let scale = desired
    const maxDim = Math.max(w, h)
    if (maxDim * scale > MAX_CANVAS_DIMENSION) {
        scale = Math.floor(MAX_CANVAS_DIMENSION / maxDim)
        if (scale < 1) scale = 1
    }
    return scale
}

// ─── Flashcard DOM fix (3D transforms not supported by capture libs) ─────────

/**
 * Temporarily modify all flashcard nodes in the container to show ONLY the
 * ANSWER side, without 3D CSS transforms.
 *
 * Both html-to-image and html2canvas cannot correctly render:
 *   • perspective
 *   • transform-style: preserve-3d
 *   • backface-visibility: hidden
 *   • transform: rotateY(180deg)
 *
 * This function:
 *  1. Removes perspective from .flashcard-scene
 *  2. Removes 3D transform / transform-style from .flashcard-inner
 *  3. Hides the QUESTION face (display: none)
 *  4. Flattens the ANSWER face (transform: none, position: relative)
 *
 * Returns a cleanup function that restores the original styles.
 */
function forceFlashcardAnswers(container: HTMLElement): () => void {
    const restorers: Array<() => void> = []

    container.querySelectorAll('.flashcard-scene').forEach((scene) => {
        const sceneEl = scene as HTMLElement
        const savedPerspective = sceneEl.style.perspective
        sceneEl.style.perspective = 'none'

        const inner = sceneEl.querySelector('.flashcard-inner') as HTMLElement | null
        if (!inner) return

        const savedInnerTransform = inner.style.transform
        const savedInnerTfStyle = inner.style.transformStyle
        inner.style.transform = 'none'
        inner.style.transformStyle = 'flat'

        const front = inner.querySelector(
            '.flashcard-face:not(.flashcard-face-back)',
        ) as HTMLElement | null
        const back = inner.querySelector('.flashcard-face-back') as HTMLElement | null

        const savedFrontDisplay = front?.style.display ?? ''
        const savedBackTransform = back?.style.transform ?? ''
        const savedBackBfv = back?.style.backfaceVisibility ?? ''
        const savedBackPosition = back?.style.position ?? ''

        if (front) front.style.display = 'none'
        if (back) {
            back.style.transform = 'none'
            back.style.backfaceVisibility = 'visible'
                ; (back.style as unknown as Record<string, string>).webkitBackfaceVisibility = 'visible'
            back.style.position = 'relative'
        }

        restorers.push(() => {
            sceneEl.style.perspective = savedPerspective
            inner.style.transform = savedInnerTransform
            inner.style.transformStyle = savedInnerTfStyle
            if (front) front.style.display = savedFrontDisplay
            if (back) {
                back.style.transform = savedBackTransform
                back.style.backfaceVisibility = savedBackBfv
                    ; (back.style as unknown as Record<string, string>).webkitBackfaceVisibility = ''
                back.style.position = savedBackPosition
            }
        })
    })

    return () => restorers.forEach((fn) => fn())
}

// ─── Content bounds (nodes + strokes) ───────────────────────────────────────

interface ContentBounds {
    minX: number
    minY: number
    maxX: number
    maxY: number
}

/**
 * Compute the axis-aligned bounding box (in React Flow *flow* coordinates) of
 * all content on a given page: React Flow nodes + DrawingCanvas strokes.
 *
 * Returns null if no content is found.
 */
function computeContentBounds(pageIndex: number, rfNodes: Node[]): ContentBounds | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    const expand = (x: number, y: number) => {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }

    // ── React Flow nodes ──────────────────────────────────────────────────
    for (const node of rfNodes) {
        const nx = node.position.x
        const ny = node.position.y
        // Use measured dimensions when available; fall back to style or defaults
        const nw: number =
            (node.measured?.width as number | undefined) ??
            (node.width as number | undefined) ??
            (node.style?.width as number | undefined) ??
            200
        const nh: number =
            (node.measured?.height as number | undefined) ??
            (node.height as number | undefined) ??
            (node.style?.height as number | undefined) ??
            100
        expand(nx, ny)
        expand(nx + nw, ny + nh)
    }

    // ── Drawing strokes ───────────────────────────────────────────────────
    const { drawingStrokes, nodes: storeNodes } = useCanvasStore.getState()
    const pageStrokes = drawingStrokes.filter((s) => s.pageIndex === pageIndex)

    for (const stroke of pageStrokes) {
        // Determine offset: node-attached strokes have points relative to the node
        let ox = 0, oy = 0
        if (stroke.nodeId) {
            const attachedNode = storeNodes.find((n) => n.id === stroke.nodeId)
            if (attachedNode) {
                ox = attachedNode.position.x
                oy = attachedNode.position.y
            } else {
                // Node deleted — use recorded fallback offset
                ox = stroke.nodeOffset?.x ?? 0
                oy = stroke.nodeOffset?.y ?? 0
            }
        }
        for (const pt of stroke.points) {
            expand(pt.x + ox, pt.y + oy)
        }
    }

    if (!isFinite(minX)) return null
    return { minX, minY, maxX, maxY }
}

/**
 * Compute the React Flow viewport {x, y, zoom} that fits the given flow-coord
 * bounds into a container of (cw × ch) pixels with `padding` fractional margin
 * (e.g. 0.08 = 8% padding on each side).
 */
function viewportForBounds(
    bounds: ContentBounds,
    cw: number,
    ch: number,
    padding: number,
): ViewportState {
    const bW = bounds.maxX - bounds.minX
    const bH = bounds.maxY - bounds.minY
    if (bW <= 0 || bH <= 0) return { x: 0, y: 0, zoom: 1 }

    const usableW = cw * (1 - 2 * padding)
    const usableH = ch * (1 - 2 * padding)
    const zoom = Math.min(usableW / bW, usableH / bH)

    const midFlowX = bounds.minX + bW / 2
    const midFlowY = bounds.minY + bH / 2

    return {
        zoom,
        x: cw / 2 - midFlowX * zoom,
        y: ch / 2 - midFlowY * zoom,
    }
}

// ─── Tiling planner ───────────────────────────────────────────────────────────

interface TileViewport extends ViewportState {
    /** Human-readable label e.g. "row 1 col 2" for progress messages */
    label: string
}

/**
 * After calling fitView(), compute all viewport positions needed to capture
 * the entire canvas content (nodes + strokes).
 *
 * Returns an array of TileViewport objects:
 *   • Exactly 1 entry  → normal single-page export (zoom is comfortable)
 *   • Multiple entries → content is very large; each entry is a tile that
 *                        covers a portion of the canvas at TARGET_TILE_ZOOM
 *
 * Tiling is triggered automatically when the full-fit zoom would fall below
 * MIN_TILE_ZOOM (content would be unreadably tiny in a single-page PDF).
 */
async function prepareViewportAndPlan(
    pageIndex: number,
    getNodes: () => Node[],
    containerEl: HTMLElement,
    fitView: (opts?: { padding?: number; duration?: number }) => void,
    getViewport: () => ViewportState,
    setViewport: (vp: ViewportState, opts?: { duration?: number }) => void,
): Promise<TileViewport[]> {
    const cw = containerEl.offsetWidth
    const ch = containerEl.offsetHeight

    // ── 1. Standard fitView (node-only) ─────────────────────────────────────
    fitView({ padding: 0.10, duration: 0 })
    await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS))

    // ── 2. Expand bounds to include drawing strokes ──────────────────────────
    const rfNodes = getNodes()
    const bounds = computeContentBounds(pageIndex, rfNodes)

    if (!bounds) {
        // No content — return current viewport as single tile
        const vp = getViewport()
        return [{ ...vp, label: 'full canvas' }]
    }

    // Build full-fit viewport from the union bounds (nodes + strokes)
    const fullFitVp = viewportForBounds(bounds, cw, ch, 0.08)

    // ── 3. Decide: single page or tiled? ─────────────────────────────────────
    if (fullFitVp.zoom >= MIN_TILE_ZOOM) {
        // Content fits comfortably; use full-fit viewport (strokes now included)
        setViewport(fullFitVp, { duration: 0 })
        await new Promise((r) => setTimeout(r, 500))
        return [{ ...fullFitVp, label: 'full canvas' }]
    }

    // ── 4. Large canvas: build HORIZONTAL-ONLY tile strips ─────────────────
    //
    // Tiles are split only by HEIGHT (rows), never by width (cols = 1).
    // Each strip shows the FULL content width — no vertical dividers in the PDF.
    // The zoom is chosen to make the entire content width visible in the viewport.
    const contentW = bounds.maxX - bounds.minX
    const contentH = bounds.maxY - bounds.minY

    // Compute the zoom that fits the full content width into the viewport
    // (with a small 5 % horizontal padding on each side).
    const tilePadding = 0.05
    const zoomForWidth = (cw * (1 - 2 * tilePadding)) / contentW
    // Never go below a tiny minimum that would produce a blank capture.
    const tileZoom = Math.max(zoomForWidth, 0.02)

    // Visible height per tile strip at this zoom
    const visH = ch / tileZoom

    // Step between strip origins (overlap prevents content being clipped at edges)
    const stepH = visH * (1 - TILE_OVERLAP)
    const rows = Math.max(1, Math.ceil(contentH / stepH))

    // Safety cap — never exceed MAX_EXPORT_PAGES tiles
    if (rows > MAX_EXPORT_PAGES) {
        // Fall back to a single low-zoom page rather than exploding page count
        console.warn(
            `[canvasExport] Strip count ${rows} exceeds MAX_EXPORT_PAGES; falling back to single-page.`,
        )
        setViewport(fullFitVp, { duration: 0 })
        await new Promise((r) => setTimeout(r, 500))
        return [{ ...fullFitVp, label: 'full canvas (scaled)' }]
    }

    const tiles: TileViewport[] = []

    // Horizontal centre of content — all strips share the same X pan
    const centerFlowX = bounds.minX + contentW / 2

    // Vertically centre the strip grid on the content bounds
    const gridH = rows * stepH + visH * TILE_OVERLAP
    const originY = bounds.minY - (gridH - contentH) / 2

    for (let r = 0; r < rows; r++) {
        const tileFlowTop = originY + r * stepH
        tiles.push({
            zoom: tileZoom,
            // X: keep content horizontally centred in the viewport
            x: cw / 2 - centerFlowX * tileZoom,
            // Y: position this strip at the top of the viewport
            y: -tileFlowTop * tileZoom,
            label: rows > 1 ? `row ${r + 1} of ${rows}` : 'full canvas',
        })
    }

    return tiles
}

// ─── Core capture ────────────────────────────────────────────────────────────

/**
 * Capture the full container (ReactFlow + DrawingCanvas) as a single
 * high-resolution HTMLCanvasElement.
 *
 * Uses html-to-image which:
 *   • Handles SVG elements (React Flow edges / arrows) natively
 *   • Captures <canvas> bitmaps (DrawingCanvas pen strokes) via toDataURL()
 *   • Uses the browser's own renderer (foreignObject) for accurate CSS
 *
 * Automatically:
 *   • Forces flashcards to show only the ANSWER face (restores after capture)
 *   • Excludes UI chrome via the filter option (minimap, controls, toolbars)
 *
 * Prerequisites — caller must have already:
 *   • called fitView() so all nodes are visible
 *   • waited for the settle delay
 */
async function captureContainer(
    container: HTMLElement,
    scale: number,
    signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

    // Temporarily force flashcards to show only the answer face
    const restoreFlashcards = forceFlashcardAnswers(container)

    try {
        const captured = await toCanvas(container, {
            pixelRatio: scale,
            backgroundColor: '#ffffff',
            cacheBust: true,
            // Return `true` to KEEP the element, `false` to exclude it.
            filter: (node: HTMLElement) => {
                if (!node.classList) return true // text nodes, comments, etc.
                // Exclude React Flow chrome
                if (node.classList.contains('react-flow__minimap')) return false
                if (node.classList.contains('react-flow__controls')) return false
                if (node.classList.contains('react-flow__panel')) return false
                if (node.classList.contains('react-flow__attribution')) return false
                // Exclude the temp drawing canvas (live stroke layer)
                if (node.classList.contains('drawing-canvas-temp')) return false
                // Exclude all Tailwind `fixed` overlays (menus, toasts, toolbars, nav)
                if (node.classList.contains('fixed')) return false
                return true
            },
        })

        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
        return captured
    } finally {
        restoreFlashcards()
    }
}

// ─── Image / PDF helpers ─────────────────────────────────────────────────────

/**
 * Convert an HTMLCanvasElement to compressed image bytes **asynchronously** using
 * `canvas.toBlob()`.  This avoids creating a huge base64 data-URL string on the
 * JS heap (which can be 30-40 % larger than the binary) and lets the browser use
 * its native, often hardware-accelerated, JPEG encoder off the main thread.
 *
 * Returns a `Uint8Array` suitable for `jsPDF.addImage()`.
 */
async function canvasToCompressedBytes(
    canvas: HTMLCanvasElement,
    preferJpeg = false,
): Promise<{ data: Uint8Array; format: 'PNG' | 'JPEG'; width: number; height: number }> {
    const width = canvas.width
    const height = canvas.height

    // Helper: blob → Uint8Array (avoids keeping the Blob reference alive)
    const blobToUint8 = async (blob: Blob): Promise<Uint8Array> =>
        new Uint8Array(await blob.arrayBuffer())

    // For multi-page or when explicitly requested, always use JPEG — faster
    // encoding and dramatically smaller memory footprint.
    if (preferJpeg) {
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('toBlob JPEG failed'))),
                'image/jpeg',
                0.92,
            )
        })
        return { data: await blobToUint8(blob), format: 'JPEG', width, height }
    }

    // Single-page: try PNG first, fall back to JPEG if > 10 MB
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob PNG failed'))),
            'image/png',
        )
    })

    if (pngBlob.size < 10_000_000) {
        return { data: await blobToUint8(pngBlob), format: 'PNG', width, height }
    }

    // PNG too large — re-encode as JPEG
    const jpgBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob JPEG fallback failed'))),
            'image/jpeg',
            0.92,
        )
    })
    return { data: await blobToUint8(jpgBlob), format: 'JPEG', width, height }
}

/**
 * Release the pixel buffer backing an HTMLCanvasElement so the browser can
 * reclaim the GPU / CPU memory immediately instead of waiting for GC.
 */
function releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0
    canvas.height = 0
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Export the current canvas page as a single-page PDF.
 * Fits all nodes into view first so off-screen content is captured.
 * Returns a Blob of the PDF, or null if the page has no content.
 */
export async function exportCurrentPage(options: ExportOptions): Promise<Blob | null> {
    if (_isExporting) throw new Error('An export is already in progress')

    const { containerEl, filenameBase, onProgress, signal, fitView, getViewport, setViewport, getNodes } = options
    const currentPage = useCanvasStore.getState().currentPage

    if (!pageHasContent(currentPage)) return null

    _isExporting = true
    const savedViewport = getViewport()

    try {
        onProgress?.('Preparing canvas for capture…')

        const w = containerEl.offsetWidth
        const h = containerEl.offsetHeight

        // ── 1. Plan viewport tiles (includes drawing strokes in bounds) ────
        //    prepareViewportAndPlan calls fitView, expands the bounding box to
        //    include all pen/highlighter strokes, then splits into HORIZONTAL
        //    strips only if the canvas is too tall to render at a readable zoom.
        const tiles = await prepareViewportAndPlan(
            currentPage, getNodes, containerEl, fitView, getViewport, setViewport,
        )
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

        // ── 2. Capture each tile and assemble into a PDF ──────────────────
        let doc: jsPDF | null = null

        for (let t = 0; t < tiles.length; t++) {
            const tile = tiles[t]

            if (tiles.length > 1) {
                onProgress?.(`Capturing strip ${t + 1} of ${tiles.length} (${tile.label})…`)
            } else {
                onProgress?.('Capturing canvas…')
            }

            // Position viewport for this tile; wait for DrawingCanvas to redraw
            setViewport(tile, { duration: 0 })
            await new Promise((r) => setTimeout(r, 500))
            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            // Quality scales up as the zoom decreases so small content stays sharp.
            // At TARGET_TILE_ZOOM the default scale is used; below that it increases
            // proportionally, capped at MAX_CAPTURE_SCALE to prevent OOM.
            const desiredScale = Math.max(
                DEFAULT_SCALE,
                Math.round(DEFAULT_SCALE * TARGET_TILE_ZOOM / tile.zoom),
            )
            const scale = computeSafeScale(w, h, Math.min(desiredScale, MAX_CAPTURE_SCALE))

            const capturePromise = captureContainer(containerEl, scale, signal)
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Capture timed out')), PAGE_CAPTURE_TIMEOUT_MS),
            )
            const canvas = await Promise.race([capturePromise, timeoutPromise])
            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            const preferJpeg = tiles.length > 1
            const imgData = await canvasToCompressedBytes(canvas, preferJpeg)
            releaseCanvas(canvas)

            if (!doc) {
                doc = new jsPDF({
                    orientation: imgData.width >= imgData.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [imgData.width, imgData.height],
                    compress: true,
                })
            } else {
                doc.addPage(
                    [imgData.width, imgData.height],
                    imgData.width >= imgData.height ? 'landscape' : 'portrait',
                )
            }
            doc.addImage(imgData.data, imgData.format, 0, 0, imgData.width, imgData.height)
        }

        if (!doc) throw new Error('Capture produced no output')

        onProgress?.('Building PDF…')
        const suffix = tiles.length > 1 ? `-strips(${tiles.length}pages)` : ''
        const blob = doc.output('blob')
        triggerDownload(blob, `${filenameBase}-Page${currentPage}${suffix}.pdf`)
        onProgress?.('Done!')
        return blob
    } finally {
        // Restore original zoom / pan
        setViewport(savedViewport, { duration: 0 })
        _isExporting = false
    }
}

/**
 * Export all annotated pages as a multi-page PDF.
 *
 * **Optimised for memory** — each page is captured, compressed to JPEG bytes
 * via the async `canvas.toBlob()` API, added to the jsPDF document immediately,
 * and then the source canvas's pixel buffer is released.  This means only ONE
 * uncompressed bitmap + ONE compressed JPEG buffer exist at any given time,
 * instead of accumulating every capture in a giant array.
 *
 * The event loop is yielded between pages (`setTimeout(0)`) so the browser
 * never triggers the "Page Unresponsive" dialog, even for 50-page exports.
 *
 * Returns a Blob, or null if no pages have content.
 */
export async function exportAllPages(options: ExportAllOptions): Promise<Blob | null> {
    if (_isExporting) throw new Error('An export is already in progress')

    const {
        containerEl, filenameBase, onProgress, signal,
        goToPage, totalPages, currentPage: originalPage,
        fitView, getViewport, setViewport, getNodes,
        overridePagesToExport, filenameSuffix,
    } = options

    // Build list of annotated pages — use override if provided, otherwise scan all pages
    let annotatedPages: number[]
    if (overridePagesToExport && overridePagesToExport.length > 0) {
        annotatedPages = overridePagesToExport
    } else {
        annotatedPages = []
        for (let p = 1; p <= totalPages; p++) {
            if (pageHasContent(p)) annotatedPages.push(p)
        }
    }
    if (annotatedPages.length === 0) return null

    if (annotatedPages.length > MAX_EXPORT_PAGES) {
        throw new Error(
            `Too many pages to export (${annotatedPages.length}). Maximum is ${MAX_EXPORT_PAGES}. ` +
            'Please reduce annotations or export individual pages.',
        )
    }

    _isExporting = true
    const savedViewport = getViewport()

    try {
        const w = containerEl.offsetWidth
        const h = containerEl.offsetHeight

        // ── Incremental PDF assembly ───────────────────────────────────────
        // The jsPDF document is created lazily when the first page is captured
        // and each subsequent page is added immediately — nothing accumulates.
        let doc: jsPDF | null = null
        let capturedCount = 0

        for (let i = 0; i < annotatedPages.length; i++) {
            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            const pageNum = annotatedPages[i]
            onProgress?.(`Preparing page ${pageNum} (${i + 1} of ${annotatedPages.length})…`)

            // Navigate to the page → new visible nodes + strokes
            goToPage(pageNum)
            await new Promise((r) => setTimeout(r, 300))

            // Build tile plan for this page (handles stroke bounds + auto-tiling)
            const tiles = await prepareViewportAndPlan(
                pageNum, getNodes, containerEl, fitView, getViewport, setViewport,
            )

            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            try {
                for (let t = 0; t < tiles.length; t++) {
                    const tile = tiles[t]

                    if (tiles.length > 1) {
                        onProgress?.(
                            `Page ${pageNum} (${i + 1}/${annotatedPages.length}) — tile ${t + 1}/${tiles.length}…`,
                        )
                    } else {
                        onProgress?.(`Capturing page ${pageNum} (${i + 1} of ${annotatedPages.length})…`)
                    }

                    setViewport(tile, { duration: 0 })
                    await new Promise((r) => setTimeout(r, 500))
                    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

                    // Quality scales up as the zoom decreases — same formula as single-page.
                    // For multi-page exports we use a slightly lower cap to stay within
                    // memory budget across many pages.
                    const desiredScale = Math.max(
                        DEFAULT_SCALE,
                        Math.round(DEFAULT_SCALE * TARGET_TILE_ZOOM / tile.zoom),
                    )
                    const tileScale = computeSafeScale(w, h, Math.min(desiredScale, MAX_CAPTURE_SCALE - 2))

                    const capturePromise = captureContainer(containerEl, tileScale, signal)
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`Capture timed out for page ${pageNum} tile ${t + 1}`)),
                            PAGE_CAPTURE_TIMEOUT_MS,
                        ),
                    )
                    const canvas = await Promise.race([capturePromise, timeoutPromise])

                    // ★ Async JPEG compression — no base64 string in the JS heap
                    const imgData = await canvasToCompressedBytes(canvas, /* preferJpeg */ true)
                    // ★ Release canvas pixel buffer immediately (~33 MB per page at 2×)
                    releaseCanvas(canvas)

                    // ★ Add to PDF document incrementally
                    if (!doc) {
                        doc = new jsPDF({
                            orientation: imgData.width >= imgData.height ? 'landscape' : 'portrait',
                            unit: 'px',
                            format: [imgData.width, imgData.height],
                            compress: true,
                        })
                    } else {
                        doc.addPage(
                            [imgData.width, imgData.height],
                            imgData.width >= imgData.height ? 'landscape' : 'portrait',
                        )
                    }
                    doc.addImage(imgData.data, imgData.format, 0, 0, imgData.width, imgData.height)
                    capturedCount++

                    // ★ Yield to event loop — prevents "Page Unresponsive" dialog
                    await new Promise((r) => setTimeout(r, 0))
                }
            } catch (err) {
                console.warn(`[canvasExport] Failed to capture page ${pageNum}:`, err)
                onProgress?.(`Warning: Failed to capture page ${pageNum}, skipping…`)
                await new Promise((r) => setTimeout(r, 500))
            }
        }

        if (!doc || capturedCount === 0) throw new Error('All page captures failed')
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

        onProgress?.('Building PDF…')

        const blob = doc.output('blob')

        triggerDownload(blob, `${filenameBase}-${filenameSuffix ?? 'AllPages'}.pdf`)
        onProgress?.('Done!')
        return blob
    } finally {
        try { goToPage(originalPage) } catch { /* best-effort */ }
        setViewport(savedViewport, { duration: 0 })
        _isExporting = false
    }
}
