import axios from 'axios'
import type { UploadResponse, QuizQuestion, QuizNodeInput, ValidateAnswerResponse } from '../types'
import { extractPdfPagesText } from '../utils/pdfTextExtractor'
import { useUsageStore } from '../store/usageStore'

// In production (Vercel) VITE_API_BASE_URL is not set → '' → relative same-origin calls.
// In local dev it is set via .env.development → 'http://localhost:8000'.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

const api = axios.create({
    baseURL: API_BASE,
})

// The lite model ID (matches backend MODEL_LITE constant)
const LITE_MODEL_ID = 'gemini-2.5-flash-lite'

function modelTier(modelUsed: string): 'lite' | 'flash' {
    return modelUsed === LITE_MODEL_ID ? 'lite' : 'flash'
}

function recordUsage(modelUsed: string, inputTokens: number, outputTokens: number, endpoint: string) {
    if (inputTokens > 0 || outputTokens > 0) {
        useUsageStore.getState().addEntry({
            timestamp: Date.now(),
            model: modelTier(modelUsed),
            inputTokens,
            outputTokens,
            endpoint,
        })
    }
}

/**
 * Streaming usage sentinel format: \x00USAGE:{inputTokens}:{outputTokens}
 * Backend appends this as the final chunk after all text chunks.
 */
export const USAGE_SENTINEL = '\x00USAGE:'

/**
 * Parse a raw stream chunk. Strips the usage sentinel if present, records
 * usage in the store, and returns only the displayable text portion.
 *
 * @param raw       Raw decoded chunk string from the stream
 * @param endpoint  Endpoint label for usage tracking (e.g. 'query', 'summarize')
 * @param modelUsed Model string from X-Model-Used response header
 * @returns         The displayable text portion of the chunk (sentinel stripped)
 */
export function parseStreamChunk(raw: string, endpoint: string, modelUsed: string): string {
    if (!raw.includes(USAGE_SENTINEL)) return raw

    const idx = raw.indexOf(USAGE_SENTINEL)
    const displayText = raw.slice(0, idx)
    const meta = raw.slice(idx + USAGE_SENTINEL.length)
    const parts = meta.split(':')
    if (parts.length >= 2) {
        const inputT = parseInt(parts[0], 10) || 0
        const outputT = parseInt(parts[1], 10) || 0
        recordUsage(modelUsed, inputT, outputT, endpoint)
    }
    return displayText
}

/**
 * Vercel serverless functions reject request bodies larger than ~4.5 MB.
 * For PDFs under this threshold we POST the raw binary (existing behaviour).
 * For larger PDFs we extract text client-side with pdf.js and POST the text
 * as JSON to /api/upload-text, which applies the same server-side cleanup and
 * returns an identical UploadResponse — no other code needs to change.
 */
const VERCEL_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024 // 4 MB — safe margin below 4.5 MB cap

export const uploadPdf = async (file: File): Promise<UploadResponse> => {
    if (file.size <= VERCEL_PAYLOAD_LIMIT_BYTES) {
        // Small file — use the standard binary upload (fastest path).
        const formData = new FormData()
        formData.append('file', file)
        const response = await api.post<UploadResponse>('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return response.data
    }

    // Large file — extract text in the browser to stay under the payload limit.
    const pages = await extractPdfPagesText(file)
    const response = await api.post<UploadResponse>('/api/upload-text', {
        pages,
        filename: file.name,
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
    image_base64?: string,
    canvas_context?: string
): Promise<{ questions: QuizQuestion[]; model_used: string }> => {
    const response = await api.post<{ questions: QuizQuestion[]; model_used: string; input_tokens?: number; output_tokens?: number }>('/api/quiz', {
        struggling_nodes,
        raw_text,
        pdf_id,
        source_type,
        page_index,
        page_content,
        image_base64,
        canvas_context
    })
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'quiz')
    return response.data
}

export const validateAnswer = async (
    question: string,
    student_answer: string,
    raw_text: string,
    question_type: 'short_answer' | 'mcq' = 'short_answer',
    correct_option?: number
): Promise<ValidateAnswerResponse> => {
    const response = await api.post<ValidateAnswerResponse & { model_used?: string; input_tokens?: number; output_tokens?: number }>('/api/validate', {
        question,
        student_answer,
        raw_text,
        question_type,
        correct_option,
    })
    const { input_tokens = 0, output_tokens = 0, model_used = LITE_MODEL_ID } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'validate')
    return response.data
}

/**
 * Ask Gemini for a short title (max 5 words) summarising the document.
 */
export const generateTitle = async (raw_text: string): Promise<string> => {
    const response = await api.post<{ title: string; model_used?: string; input_tokens?: number; output_tokens?: number }>('/api/generate-title', { raw_text })
    const { input_tokens = 0, output_tokens = 0, model_used = LITE_MODEL_ID } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'title')
    return response.data.title
}

