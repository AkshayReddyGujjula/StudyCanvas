import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { HighlightEntry } from '../types'

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
}

interface CanvasActions {
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void
    setFileData: (data: FileData) => void
    addHighlight: (entry: HighlightEntry) => void
    updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
    setActiveAbortController: (controller: AbortController | null) => void
    resetCanvas: () => void
    persistToLocalStorage: () => void
    setUserDetails: (details: UserDetails) => void
    setCurrentPage: (page: number) => void
    setPageMarkdowns: (markdowns: string[]) => void
    /** Merge a partial data patch into a quiz question node */
    updateQuizNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
    /** Append a chat message to a quiz question node's chatHistory */
    addQuizChatMessage: (nodeId: string, message: { role: 'user' | 'model'; content: string }) => void
    /** Return all quiz question nodes for the given page */
    getQuizNodesForPage: (pageIndex: number) => Node[]
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

    setNodes: (nodes) =>
        set((state) => ({
            nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
        })),

    setEdges: (edges) =>
        set((state) => ({
            edges: typeof edges === 'function' ? edges(state.edges) : edges,
        })),

    setFileData: (data) => {
        const pages = splitMarkdownByPage(data.markdown_content)
        set({ fileData: data, pageMarkdowns: pages, currentPage: 1 })
    },

    addHighlight: (entry) =>
        set((state) => ({ highlights: [...state.highlights, entry] })),

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

    resetCanvas: () => {
        const { activeAbortController } = get()
        activeAbortController?.abort()
        set({
            nodes: [],
            edges: [],
            fileData: null,
            highlights: [],
            activeAbortController: null,
            userDetails: { name: '', age: '', status: '', educationLevel: '' },
            currentPage: 1,
            pageMarkdowns: [],
        })
        localStorage.removeItem(STORAGE_KEY)
    },

    persistToLocalStorage: () => {
        const { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns } = get()
        // Never persist activeAbortController — it is a transient runtime field
        const state = { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns }
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
}))

export { STORAGE_KEY }
