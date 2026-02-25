import axios from 'axios'
import type { UploadResponse, QuizQuestion, QuizNodeInput, ValidateAnswerResponse } from '../types'

// In production (Vercel) VITE_API_BASE_URL is not set → '' → relative same-origin calls.
// In local dev it is set via .env.development → 'http://localhost:8000'.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

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
    raw_text: string,
    pdf_id?: string,
    source_type: 'struggling' | 'page' = 'struggling',
    page_index?: number,
    page_content?: string,
    image_base64?: string
): Promise<QuizQuestion[]> => {
    const response = await api.post<QuizQuestion[]>('/api/quiz', {
        struggling_nodes,
        raw_text,
        pdf_id,
        source_type,
        page_index,
        page_content,
        image_base64
    })
    return response.data
}

export const validateAnswer = async (
    question: string,
    student_answer: string,
    raw_text: string,
    question_type: 'short_answer' | 'mcq' = 'short_answer',
    correct_option?: number
): Promise<ValidateAnswerResponse> => {
    const response = await api.post<ValidateAnswerResponse>('/api/validate', {
        question,
        student_answer,
        raw_text,
        question_type,
        correct_option,
    })
    return response.data
}

/**
 * Ask Gemini for a short title (max 5 words) summarising the document.
 */
export const generateTitle = async (raw_text: string): Promise<string> => {
    const response = await api.post<{ title: string }>('/api/generate-title', { raw_text })
    return response.data.title
}

/**
 * Generate 3-5 short-answer quiz questions for a single page's content.
 */
export const generatePageQuiz = async (page_content: string, pdf_id?: string, page_index?: number, image_base64?: string): Promise<{ questions: string[] }> => {
    const response = await api.post<{ questions: string[] }>('/api/page-quiz', { page_content, pdf_id, page_index, image_base64 })
    return response.data
}

/**
 * Grade a student's answer to a page-quiz question and return direct feedback.
 */
export const gradeAnswer = async (
    question: string,
    student_answer: string,
    page_content: string,
    user_details?: { name: string; age: string; status: string; educationLevel: string },
    pdf_id?: string,
    page_index?: number,
    image_base64?: string
): Promise<{ feedback: string }> => {
    const response = await api.post<{ feedback: string }>('/api/grade-answer', {
        question,
        student_answer,
        page_content,
        user_details,
        pdf_id,
        page_index,
        image_base64,
    })
    return response.data
}

/**
 * Generate flash cards from struggling nodes.
 */
export const generateFlashcards = async (
    struggling_nodes: QuizNodeInput[],
    raw_text: string,
    pdf_id?: string,
    source_type: 'struggling' | 'page' = 'struggling',
    page_index?: number,
    page_content?: string,
    existing_flashcards?: string[],
    image_base64?: string
): Promise<{ question: string; answer: string }[]> => {
    const response = await api.post<{ question: string; answer: string }[]>('/api/flashcards', {
        struggling_nodes,
        raw_text,
        pdf_id,
        source_type,
        page_index,
        page_content,
        existing_flashcards,
        image_base64
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
