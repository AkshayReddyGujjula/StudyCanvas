import axios from 'axios'
import type { UploadResponse, QuizQuestion, QuizNodeInput, ValidateAnswerResponse } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
    baseURL: API_BASE,
})

export const uploadPdf = async (file: File): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post<UploadResponse>('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
}

export const generateQuiz = async (
    struggling_nodes: QuizNodeInput[],
    raw_text: string
): Promise<QuizQuestion[]> => {
    const response = await api.post<QuizQuestion[]>('/api/quiz', {
        struggling_nodes,
        raw_text,
    })
    return response.data
}

export const validateAnswer = async (
    question: string,
    student_answer: string,
    raw_text: string
): Promise<ValidateAnswerResponse> => {
    const response = await api.post<ValidateAnswerResponse>('/api/validate', {
        question,
        student_answer,
        raw_text,
    })
    return response.data
}

/**
 * Stream a query response using native fetch + ReadableStream + AbortController.
 * Axios cannot stream in the browser. Returns the Response object for the caller
 * to read the stream via response.body.getReader().
 */
export const streamQuery = async (
    request: {
        question: string
        highlighted_text: string
        raw_text: string
        parent_response: string | null
        chat_history?: { role: 'user' | 'model'; content: string }[]
        user_details?: {
            name: string
            age: string
            status: string
            educationLevel: string
        }
    },
    signal: AbortSignal
): Promise<Response> => {
    const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
    })
    return response
}
