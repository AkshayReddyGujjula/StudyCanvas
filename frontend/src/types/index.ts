export type NodeStatus = "loading" | "unread" | "understood" | "struggling"

export interface HighlightEntry {
    id: string
    text: string
    nodeId: string
}

export interface ContentNodeData {
    markdown_content: string
    filename: string
    page_count: number
}

export interface AnswerNodeData {
    question: string
    highlighted_text: string
    answer: string
    isLoading: boolean
    isStreaming: boolean
    status: NodeStatus
    parentResponseText?: string
}

export interface UploadResponse {
    markdown_content: string
    raw_text: string
    filename: string
    page_count: number
}

export interface QuizQuestion {
    question: string
    options: Record<string, string>
    answer: "A" | "B" | "C" | "D"
    explanation: string
}

export interface QuizNodeInput {
    highlighted_text: string
    question: string
    answer: string
}
