import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { HighlightEntry } from '../types'

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
}

const STORAGE_KEY = 'studycanvas_state'

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
    nodes: [],
    edges: [],
    fileData: null,
    highlights: [],
    activeAbortController: null,
    userDetails: { name: '', age: '', status: '', educationLevel: '' },

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
            userDetails: { name: '', age: '', status: '', educationLevel: '' },
        })
        localStorage.removeItem(STORAGE_KEY)
    },

    persistToLocalStorage: () => {
        const { nodes, edges, fileData, highlights, userDetails } = get()
        // Never persist activeAbortController — it is a transient runtime field
        const state = { nodes, edges, fileData, highlights, userDetails }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    },

    setUserDetails: (details) => set({ userDetails: details }),
}))

export { STORAGE_KEY }
