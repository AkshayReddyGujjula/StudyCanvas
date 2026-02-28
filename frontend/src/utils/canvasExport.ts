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
import { useCanvasStore } from '../store/canvasStore'
import type { AnswerNodeData, QuizQuestionNodeData, FlashcardNodeData, TextNodeData } from '../types'

// ─── Safety constants ────────────────────────────────────────────────────────

/** Maximum number of annotated pages allowed for "Save All" export */
const MAX_EXPORT_PAGES = 50

/** Browser canvas pixel limit per dimension */
const MAX_CANVAS_DIMENSION = 16384

/** Maximum total image memory budget in bytes (1 GB) */
const MAX_MEMORY_BYTES = 1_073_741_824

/** Per-page capture timeout in milliseconds */
const PAGE_CAPTURE_TIMEOUT_MS = 30_000

/** Delay after fitView / page navigation to let React + DrawingCanvas settle (ms) */
const SETTLE_DELAY_MS = 800

/** Default capture scale factor (2× for high resolution) */
const DEFAULT_SCALE = 2

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
}

export interface ExportAllOptions extends ExportOptions {
    /** Function to navigate to a specific page (1-based) */
    goToPage: (page: number) => void
    /** Total number of pages */
    totalPages: number
    /** Current page index (1-based) to restore after export */
    currentPage: number
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

/** Lower scale when total memory across multiple pages would exceed budget. */
function computeSafeScaleMulti(w: number, h: number, numPages: number, desired: number): number {
    let scale = computeSafeScale(w, h, desired)
    const estimatedBytes = w * h * 4 * scale * scale * numPages
    if (estimatedBytes > MAX_MEMORY_BYTES && scale > 1) {
        scale = 1
        const recheck = w * h * 4 * numPages
        if (recheck > MAX_MEMORY_BYTES) {
            console.warn(
                `[canvasExport] Estimated memory ${(recheck / 1e9).toFixed(2)} GB at scale=1 for ${numPages} pages`,
            )
        }
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
            ;(back.style as unknown as Record<string, string>).webkitBackfaceVisibility = 'visible'
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
                ;(back.style as unknown as Record<string, string>).webkitBackfaceVisibility = ''
                back.style.position = savedBackPosition
            }
        })
    })

    return () => restorers.forEach((fn) => fn())
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

/** Convert canvas to data URL. Falls back to high-quality JPEG if PNG > 10 MB. */
function canvasToDataUrl(canvas: HTMLCanvasElement): string {
    const png = canvas.toDataURL('image/png')
    if (png.length < 10_000_000) return png
    return canvas.toDataURL('image/jpeg', 0.92)
}

/** Assemble one or more captured canvases into a jsPDF document. */
function buildPdfFromCanvases(
    captures: Array<{ canvas: HTMLCanvasElement; dataUrl: string }>,
): jsPDF {
    if (captures.length === 0) throw new Error('No captures to build PDF from')

    const first = captures[0]
    const doc = new jsPDF({
        orientation: first.canvas.width >= first.canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [first.canvas.width, first.canvas.height],
        compress: true,
    })

    const fmt = first.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
    doc.addImage(first.dataUrl, fmt, 0, 0, first.canvas.width, first.canvas.height)

    for (let i = 1; i < captures.length; i++) {
        const cap = captures[i]
        const capFmt = cap.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        doc.addPage(
            [cap.canvas.width, cap.canvas.height],
            cap.canvas.width >= cap.canvas.height ? 'landscape' : 'portrait',
        )
        doc.addImage(cap.dataUrl, capFmt, 0, 0, cap.canvas.width, cap.canvas.height)
    }

    return doc
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

    const { containerEl, filenameBase, onProgress, signal, fitView, getViewport, setViewport } = options
    const currentPage = useCanvasStore.getState().currentPage

    if (!pageHasContent(currentPage)) return null

    _isExporting = true
    const savedViewport = getViewport()

    try {
        onProgress?.('Preparing canvas for capture…')

        const w = containerEl.offsetWidth
        const h = containerEl.offsetHeight
        const scale = computeSafeScale(w, h, DEFAULT_SCALE)

        // ── 1. Fit all visible nodes so nothing is off-screen ──────────────
        fitView({ padding: 0.05, duration: 0 })

        // Wait for React Flow viewport CSS transform + DrawingCanvas redraw
        await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS))
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

        onProgress?.('Capturing canvas…')

        // ── 2. Capture (overlay hiding + flashcard fix handled internally) ─
        const capturePromise = captureContainer(containerEl, scale, signal)
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Capture timed out')), PAGE_CAPTURE_TIMEOUT_MS),
        )
        const canvas = await Promise.race([capturePromise, timeoutPromise])

        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

        onProgress?.('Building PDF…')

        const dataUrl = canvasToDataUrl(canvas)
        const doc = buildPdfFromCanvases([{ canvas, dataUrl }])
        const blob = doc.output('blob')

        triggerDownload(blob, `${filenameBase}-Page${currentPage}.pdf`)
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
 * Navigates to each annotated page, fits all its nodes, captures it, then
 * assembles every capture into a single downloadable PDF.
 * Returns a Blob, or null if no pages have content.
 */
export async function exportAllPages(options: ExportAllOptions): Promise<Blob | null> {
    if (_isExporting) throw new Error('An export is already in progress')

    const {
        containerEl, filenameBase, onProgress, signal,
        goToPage, totalPages, currentPage: originalPage,
        fitView, getViewport, setViewport,
    } = options

    // Build list of annotated pages
    const annotatedPages: number[] = []
    for (let p = 1; p <= totalPages; p++) {
        if (pageHasContent(p)) annotatedPages.push(p)
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
        const scale = computeSafeScaleMulti(w, h, annotatedPages.length, DEFAULT_SCALE)

        const captures: Array<{ canvas: HTMLCanvasElement; dataUrl: string }> = []

        for (let i = 0; i < annotatedPages.length; i++) {
            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            const pageNum = annotatedPages[i]
            onProgress?.(`Capturing page ${pageNum} (${i + 1} of ${annotatedPages.length})…`)

            // Navigate to the page → new visible nodes + strokes
            goToPage(pageNum)
            await new Promise((r) => setTimeout(r, 300))

            // Fit all this page's nodes
            fitView({ padding: 0.05, duration: 0 })
            await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS))

            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

            try {
                // Capture (overlay hiding + flashcard fix handled internally)
                const capturePromise = captureContainer(containerEl, scale, signal)
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error(`Capture timed out for page ${pageNum}`)),
                        PAGE_CAPTURE_TIMEOUT_MS,
                    ),
                )
                const canvas = await Promise.race([capturePromise, timeoutPromise])
                const dataUrl = canvasToDataUrl(canvas)
                captures.push({ canvas, dataUrl })
            } catch (err) {
                console.warn(`[canvasExport] Failed to capture page ${pageNum}:`, err)
                onProgress?.(`Warning: Failed to capture page ${pageNum}, skipping…`)
                await new Promise((r) => setTimeout(r, 500))
            }
        }

        if (captures.length === 0) throw new Error('All page captures failed')
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

        onProgress?.('Building PDF…')

        const doc = buildPdfFromCanvases(captures)
        const blob = doc.output('blob')

        triggerDownload(blob, `${filenameBase}-AllPages.pdf`)
        onProgress?.('Done!')
        return blob
    } finally {
        try { goToPage(originalPage) } catch { /* best-effort */ }
        setViewport(savedViewport, { duration: 0 })
        _isExporting = false
    }
}
