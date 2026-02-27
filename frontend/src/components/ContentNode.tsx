import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { ContentNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import PDFViewer from './PDFViewer'

// Custom schema: extends defaultSchema to allow <mark> elements with className and data-highlight-id
// rehype-sanitize must come AFTER rehype-raw in the plugin array (spec rule 5)
const customSchema: SanitizeOptions = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
    attributes: {
        ...defaultSchema.attributes,
        mark: ['className', 'dataHighlightId'],
    },
}

// Extend ContentNodeData with optional callback and PDF ID
interface ExtendedContentNodeData extends ContentNodeData {
    onTestMePage?: () => void
    onManualSelection?: (result: { selectedText: string, sourceNodeId: string, rect: DOMRect, mousePos: { x: number; y: number }, autoAsk?: boolean } | null) => void
    pdf_id?: string
    /** Persisted PDF viewer state — restored on canvas reopen */
    pdfViewerState?: {
        nodeWidth?: number
        userNodeHeight?: number | null
        viewMode?: 'pdf' | 'markdown'
        isExpanded?: boolean
        zoomScale?: number
        isLocked?: boolean
        renderDpr?: number
    }
}

// Identify code block ranges to protect from highlight injection
function getCodeBlockRanges(content: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = []

    // Triple backtick fences
    const fenceRegex = /```[\s\S]*?```/g
    let match
    while ((match = fenceRegex.exec(content)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length })
    }

    // Single inline backticks (after triple backtick ranges are excluded)
    const inlineRegex = /`[^`\n]+`/g
    while ((match = inlineRegex.exec(content)) !== null) {
        const inFence = ranges.some((r) => match!.index >= r.start && match!.index < r.end)
        if (!inFence) {
            ranges.push({ start: match.index, end: match.index + match[0].length })
        }
    }

    return ranges
}

function replaceOutsideCodeBlocks(
    content: string,
    regex: RegExp,
    highlight: { id: string; text: string },
    ranges: Array<{ start: number; end: number }>
): string {
    return content.replace(regex, (match, offset) => {
        const inProtectedRange = ranges.some((r) => offset >= r.start && offset < r.end)
        if (inProtectedRange) return match
        // Use `match` (the actual text from the markdown source) so any soft
        // newlines inside the matched span are preserved in the output.
        return `<mark class="bg-yellow-200 cursor-pointer" data-highlight-id="${highlight.id}">${match}</mark>`
    })
}

type ContentNodeProps = NodeProps & { data: ExtendedContentNodeData }

export default function ContentNode({ id, data }: ContentNodeProps) {
    const { setCenter } = useReactFlow()
    const updateNodeInternals = useUpdateNodeInternals()
    const highlights = useCanvasStore((s) => s.highlights)
    const nodes = useCanvasStore((s) => s.nodes)
    const currentPage = useCanvasStore((s) => s.currentPage)
    const scrollPositions = useCanvasStore((s) => s.scrollPositions)
    const updateScrollPosition = useCanvasStore((s) => s.updateScrollPosition)
    const setCurrentPage = useCanvasStore((s) => s.setCurrentPage)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)

    // ── Restore persisted PDF viewer state from node data ───────────────────
    const savedState = data.pdfViewerState
    // ── Resize state ────────────────────────────────────────────────────────
    const [nodeWidth, setNodeWidth] = useState(savedState?.nodeWidth ?? 550)
    // Auto fit height: the exact viewer height that shows one full PDF page
    // at the current fit-to-width scale. Updated by PDFViewer whenever the
    // container width changes.
    const [autoFitHeight, setAutoFitHeight] = useState<number>(600)
    // Explicit user-controlled node height (null = auto from autoFitHeight).
    // Once set via resize drag, the height is locked and won't auto-track width.
    const [userNodeHeight, setUserNodeHeight] = useState<number | null>(savedState?.userNodeHeight ?? null)
    // Hard minimum width set on PDF load
    const minNodeWidthRef = useRef(savedState?.nodeWidth ?? 550)
    // Tracks whether the initial PDF size has been set (prevents re-mount resets)
    const hasInitializedSizeRef = useRef(!!savedState?.nodeWidth)
    // true = full-page (no scroll), false = compact scrollable view
    const [isExpanded, setIsExpanded] = useState(savedState?.isExpanded ?? true)
    // 'pdf' = PDF view, 'markdown' = Markdown view
    // Start with saved mode or markdown; switch to pdf after loading if successful
    const [viewMode, setViewMode] = useState<'pdf' | 'markdown'>(savedState?.viewMode ?? 'markdown')
    // Persisted zoom scale from previous session (passed to PDFViewer as initial)
    const savedZoomScaleRef = useRef<number | undefined>(savedState?.zoomScale)
    // Lock state — prevents node dragging and resizing
    const [isLocked, setIsLocked] = useState(savedState?.isLocked ?? false)
    // Render DPR (resolution quality) for PDF
    const [renderDpr, setRenderDpr] = useState<number | undefined>(savedState?.renderDpr)
    const currentRenderDprRef = useRef<number | undefined>(savedState?.renderDpr)
    // PDF data buffer — sourced from the Zustand store (backed by IndexedDB)
    const pdfArrayBuffer = useCanvasStore((s) => s.pdfArrayBuffer)
    const loadPdfFromStorage = useCanvasStore((s) => s.loadPdfFromStorage)
    const [isLoadingPdf, setIsLoadingPdf] = useState(false)

    // ── Resize warning state ────────────────────────────────────────────────
    // When the user attempts to resize a node that has drawing annotations,
    // show a warning popup. Store the pending resize event params so we can
    // proceed after confirmation.
    const drawingStrokes = useCanvasStore((s) => s.drawingStrokes)
    const [showResizeWarning, setShowResizeWarning] = useState(false)
    const pendingResizeRef = useRef<{ startX: number; startY: number; mode: 'w' | 'h' | 'wh'; cursor?: string; startW: number; startH: number; minW: number } | null>(null)
    // Track whether the user already acknowledged the warning for this resize session
    const resizeWarningAckedRef = useRef(false)

    const isMac = useMemo(() => {
        if (typeof window !== 'undefined') {
            return navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
        }
        return false
    }, [])

    // Load PDF data from IndexedDB when switching to PDF view mode
    useEffect(() => {
        // Don't load if we're not in PDF view mode
        if (viewMode !== 'pdf') return

        // Already have the buffer in memory
        if (pdfArrayBuffer) return

        // Try loading from IndexedDB
        setIsLoadingPdf(true)
        loadPdfFromStorage().finally(() => {
            setIsLoadingPdf(false)
            // If still no buffer after loading, fall back to markdown
            const currentBuffer = useCanvasStore.getState().pdfArrayBuffer
            if (!currentBuffer) {
                setViewMode('markdown')
            }
        })
    }, [viewMode, pdfArrayBuffer, loadPdfFromStorage])

    const processedMarkdown = useMemo(() => {
        let content = data.markdown_content

        // Sort highlights longest-first to avoid partial matches
        const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length)

        for (const highlight of sortedHighlights) {
            // Recompute protected ranges on every pass so already-injected <mark> tags
            // and code blocks cannot be corrupted by subsequent replacements.
            const codeBlockRanges = getCodeBlockRanges(content)
            const markTagRanges: Array<{ start: number; end: number }> = []
            const markTagRegex = /<mark[\s\S]*?<\/mark>/g
            let m: RegExpExecArray | null
            while ((m = markTagRegex.exec(content)) !== null) {
                markTagRanges.push({ start: m.index, end: m.index + m[0].length })
            }
            const protectedRanges = [...codeBlockRanges, ...markTagRanges]

            // Escape regex special chars, then replace spaces with a flexible
            // whitespace pattern so that a space in the selected text can match
            // a newline (soft wrap) in the raw markdown source.
            const escaped = highlight.text
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/ +/g, '[ \\t\\r\\n]+')
            const regex = new RegExp(escaped, 'g')
            content = replaceOutsideCodeBlocks(content, regex, highlight, protectedRanges)
        }

        return content
    }, [data.markdown_content, highlights])

    // Handle text selection from PDF viewer - triggers Ask Gemini popup
    const handlePdfTextSelection = useCallback((text: string, rect?: DOMRect, mousePos?: { x: number; y: number }, autoAsk?: boolean) => {
        if (data.onManualSelection && text && rect && mousePos) {
            data.onManualSelection({
                selectedText: text,
                sourceNodeId: id,
                rect,
                mousePos,
                autoAsk,
            })
        }
    }, [data.onManualSelection, id])

    // Handle PDF load - set natural dims, auto-size node to fit PDF perfectly
    const handlePdfLoad = useCallback((dimensions: { width: number; height: number }) => {
        // Use natural PDF dimensions with minimal padding (16px each side = 32px total)
        const padding = 32
        const newW = Math.min(Math.max(dimensions.width + padding, 400), 1500)
        // fitH = natural page height at the fit scale that just fills newW
        const fitH = Math.round(dimensions.height * (newW - padding) / dimensions.width + padding)
        minNodeWidthRef.current = newW
        // Always update autoFitHeight (serves as default when userNodeHeight is null)
        setAutoFitHeight(fitH)
        // Only set nodeWidth on first load — preserve user-resized width across mode switches
        if (!hasInitializedSizeRef.current) {
            setNodeWidth(newW)
            hasInitializedSizeRef.current = true
        }
    }, [])

    // Handle page change from PDF viewer - sync with canvas store
    const handlePdfPageChange = useCallback((page: number) => {
        setCurrentPage(page)
        persistToLocalStorage()
    }, [setCurrentPage, persistToLocalStorage])

    // Switch between PDF and text mode
    const handleViewModeChange = useCallback((newMode: 'pdf' | 'markdown') => {
        setViewMode(newMode)
    }, [])

    // Track the current zoom scale from PDFViewer
    const currentZoomRef = useRef<number | undefined>(savedZoomScaleRef.current)
    const handleZoomChange = useCallback((newScale: number) => {
        currentZoomRef.current = newScale
    }, [])

    const handleRenderDprChange = useCallback((dpr: number) => {
        currentRenderDprRef.current = dpr
        setRenderDpr(dpr)
    }, [])

    const handleLockToggle = useCallback(() => {
        setIsLocked((v) => !v)
    }, [])

    // ── Persist PDF viewer state to node data (debounced) ───────────────────
    // This writes nodeWidth, userNodeHeight, viewMode, isExpanded, zoom scale,
    // lock state, and render DPR into the node's data so it's saved with state.json.
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
        persistTimerRef.current = setTimeout(() => {
            updateNodeData(id, {
                pdfViewerState: {
                    nodeWidth,
                    userNodeHeight,
                    viewMode,
                    isExpanded,
                    zoomScale: currentZoomRef.current,
                    isLocked,
                    renderDpr: currentRenderDprRef.current,
                },
            })
        }, 500) // debounce 500ms
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
        }
    }, [nodeWidth, userNodeHeight, viewMode, isExpanded, isLocked, renderDpr, id, updateNodeData])

    // ── Core resize logic (called directly or after warning confirmation) ──
    const executeResize = useCallback((startX: number, startY: number, startW: number, startH: number, minW: number, mode: 'w' | 'h' | 'wh', cursor?: string) => {
        const minH = 200

        // Lock height on width-only or corner resize so height doesn't auto-track
        if (userNodeHeight === null && (mode === 'w' || mode === 'wh')) {
            setUserNodeHeight(startH)
        }

        const cursors: Record<string, string> = {
            w: 'ew-resize',
            h: 'ns-resize',
            wh: 'nwse-resize',
            'tl': 'nwse-resize',
            'tr': 'nesw-resize',
            'bl': 'nesw-resize',
            'br': 'nwse-resize',
        }

        // Full-screen transparent overlay captures ALL pointer events during drag
        const overlay = document.createElement('div')
        const cursorKey = cursor || mode
        overlay.style.cssText =
            `position:fixed;inset:0;z-index:9999;cursor:${cursors[cursorKey] ?? 'default'};user-select:none`
        document.body.appendChild(overlay)

        const onMove = (mv: MouseEvent) => {
            const dx = mv.clientX - startX
            const dy = mv.clientY - startY

            if (mode === 'w' || mode === 'wh') {
                setNodeWidth(Math.min(Math.max(startW + dx, minW), 1500))
            }
            if (mode === 'h' || mode === 'wh') {
                setUserNodeHeight(Math.max(startH + dy, minH))
            }
        }

        const onUp = () => {
            if (overlay.parentNode) document.body.removeChild(overlay)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [userNodeHeight])

    // ── Generic resize starter — used by all edge/corner handles ───────────
    // If the node has drawing annotations attached, show a warning first.
    const startResize = useCallback((e: React.MouseEvent, mode: 'w' | 'h' | 'wh', cursor?: string) => {
        e.preventDefault()
        e.stopPropagation()

        const startX = e.clientX
        const startY = e.clientY
        const startW = nodeWidth
        const minW = minNodeWidthRef.current

        const nodeEl = (e.currentTarget as HTMLElement).closest('[data-nodeid]') as HTMLElement | null
        const currentRenderedH = nodeEl ? nodeEl.getBoundingClientRect().height : 600
        const startH = userNodeHeight ?? currentRenderedH

        // Check if there are any drawing strokes attached to this node
        const hasAttachedStrokes = drawingStrokes.some((s) => s.nodeId === id)

        if (hasAttachedStrokes && !resizeWarningAckedRef.current) {
            // Store pending resize params and show warning
            pendingResizeRef.current = { startX, startY, mode, cursor, startW, startH, minW }
            setShowResizeWarning(true)
            return
        }

        // No annotations or already acknowledged — proceed directly
        executeResize(startX, startY, startW, startH, minW, mode, cursor)
    }, [nodeWidth, userNodeHeight, drawingStrokes, id, executeResize])

    // ── Warning popup handlers ──────────────────────────────────────────────
    const handleResizeWarningConfirm = useCallback(() => {
        setShowResizeWarning(false)
        resizeWarningAckedRef.current = true
        if (pendingResizeRef.current) {
            const { startX, startY, startW, startH, minW, mode, cursor } = pendingResizeRef.current
            executeResize(startX, startY, startW, startH, minW, mode, cursor)
            pendingResizeRef.current = null
        }
    }, [executeResize])

    const handleResizeWarningCancel = useCallback(() => {
        setShowResizeWarning(false)
        pendingResizeRef.current = null
    }, [])

    const handleMarkdownClick = useCallback(
        (event: React.MouseEvent) => {
            const target = event.target as Element
            const markEl = target.closest('mark')
            if (!markEl) return

            const highlightId = markEl.getAttribute('data-highlight-id')
            if (!highlightId) return

            const highlight = highlights.find((h) => h.id === highlightId)
            if (!highlight) return

            const targetNode = nodes.find((n) => n.id === highlight.nodeId)
            if (!targetNode) return

            setCenter(
                targetNode.position.x + 180,
                targetNode.position.y + 100,
                { duration: 600 }
            )
        },
        [highlights, nodes, setCenter]
    )

    // Calculate the effective height for the node
    // In PDF mode: height auto-tracks the PDF page's fit-to-width size
    // unless the user has manually resized (userNodeHeight).
    // In text mode: use auto height (content determines height)
    const hasFooter = !!data.onTestMePage
    const headerHeight = 44
    const toolbarHeight = 40
    const footerHeight = hasFooter ? 36 : 0
    const isPdfMode = viewMode === 'pdf' && pdfArrayBuffer
    const effectiveHeight = isPdfMode
        ? (userNodeHeight ?? (headerHeight + toolbarHeight + autoFitHeight + footerHeight))
        : undefined

    // Compute the viewer-area height to pass to PDFViewer
    const pdfViewerHeight = userNodeHeight
        ? Math.max(userNodeHeight - headerHeight - toolbarHeight - footerHeight, 100)
        : autoFitHeight

    // Bottom offset for resize handles when footer is present
    const bottomOffset = hasFooter ? 36 : 0

    // Sync visual dimensions to the React Flow node's `style` so the wrapper,
    // minimap rectangle, and hit-test area always match what is rendered.
    // Without this, the wrapper keeps the stale `style.width` from the initial
    // node creation in UploadPanel and never updates, causing the minimap and
    // click target to be wider/taller than the visible content.
    useEffect(() => {
        const w = nodeWidth
        const h = effectiveHeight
        setNodes((prev) => prev.map((n) => {
            if (n.id !== id) return n
            const cs = (n.style ?? {}) as React.CSSProperties
            if (cs.width === w && cs.height === h) return n
            return { ...n, style: { ...cs, width: w, height: h } }
        }))
        // Also refresh handle positions for edge routing
        requestAnimationFrame(() => updateNodeInternals(id))
    }, [nodeWidth, effectiveHeight, id, setNodes, updateNodeInternals])

    const renderViewModeButtons = () => (
        <div className="flex gap-1">
            <button
                onClick={(e) => { e.stopPropagation(); handleViewModeChange('pdf') }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'pdf'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
            >
                PDF View
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); handleViewModeChange('markdown') }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'markdown'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
            >
                Text View
            </button>
        </div>
    )

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-lg shadow-lg border relative flex flex-col ${isLocked ? 'nodrag nopan border-indigo-300 border-dashed' : 'border-gray-200'}`}
            style={{ width: nodeWidth, height: effectiveHeight, overflow: 'hidden' }}
        >
            {/* Header bar — draggable when unlocked */}
            <div className={`flex items-center gap-2 px-4 py-3 bg-indigo-600 rounded-t-lg ${isLocked ? 'cursor-default' : 'cursor-grab'}`}>
                {isLocked ? (
                    <svg className="w-4 h-4 text-white/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l-3-3m0 0l3-3m-3 3h12M3 6v12" />
                    </svg>
                )}
                <span className="text-white font-medium text-sm truncate flex-1">
                    {data.filename} — {data.page_count} page{data.page_count !== 1 ? 's' : ''}
                </span>

                <span className="text-indigo-100 font-medium text-xs hidden sm:inline-block px-3 py-1 bg-white/10 rounded-full border border-white/20 mr-1 flex-shrink-0" title="Use the snipping tool to ask Gemini about a specific area">
                    Press {isMac ? 'Cmd' : 'Ctrl'} + Shift + S to ask Gemini
                </span>

                <button
                    title={isExpanded ? 'Compact view (scrollable)' : 'Full-page view'}
                    onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v) }}
                    className="nodrag flex-shrink-0 p-1 rounded hover:bg-indigo-500 transition-colors text-white/80 hover:text-white"
                >
                    {isExpanded ? (
                        // Collapse / minimise icon
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    ) : (
                        // Expand icon
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </button>
            </div>

            {/* View mode toggle - standalone only when in markdown mode */}
            {(pdfArrayBuffer || data.pdf_id) && viewMode === 'markdown' && (
                <div className="nodrag px-4 py-2 border-b border-gray-100 flex justify-center bg-gray-50">
                    {renderViewModeButtons()}
                </div>
            )}

            {/* Loading indicator for PDF */}
            {isLoadingPdf && (
                <div className="flex items-center justify-center p-8">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm text-gray-500">Loading PDF...</p>
                    </div>
                </div>
            )}

            {/* Content - PDF view or Markdown view - hide when loading */}
            {!isLoadingPdf && (
                viewMode === 'pdf' && pdfArrayBuffer ? (
                    <div className="nodrag nopan flex-1 min-h-0 flex flex-col">
                        <PDFViewer
                            className="flex-1 min-h-0"
                            pdfData={pdfArrayBuffer}
                            initialPage={currentPage}
                            initialScale={savedZoomScaleRef.current}
                            scrollPositions={scrollPositions}
                            onScrollPositionChange={(page, position) => updateScrollPosition(page, position)}
                            onTextSelection={handlePdfTextSelection}
                            onLoad={handlePdfLoad}
                            onPageChange={handlePdfPageChange}
                            onFitHeightChange={(h) => setAutoFitHeight(h)}
                            onZoomChange={handleZoomChange}
                            containerWidth={nodeWidth}
                            viewerHeight={pdfViewerHeight}
                            customToolbarMiddle={renderViewModeButtons()}
                            isLocked={isLocked}
                            onLockToggle={handleLockToggle}
                            initialRenderDpr={renderDpr}
                            onRenderDprChange={handleRenderDprChange}
                        />
                    </div>
                ) : (
                    <div
                        className={`nodrag nopan${isExpanded ? '' : ' overflow-y-auto'}`}
                        style={{ cursor: 'text', userSelect: 'text', ...(isExpanded ? {} : { maxHeight: '80vh' }) }}
                        onClick={handleMarkdownClick}
                        onWheelCapture={isExpanded ? undefined : (e) => e.stopPropagation()}
                    >
                        <div className="prose prose-base max-w-none p-4">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                            >
                                {processedMarkdown}
                            </ReactMarkdown>
                        </div>
                    </div>
                )
            )}

            {/* "Test me on this page" pill button — absolutely pinned to bottom so it is never clipped */}
            {data.onTestMePage && (
                <div
                    className="nodrag flex-shrink-0 z-10 border-t border-gray-100 flex justify-center items-center bg-gray-50 rounded-b-lg"
                    style={{ height: footerHeight }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); data.onTestMePage!() }}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[11px] font-semibold rounded-full shadow-sm transition-colors select-none"
                    >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Test me on this page
                    </button>
                </div>
            )}

            {/* 10 source handles per side, evenly spaced */}
            {Array.from({ length: 10 }, (_, i) => (
                <Handle
                    key={`right-${i}`}
                    type="source"
                    position={Position.Right}
                    id={`right-${i}`}
                    style={{
                        background: '#1E3A5F',
                        width: 8,
                        height: 8,
                        border: '2px solid white',
                        borderRadius: '50%',
                        top: `${(i + 0.5) * 10}%`,
                    }}
                />
            ))}
            {Array.from({ length: 10 }, (_, i) => (
                <Handle
                    key={`left-${i}`}
                    type="source"
                    position={Position.Left}
                    id={`left-${i}`}
                    style={{
                        background: '#1E3A5F',
                        width: 8,
                        height: 8,
                        border: '2px solid white',
                        borderRadius: '50%',
                        top: `${(i + 0.5) * 10}%`,
                    }}
                />
            ))}

            {/* ── Resize handles ──────────────────────────────────────────
              * Right edge  → width only
              * Bottom edge → height only (switches from auto to explicit control)
              * All 4 corners → both width and height
              *
              * A full-screen transparent overlay (appended to document.body) is
              * created on mousedown so the pointer can roam freely over the canvas
              * and PDF text layer without losing the drag.
              * The corners sit above the edge strips (z-30 vs z-20) so they always
              * win when the user clicks exactly on the corner.
              */}

            {!isLocked && (<>
            {/* Right edge — width only (exclude corners, below header) */}
            <div
                className="nodrag nopan absolute right-0 z-20"
                style={{
                    width: 6,
                    top: headerHeight,
                    bottom: bottomOffset,
                    cursor: 'ew-resize',
                    background: 'transparent',
                }}
                onMouseDown={(e) => startResize(e, 'w')}
            />

            {/* Bottom edge — height only (exclude corners, above footer) */}
            <div
                className="nodrag nopan absolute z-20"
                style={{
                    height: 6,
                    bottom: bottomOffset,
                    left: 5,
                    right: 5,
                    cursor: 'ns-resize',
                    background: 'transparent',
                }}
                onMouseDown={(e) => startResize(e, 'h')}
            />

            {/* Top-left corner — both width and height (at actual corner) */}
            <div
                className="nodrag nopan absolute w-5 h-5 z-30"
                style={{
                    top: 0,
                    left: 0,
                    cursor: 'nwse-resize',
                    borderTop: '3px solid #1E3A5F',
                    borderLeft: '3px solid #1E3A5F',
                    borderTopLeftRadius: 4,
                }}
                onMouseDown={(e) => startResize(e, 'wh', 'tl')}
                title="Drag to resize"
            />

            {/* Top-right corner — both width and height (at actual corner) */}
            <div
                className="nodrag nopan absolute w-5 h-5 z-30"
                style={{
                    top: 0,
                    right: 0,
                    cursor: 'nesw-resize',
                    borderTop: '3px solid #1E3A5F',
                    borderRight: '3px solid #1E3A5F',
                    borderTopRightRadius: 4,
                }}
                onMouseDown={(e) => startResize(e, 'wh', 'tr')}
                title="Drag to resize"
            />

            {/* Bottom-left corner — both width and height (at actual corner) */}
            <div
                className="nodrag nopan absolute w-5 h-5 z-30"
                style={{
                    bottom: 0,
                    left: 0,
                    cursor: 'nesw-resize',
                    borderBottom: '3px solid #1E3A5F',
                    borderLeft: '3px solid #1E3A5F',
                    borderBottomLeftRadius: 4,
                }}
                onMouseDown={(e) => startResize(e, 'wh', 'bl')}
                title="Drag to resize"
            />

            {/* Bottom-right corner — both width and height (at actual corner) */}
            <div
                className="nodrag nopan absolute w-5 h-5 z-30"
                style={{
                    bottom: 0,
                    right: 0,
                    cursor: 'nwse-resize',
                    borderBottom: '3px solid #1E3A5F',
                    borderRight: '3px solid #1E3A5F',
                    borderBottomRightRadius: 4,
                }}
                onMouseDown={(e) => startResize(e, 'wh', 'br')}
                title="Drag to resize"
            />
            </>)}

            {/* ── Resize warning popup ──────────────────────────────────── */}
            {showResizeWarning && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0, 0, 0, 0.4)', borderRadius: 'inherit' }}
                    onClick={(e) => { e.stopPropagation(); handleResizeWarningCancel() }}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl p-5 mx-4"
                        style={{ maxWidth: 340 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-8.5 14.14A1.5 1.5 0 003.07 20h17.86a1.5 1.5 0 001.28-2l-8.5-14.14a1.5 1.5 0 00-2.56 0z" />
                            </svg>
                            <h3 className="text-sm font-semibold text-gray-800">Resize Warning</h3>
                        </div>
                        <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                            Resizing this viewer may move or change the position of your annotations (drawings/highlights). This cannot be undone automatically.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                                onClick={handleResizeWarningCancel}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs rounded-md bg-[#1E3A5F] text-white hover:bg-[#2a4e7a] transition-colors"
                                onClick={handleResizeWarningConfirm}
                            >
                                Resize Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
