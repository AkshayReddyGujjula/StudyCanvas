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

export interface ChatMessage {
    role: "user" | "model"
    content: string
}

export interface AnswerNodeData {
    question: string
    highlighted_text: string
    answer: string
    isLoading: boolean
    isStreaming: boolean
    status: NodeStatus
    parentResponseText?: string
    isMinimized?: boolean
    isExpanding?: boolean
    chatHistory?: ChatMessage[]
}

export interface UploadResponse {
    markdown_content: string
    raw_text: string
    filename: string
    page_count: number
}

export interface QuizQuestion {
    question: string
}

export interface ValidateAnswerResponse {
    is_correct: boolean
    explanation: string
}

export interface QuizNodeInput {
    highlighted_text: string
    question: string
    answer: string
}
