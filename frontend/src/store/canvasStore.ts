import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { HighlightEntry, DrawingStroke, StrokePoint, ToolSettings, WhiteboardTool, WhiteboardUndoAction, QuizHistoryEntry } from '../types'
import { DEFAULT_TOOL_SETTINGS, DEFAULT_SAVED_COLORS } from '../types'
import { savePdfToLocal, loadPdfFromLocal, deletePdfFromLocal } from '../utils/pdfStorage'
import { invalidatePdfProxyCache } from '../utils/pdfImageExtractor'

/** Split markdown into per-page chunks using the '## Page N' headers injected by Gemini. */
function splitMarkdownByPage(markdown: string): string[] {
    const pages = markdown.split(/(?=## Page \d+)/).filter((p) => p.trim().length > 0)
    return pages.length > 0 ? pages : [markdown]
}

interface FileData {
    markdown_content: string
    raw_text: string
    filename: string
    page_count: number
    pdf_url?: string
    pdf_id?: string
}

export interface UserDetails {
    name: string
    age: string
    status: string
    educationLevel: string
}

interface CanvasState {
    nodes: Node[]
    edges: Edge[]
    fileData: FileData | null
    highlights: HighlightEntry[]
    activeAbortController: AbortController | null
    userDetails: UserDetails
    /** 1-based index of the currently displayed PDF page */
    currentPage: number
    /** Full markdown split into one string per page */
    pageMarkdowns: string[]
    /** Zoom level for PDF viewer (default 1.0) */
    zoomLevel: number
    /** Per-page scroll positions for PDF viewer */
    scrollPositions: Record<number, number>
    /** React Flow viewport (x, y, zoom) for canvas pan/zoom persistence */
    canvasViewport: { x: number; y: number; zoom: number } | null
    /** Whether the user is currently in image snipping mode */
    isSnippingMode: boolean
    /** Raw PDF ArrayBuffer stored in-memory (loaded from IndexedDB) */
    pdfArrayBuffer: ArrayBuffer | null
    /** Completed revision quiz sessions for this canvas, newest first */
    quizHistory: QuizHistoryEntry[]
    /** Maps flashcard node ID → Unix ms of last flip (for "last revised" display) */
    flashcardLastFlipped: Record<string, number>
    /** Maps 1-based page index → AI-generated page title (persisted so it is not re-fetched on every open) */
    pageTitles: Record<number, string>

    // ── Whiteboard / Drawing state ──────────────────────────────────────────
    drawingStrokes: DrawingStroke[]
    savedColors: string[]
    toolSettings: ToolSettings
    activeTool: WhiteboardTool
    whiteboardUndoStack: WhiteboardUndoAction[]
    whiteboardRedoStack: WhiteboardUndoAction[]
}

interface CanvasActions {
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void
    setFileData: (data: FileData, pdfBuffer?: ArrayBuffer) => void
    addHighlight: (entry: HighlightEntry) => void
    removeHighlight: (nodeId: string) => void
    updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
    setActiveAbortController: (controller: AbortController | null) => void
    resetCanvas: () => void
    /** Clear store state without deleting any persisted files (used when navigating away). */
    clearForNewCanvas: () => void
    persistToLocalStorage: () => void
    setUserDetails: (details: UserDetails) => void
    setCurrentPage: (page: number) => void
    setPageMarkdowns: (markdowns: string[]) => void
    /** Set zoom level for PDF viewer */
    setZoomLevel: (zoom: number) => void
    /** Update scroll position for a specific page */
    updateScrollPosition: (page: number, position: number) => void
    /** Set the React Flow canvas viewport (x, y, zoom) */
    setCanvasViewport: (vp: { x: number; y: number; zoom: number } | null) => void
    /** Merge a partial data patch into a quiz question node */
    updateQuizNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
    /** Append a chat message to a quiz question node's chatHistory */
    addQuizChatMessage: (nodeId: string, message: { role: 'user' | 'model'; content: string }) => void
    /** Return all quiz question nodes for the given page */
    getQuizNodesForPage: (pageIndex: number) => Node[]
    /** Toggle snipping mode */
    setIsSnippingMode: (isSnipping: boolean) => void
    /** Update only the text fields of fileData without resetting page/zoom/scroll state */
    updateFileDataText: (rawText: string, markdownContent: string) => void
    /** Store a PDF ArrayBuffer in memory + IndexedDB */
    setPdfArrayBuffer: (buffer: ArrayBuffer | null) => void
    /** Load the PDF ArrayBuffer from IndexedDB into memory */
    loadPdfFromStorage: () => Promise<void>
    /** Add a completed quiz entry to history (prepends — newest first) */
    addQuizHistoryEntry: (entry: QuizHistoryEntry) => void
    /** Replace the full quiz history (used when loading saved state) */
    setQuizHistory: (entries: QuizHistoryEntry[]) => void
    /** Record a flashcard flip event (updates last-flipped timestamp for that node) */
    recordFlashcardFlip: (nodeId: string) => void
    /** Replace the full flip-timestamp map (used when loading saved state) */
    setFlashcardLastFlipped: (map: Record<string, number>) => void
    /** Store an AI-generated title for a single page (1-based index) */
    setPageTitle: (pageIndex: number, title: string) => void
    /** Replace the full page-title map (used when loading saved state) */
    setPageTitles: (map: Record<number, string>) => void

    // ── Whiteboard / Drawing actions ────────────────────────────────────────
    addStroke: (stroke: DrawingStroke) => void
    removeStroke: (id: string) => void
    removeStrokes: (ids: string[]) => void
    clearStrokesForPage: (pageIndex: number) => void
    /** Move selected strokes by (dx, dy) in flow coordinates; detaches node-attached strokes */
    moveStrokes: (ids: string[], dx: number, dy: number) => void
    setActiveTool: (tool: WhiteboardTool) => void
    setToolSettings: (partial: Partial<ToolSettings>) => void
    setSavedColors: (colors: string[]) => void
    addSavedColor: (color: string) => void
    removeSavedColor: (color: string) => void
    setDrawingStrokes: (strokes: DrawingStroke[]) => void
    /** Area-erase: remove points near (x,y,radius) from strokes, splitting them into segments */
    areaEraseAt: (flowX: number, flowY: number, radius: number, pageIndex: number) => void
    whiteboardUndo: () => void
    whiteboardRedo: () => void
}

const STORAGE_KEY = 'studycanvas_state'

// Debounce timer for localStorage persistence
let _persistTimer: ReturnType<typeof setTimeout> | null = null
const PERSIST_DEBOUNCE_MS = 2000

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
    nodes: [],
    edges: [],
    fileData: null,
    highlights: [],
    activeAbortController: null,
    userDetails: { name: '', age: '', status: '', educationLevel: '' },
    currentPage: 1,
    pageMarkdowns: [],
    zoomLevel: 1.0,
    scrollPositions: {},
    canvasViewport: null,
    isSnippingMode: false,
    pdfArrayBuffer: null,
    quizHistory: [],
    flashcardLastFlipped: {},
    pageTitles: {},

    // Whiteboard defaults
    drawingStrokes: [],
    savedColors: [...DEFAULT_SAVED_COLORS],
    toolSettings: { ...DEFAULT_TOOL_SETTINGS },
    activeTool: 'cursor',
    whiteboardUndoStack: [],
    whiteboardRedoStack: [],

    setNodes: (nodes) =>
        set((state) => ({
            nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
        })),

    setEdges: (edges) =>
        set((state) => ({
            edges: typeof edges === 'function' ? edges(state.edges) : edges,
        })),

    setFileData: (data, pdfBuffer) => {
        const pages = splitMarkdownByPage(data.markdown_content)
        set({ fileData: data, pageMarkdowns: pages, currentPage: 1, zoomLevel: 1.0, scrollPositions: {} })
        if (pdfBuffer) {
            set({ pdfArrayBuffer: pdfBuffer })
            // Persist to IndexedDB using a stable key
            const key = data.pdf_id || data.filename || 'current_pdf'
            savePdfToLocal(key, pdfBuffer).catch(err => console.error('[canvasStore] Failed to save PDF to IndexedDB:', err))
        }
    },

    addHighlight: (entry) =>
        set((state) => ({ highlights: [...state.highlights, entry] })),

    removeHighlight: (nodeId) =>
        set((state) => ({ highlights: state.highlights.filter((h) => h.nodeId !== nodeId) })),

    updateNodeData: (nodeId, data) =>
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
            ),
        })),

    setActiveAbortController: (controller) =>
        set({ activeAbortController: controller }),

    setCurrentPage: (page) => set({ currentPage: page }),

    setPageMarkdowns: (markdowns) => set({ pageMarkdowns: markdowns }),

    setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

    updateScrollPosition: (page, position) =>
        set((state) => ({
            scrollPositions: { ...state.scrollPositions, [page]: position },
        })),

    setCanvasViewport: (vp) => set({ canvasViewport: vp }),

    resetCanvas: () => {
        const { activeAbortController, fileData } = get()
        activeAbortController?.abort()
        // Clear IndexedDB PDF storage
        const key = fileData?.pdf_id || fileData?.filename || 'current_pdf'
        deletePdfFromLocal(key).catch(() => { })
        set({
            nodes: [],
            edges: [],
            fileData: null,
            highlights: [],
            activeAbortController: null,
            userDetails: { name: '', age: '', status: '', educationLevel: '' },
            currentPage: 1,
            pageMarkdowns: [],
            zoomLevel: 1.0,
            scrollPositions: {},
            canvasViewport: null,
            isSnippingMode: false,
            pdfArrayBuffer: null,
            quizHistory: [],
            flashcardLastFlipped: {},
            pageTitles: {},
            drawingStrokes: [],
            whiteboardUndoStack: [],
            whiteboardRedoStack: [],
            activeTool: 'cursor',
        })
        localStorage.removeItem(STORAGE_KEY)
    },

    clearForNewCanvas: () => {
        const { activeAbortController } = get()
        activeAbortController?.abort()
        set({
            nodes: [],
            edges: [],
            fileData: null,
            highlights: [],
            activeAbortController: null,
            currentPage: 1,
            pageMarkdowns: [],
            zoomLevel: 1.0,
            scrollPositions: {},
            canvasViewport: null,
            isSnippingMode: false,
            pdfArrayBuffer: null,
            quizHistory: [],
            flashcardLastFlipped: {},
            pageTitles: {},
            drawingStrokes: [],
            whiteboardUndoStack: [],
            whiteboardRedoStack: [],
            activeTool: 'cursor',
        })
    },

    persistToLocalStorage: () => {
        // Adaptive debounce: longer delay for larger canvases to reduce JSON.stringify
        // frequency when the node count grows. 2s for ≤15 nodes, 3s for 16-30, 4s for 31+.
        const nodeCount = get().nodes.length
        const delay = nodeCount > 30 ? 4000 : nodeCount > 15 ? 3000 : PERSIST_DEBOUNCE_MS
        if (_persistTimer) clearTimeout(_persistTimer)
        _persistTimer = setTimeout(() => {
            _persistTimer = null
            const { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport, drawingStrokes, savedColors, toolSettings, quizHistory, flashcardLastFlipped, pageTitles } = get()
            // Strip large recoverable fields to stay under the ~5MB localStorage quota.
            // raw_text & markdown_content are re-derived from the PDF on next load.
            // Image data URLs are kept (needed for display) but could be stripped in future.
            const lightFileData = fileData ? {
                ...fileData,
                raw_text: '',
                markdown_content: '',
            } : null
            const state = { nodes, edges, fileData: lightFileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport, drawingStrokes, savedColors, toolSettings, quizHistory, flashcardLastFlipped, pageTitles }
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
            } catch (e) {
                // QuotaExceededError — try again with even less data
                console.warn('[canvasStore] localStorage quota exceeded, retrying with minimal state', e)
                try {
                    // Strip image data URLs and drawing strokes
                    const minimalNodes = nodes.map((n: any) => {
                        if (n.type === 'imageNode' && n.data?.imageDataUrl) {
                            return { ...n, data: { ...n.data, imageDataUrl: '' } }
                        }
                        return n
                    })
                    const minState = { nodes: minimalNodes, edges, fileData: lightFileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport, drawingStrokes: [], savedColors, toolSettings, quizHistory, flashcardLastFlipped, pageTitles }
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(minState))
                } catch {
                    console.error('[canvasStore] localStorage write failed even with minimal state')
                }
            }
        }, delay)
    },

    setUserDetails: (details) => set({ userDetails: details }),

    updateQuizNodeData: (nodeId, data) =>
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
            ),
        })),

    addQuizChatMessage: (nodeId, message) =>
        set((state) => ({
            nodes: state.nodes.map((n) => {
                if (n.id !== nodeId) return n
                const prev = (n.data as Record<string, unknown>).chatHistory as { role: string; content: string }[] | undefined
                return { ...n, data: { ...n.data, chatHistory: [...(prev ?? []), message] } }
            }),
        })),

    getQuizNodesForPage: (pageIndex) => {
        const { nodes } = get()
        return nodes.filter(
            (n) => n.type === 'quizQuestionNode' && (n.data as Record<string, unknown>).pageIndex === pageIndex
        )
    },

    addQuizHistoryEntry: (entry) =>
        set((state) => ({ quizHistory: [entry, ...state.quizHistory] })),

    setQuizHistory: (entries) => set({ quizHistory: entries }),

    recordFlashcardFlip: (nodeId) =>
        set((state) => ({
            flashcardLastFlipped: { ...state.flashcardLastFlipped, [nodeId]: Date.now() },
        })),

    setFlashcardLastFlipped: (map) => set({ flashcardLastFlipped: map }),

    setPageTitle: (pageIndex, title) =>
        set((state) => ({ pageTitles: { ...state.pageTitles, [pageIndex]: title } })),

    setPageTitles: (map) => set({ pageTitles: map }),

    setIsSnippingMode: (isSnipping) => set({ isSnippingMode: isSnipping }),

    updateFileDataText: (rawText, markdownContent) => {
        const { fileData } = get()
        if (!fileData) return
        const pages = splitMarkdownByPage(markdownContent)
        set({
            fileData: { ...fileData, raw_text: rawText, markdown_content: markdownContent },
            pageMarkdowns: pages,
        })
    },

    setPdfArrayBuffer: (buffer) => {
        invalidatePdfProxyCache()
        set({ pdfArrayBuffer: buffer })
    },

    loadPdfFromStorage: async () => {
        const { fileData } = get()
        if (!fileData) return
        const key = fileData.pdf_id || fileData.filename || 'current_pdf'
        try {
            const buffer = await loadPdfFromLocal(key)
            if (buffer) {
                set({ pdfArrayBuffer: buffer })
            }
        } catch (err) {
            console.error('[canvasStore] Failed to load PDF from IndexedDB:', err)
        }
    },

    // ── Whiteboard / Drawing actions ────────────────────────────────────────
    addStroke: (stroke) => {
        set((state) => ({
            drawingStrokes: [...state.drawingStrokes, stroke],
            whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'addStroke', stroke }],
            whiteboardRedoStack: [],
        }))
    },

    removeStroke: (id) => {
        const stroke = get().drawingStrokes.find((s) => s.id === id)
        if (!stroke) return
        set((state) => ({
            drawingStrokes: state.drawingStrokes.filter((s) => s.id !== id),
            whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'removeStroke', stroke }],
            whiteboardRedoStack: [],
        }))
    },

    removeStrokes: (ids) => {
        const idSet = new Set(ids)
        const removed = get().drawingStrokes.filter((s) => idSet.has(s.id))
        if (removed.length === 0) return
        set((state) => ({
            drawingStrokes: state.drawingStrokes.filter((s) => !idSet.has(s.id)),
            whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'removeStrokes', strokes: removed }],
            whiteboardRedoStack: [],
        }))
    },

    clearStrokesForPage: (pageIndex) => {
        const removed = get().drawingStrokes.filter((s) => s.pageIndex === pageIndex)
        if (removed.length === 0) return
        set((state) => ({
            drawingStrokes: state.drawingStrokes.filter((s) => s.pageIndex !== pageIndex),
            whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'removeStrokes', strokes: removed }],
            whiteboardRedoStack: [],
        }))
    },

    moveStrokes: (ids, dx, dy) => {
        const idSet = new Set(ids)
        const nodes = get().nodes
        const strokes = get().drawingStrokes
        const before = strokes.filter((s) => idSet.has(s.id))
        const newStrokes = strokes.map((stroke) => {
            if (!idSet.has(stroke.id)) return stroke
            let points = stroke.points
            if (stroke.nodeId) {
                // Convert node-relative points to global coords, apply delta, detach from node
                const node = nodes.find((n) => n.id === stroke.nodeId)
                const ox = node?.position.x ?? stroke.nodeOffset?.x ?? 0
                const oy = node?.position.y ?? stroke.nodeOffset?.y ?? 0
                points = stroke.points.map((p) => ({ ...p, x: p.x + ox + dx, y: p.y + oy + dy }))
                return { ...stroke, points, nodeId: undefined, nodeOffset: undefined }
            }
            return { ...stroke, points: points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
        })
        const after = newStrokes.filter((s) => idSet.has(s.id))
        set((state) => ({
            drawingStrokes: newStrokes,
            whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'moveStrokes' as const, before, after }],
            whiteboardRedoStack: [],
        }))
    },

    setActiveTool: (tool) => set({ activeTool: tool }),

    setToolSettings: (partial) =>
        set((state) => ({ toolSettings: { ...state.toolSettings, ...partial } })),

    setSavedColors: (colors) => set({ savedColors: colors }),

    addSavedColor: (color) =>
        set((state) => {
            const filtered = state.savedColors.filter((c) => c !== color)
            return { savedColors: [color, ...filtered].slice(0, 20) }
        }),

    removeSavedColor: (color) =>
        set((state) => ({
            savedColors: state.savedColors.filter((c) => c !== color),
        })),

    areaEraseAt: (flowX, flowY, radius, pageIndex) => {
        const r2 = radius * radius
        const strokes = get().drawingStrokes
        const nodes = get().nodes
        const newStrokes: DrawingStroke[] = []
        const removedStrokes: DrawingStroke[] = []
        let changed = false

        for (const stroke of strokes) {
            if (stroke.pageIndex !== pageIndex) {
                newStrokes.push(stroke)
                continue
            }

            // For node-attached strokes, resolve the node offset
            // so we compare in global flow coordinates.
            let ox = 0, oy = 0
            if (stroke.nodeId) {
                const node = nodes.find((n) => n.id === stroke.nodeId)
                if (node) {
                    ox = node.position.x; oy = node.position.y
                }
                else if (stroke.nodeOffset) { ox = stroke.nodeOffset.x; oy = stroke.nodeOffset.y }
            }

            // Split this stroke: collect segments of points that are OUTSIDE the eraser radius
            const segments: StrokePoint[][] = []
            let currentSeg: StrokePoint[] = []

            for (const p of stroke.points) {
                const dx = (p.x + ox) - flowX
                const dy = (p.y + oy) - flowY
                if (dx * dx + dy * dy <= r2) {
                    // Point is inside eraser — break the segment
                    if (currentSeg.length >= 2) {
                        segments.push(currentSeg)
                    }
                    currentSeg = []
                } else {
                    currentSeg.push(p)
                }
            }
            if (currentSeg.length >= 2) {
                segments.push(currentSeg)
            }

            if (segments.length === 1 && segments[0].length === stroke.points.length) {
                // Nothing was erased from this stroke
                newStrokes.push(stroke)
            } else {
                changed = true
                removedStrokes.push(stroke)
                // Create new strokes from remaining segments
                for (let i = 0; i < segments.length; i++) {
                    newStrokes.push({
                        ...stroke,
                        id: `${stroke.id}-seg${i}-${Date.now()}`,
                        points: segments[i],
                    })
                }
            }
        }

        if (changed) {
            set((state) => ({
                drawingStrokes: newStrokes,
                whiteboardUndoStack: [...state.whiteboardUndoStack.slice(-49), { type: 'removeStrokes' as const, strokes: removedStrokes }],
                whiteboardRedoStack: [],
            }))
        }
    },

    setDrawingStrokes: (strokes) => set({ drawingStrokes: strokes }),

    whiteboardUndo: () => {
        const { whiteboardUndoStack, nodes } = get()
        if (whiteboardUndoStack.length === 0) return
        const action = whiteboardUndoStack[whiteboardUndoStack.length - 1]
        const newUndo = whiteboardUndoStack.slice(0, -1)

        switch (action.type) {
            case 'addStroke':
                // Undo an add → remove the stroke
                set((state) => ({
                    drawingStrokes: state.drawingStrokes.filter((s) => s.id !== action.stroke.id),
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack, action],
                }))
                break
            case 'removeStroke':
                // Undo a remove → add the stroke back
                set((state) => ({
                    drawingStrokes: [...state.drawingStrokes, action.stroke],
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack, action],
                }))
                break
            case 'removeStrokes':
                // Undo a bulk remove → add all strokes back
                set((state) => ({
                    drawingStrokes: [...state.drawingStrokes, ...action.strokes],
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack, action],
                }))
                break
            case 'moveStrokes': {
                // Undo a move → restore before-strokes
                const afterIds = new Set(action.after.map((s) => s.id))
                set((state) => ({
                    drawingStrokes: [...state.drawingStrokes.filter((s) => !afterIds.has(s.id)), ...action.before],
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack, action],
                }))
                break
            }
            case 'addText': {
                // Undo text add → remove the node
                const nodeToRemove = nodes.find((n) => n.id === action.nodeId)
                set((state) => ({
                    nodes: state.nodes.filter((n) => n.id !== action.nodeId),
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack,
                        nodeToRemove
                            ? { type: 'removeText' as const, nodeId: action.nodeId, nodeSnapshot: { ...nodeToRemove, data: { ...nodeToRemove.data } } as unknown as Record<string, unknown> }
                            : action
                    ],
                }))
                break
            }
            case 'removeText': {
                // Undo text remove → restore the node
                const snapshot = action.nodeSnapshot as unknown as Node
                set((state) => ({
                    nodes: [...state.nodes, snapshot],
                    whiteboardUndoStack: newUndo,
                    whiteboardRedoStack: [...state.whiteboardRedoStack, { type: 'addText' as const, nodeId: action.nodeId }],
                }))
                break
            }
        }
    },

    whiteboardRedo: () => {
        const { whiteboardRedoStack, nodes } = get()
        if (whiteboardRedoStack.length === 0) return
        const action = whiteboardRedoStack[whiteboardRedoStack.length - 1]
        const newRedo = whiteboardRedoStack.slice(0, -1)

        switch (action.type) {
            case 'addStroke':
                // Redo an add → add the stroke
                set((state) => ({
                    drawingStrokes: [...state.drawingStrokes, action.stroke],
                    whiteboardRedoStack: newRedo,
                    whiteboardUndoStack: [...state.whiteboardUndoStack, action],
                }))
                break
            case 'removeStroke':
                // Redo a remove → remove the stroke
                set((state) => ({
                    drawingStrokes: state.drawingStrokes.filter((s) => s.id !== action.stroke.id),
                    whiteboardRedoStack: newRedo,
                    whiteboardUndoStack: [...state.whiteboardUndoStack, action],
                }))
                break
            case 'removeStrokes':
                set((state) => {
                    const idSet = new Set(action.strokes.map((s) => s.id))
                    return {
                        drawingStrokes: state.drawingStrokes.filter((s) => !idSet.has(s.id)),
                        whiteboardRedoStack: newRedo,
                        whiteboardUndoStack: [...state.whiteboardUndoStack, action],
                    }
                })
                break
            case 'moveStrokes': {
                // Redo a move → apply after-strokes
                const beforeIds = new Set(action.before.map((s) => s.id))
                set((state) => ({
                    drawingStrokes: [...state.drawingStrokes.filter((s) => !beforeIds.has(s.id)), ...action.after],
                    whiteboardRedoStack: newRedo,
                    whiteboardUndoStack: [...state.whiteboardUndoStack, action],
                }))
                break
            }
            case 'addText':
                // Redo text add → restore the node (we need snapshot from the previous undo)
                // This case only fires if the redo stack has the right snapshot
                set((state) => ({
                    whiteboardRedoStack: newRedo,
                    whiteboardUndoStack: [...state.whiteboardUndoStack, action],
                }))
                break
            case 'removeText': {
                const nodeToRemove = nodes.find((n) => n.id === action.nodeId)
                set((state) => ({
                    nodes: state.nodes.filter((n) => n.id !== action.nodeId),
                    whiteboardRedoStack: newRedo,
                    whiteboardUndoStack: [...state.whiteboardUndoStack,
                        nodeToRemove
                            ? { type: 'removeText' as const, nodeId: action.nodeId, nodeSnapshot: { ...nodeToRemove, data: { ...nodeToRemove.data } } as unknown as Record<string, unknown> }
                            : action
                    ],
                }))
                break
            }
        }
    },
}))

export { STORAGE_KEY }