/**
 * Generate 3-5 short-answer quiz questions for a single page's content.
 */
export const generatePageQuiz = async (
    page_content: string,
    pdf_id?: string,
    page_index?: number,
    image_base64?: string,
    user_details?: { name: string; age: string; status: string; educationLevel: string },
    canvas_context?: string
): Promise<{ questions: string[]; model_used: string }> => {
    const response = await api.post<{ questions: string[]; model_used: string; input_tokens?: number; output_tokens?: number }>('/api/page-quiz', { page_content, pdf_id, page_index, image_base64, user_details, canvas_context })
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'page-quiz')
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
): Promise<{ feedback: string; model_used: string }> => {
    const response = await api.post<{ feedback: string; model_used: string; input_tokens?: number; output_tokens?: number }>('/api/grade-answer', {
        question,
        student_answer,
        page_content,
        user_details,
        pdf_id,
        page_index,
        image_base64,
    })
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'grade')
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
    image_base64?: string,
    canvas_context?: string
): Promise<{ flashcards: { question: string; answer: string }[]; model_used: string }> => {
    const response = await api.post<{ flashcards: { question: string; answer: string }[]; model_used: string; input_tokens?: number; output_tokens?: number }>('/api/flashcards', {
        struggling_nodes,
        raw_text,
        pdf_id,
        source_type,
        page_index,
        page_content,
        existing_flashcards,
        image_base64,
        canvas_context
    })
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'flashcards')
    return response.data
}

/**
 * Stream a query response using native fetch + ReadableStream + AbortController.
 * Axios cannot stream in the browser. Returns the Response object for the caller
 * to read the stream via response.body.getReader().
 * Use parseStreamChunk() on each decoded chunk to strip the usage sentinel.
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
        preferred_model?: string
        image_base64?: string
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

/**
 * Stream a Vision AI-enhanced page summary.
 * Returns the Response object for streaming via response.body.getReader().
 * Use parseStreamChunk() on each decoded chunk to strip the usage sentinel.
 */
export const streamPageSummary = async (
    request: {
        page_content: string
        pdf_id?: string
        page_index?: number
        image_base64?: string
        user_details?: {
            name: string
            age: string
            status: string
            educationLevel: string
        }
    },
    signal: AbortSignal
): Promise<Response> => {
    const response = await fetch(`${API_BASE}/api/summarize-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
    })
    return response
}

export const transcribeAudio = async (
    audioBase64: string,
    mimeType: string,
): Promise<{ text: string; model_used: string }> => {
    const response = await api.post<{ text: string; model_used: string; input_tokens?: number; output_tokens?: number }>(
        '/api/transcribe',
        { audio_base64: audioBase64, mime_type: mimeType },
    )
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'transcribe')
    return response.data
}

/**
 * Stream a follow-up clarification response from the AI tutor after a revision
 * quiz question has been answered and graded. Uses Flash Lite for fast, cheap
 * conversational responses. Returns the raw Response for streaming.
 * Use parseStreamChunk() on each decoded chunk to strip the usage sentinel.
 */
export const streamQuizFollowUp = async (
    request: {
        quiz_question: string
        student_answer: string
        ai_feedback: string
        follow_up_message: string
        chat_history?: { role: 'user' | 'model'; content: string }[]
        raw_text?: string
    },
    signal: AbortSignal,
): Promise<Response> => {
    const response = await fetch(`${API_BASE}/api/quiz-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
    })
    return response
}

/**
 * Extract text from an image using Gemini Vision OCR.
 */
export const extractTextFromImage = async (
    image_base64: string,
): Promise<{ text: string; model_used: string }> => {
    const response = await api.post<{ text: string; model_used: string; input_tokens?: number; output_tokens?: number }>(
        '/api/vision',
        { image_base64 },
    )
    const { input_tokens = 0, output_tokens = 0, model_used } = response.data
    recordUsage(model_used, input_tokens, output_tokens, 'ocr')
    return response.data
}
