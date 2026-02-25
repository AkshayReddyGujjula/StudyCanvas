import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { HighlightEntry } from '../types'
import { savePdfToLocal, loadPdfFromLocal, deletePdfFromLocal } from '../utils/pdfStorage'

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
    /** Whether the user is currently in image snipping mode */
    isSnippingMode: boolean
    /** Raw PDF ArrayBuffer stored in-memory (loaded from IndexedDB) */
    pdfArrayBuffer: ArrayBuffer | null
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
    persistToLocalStorage: () => void
    setUserDetails: (details: UserDetails) => void
    setCurrentPage: (page: number) => void
    setPageMarkdowns: (markdowns: string[]) => void
    /** Set zoom level for PDF viewer */
    setZoomLevel: (zoom: number) => void
    /** Update scroll position for a specific page */
    updateScrollPosition: (page: number, position: number) => void
    /** Merge a partial data patch into a quiz question node */
    updateQuizNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
    /** Append a chat message to a quiz question node's chatHistory */
    addQuizChatMessage: (nodeId: string, message: { role: 'user' | 'model'; content: string }) => void
    /** Return all quiz question nodes for the given page */
    getQuizNodesForPage: (pageIndex: number) => Node[]
    /** Toggle snipping mode */
    setIsSnippingMode: (isSnipping: boolean) => void
    /** Store a PDF ArrayBuffer in memory + IndexedDB */
    setPdfArrayBuffer: (buffer: ArrayBuffer | null) => void
    /** Load the PDF ArrayBuffer from IndexedDB into memory */
    loadPdfFromStorage: () => Promise<void>
}

const STORAGE_KEY = 'studycanvas_state'

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
    isSnippingMode: false,
    pdfArrayBuffer: null,

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
            isSnippingMode: false,
            pdfArrayBuffer: null,
        })
        localStorage.removeItem(STORAGE_KEY)
    },

    persistToLocalStorage: () => {
        const { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions } = get()
        // Never persist activeAbortController — it is a transient runtime field
        const state = { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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

    setIsSnippingMode: (isSnipping) => set({ isSnippingMode: isSnipping }),

    setPdfArrayBuffer: (buffer) => set({ pdfArrayBuffer: buffer }),

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
}))

export { STORAGE_KEY }
