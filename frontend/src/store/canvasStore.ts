import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { HighlightEntry } from '../types'

interface FileData {
    markdown_content: string
    raw_text: string
    filename: string
    page_count: number
}

interface CanvasState {
    nodes: Node[]
    edges: Edge[]
    fileData: FileData | null
    highlights: HighlightEntry[]
    activeAbortController: AbortController | null
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
}

const STORAGE_KEY = 'studycanvas_state'

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
    nodes: [],
    edges: [],
    fileData: null,
    highlights: [],
    activeAbortController: null,

    setNodes: (nodes) =>
        set((state) => ({
            nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
        })),

    setEdges: (edges) =>
        set((state) => ({
            edges: typeof edges === 'function' ? edges(state.edges) : edges,
        })),

    setFileData: (data) => set({ fileData: data }),

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

    resetCanvas: () => {
        const { activeAbortController } = get()
        activeAbortController?.abort()
        set({
            nodes: [],
            edges: [],
            fileData: null,
            highlights: [],
            activeAbortController: null,
        })
        localStorage.removeItem(STORAGE_KEY)
    },

    persistToLocalStorage: () => {
        const { nodes, edges, fileData, highlights } = get()
        // Never persist activeAbortController — it is a transient runtime field
        const state = { nodes, edges, fileData, highlights }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    },
}))

export { STORAGE_KEY }
