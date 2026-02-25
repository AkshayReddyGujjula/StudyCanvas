import { useState, useEffect, useRef, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '../store/canvasStore'
import { extractPageImageBase64 } from '../utils/pdfImageExtractor'
import { generateQuiz, validateAnswer } from '../api/studyApi'
import type { AnswerNodeData, QuizQuestion, ValidateAnswerResponse } from '../types'

interface RevisionModalProps {
    nodes: Node[]
    rawText: string
    pdfId?: string
    onClose: () => void
    sourceType?: 'struggling' | 'page'
    pageIndex?: number
    pageContent?: string
}

interface QuestionState {
    answerText: string
    selectedOption: number | null
    validationResult: ValidateAnswerResponse | null
}

const emptyQuestionState = (): QuestionState => ({
    answerText: '',
    selectedOption: null,
    validationResult: null,
})

export default function RevisionModal({
    nodes,
    rawText,
    pdfId,
    onClose,
    sourceType = 'struggling',
    pageIndex,
    pageContent
}: RevisionModalProps) {
    const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)

    // Per-question answer state — indexed by question index
    const [questionStates, setQuestionStates] = useState<QuestionState[]>([])

    // Transient "validating" indicator (not stored per-question as it's ephemeral)
    const [validating, setValidating] = useState(false)

    const [showScore, setShowScore] = useState(false)

    // Guard: only generate the quiz once on mount, never re-fetch if canvas updates.
    const hasFetchedRef = useRef(false)

    useEffect(() => {
        if (hasFetchedRef.current) return
        hasFetchedRef.current = true

        let input: any[] = []
        if (sourceType !== 'page') {
            const strugglingNodes = nodes.filter(
                (n) => n.type === 'answerNode' && (n.data as unknown as AnswerNodeData).status === 'struggling'
            )
            input = strugglingNodes.map((n) => {
                const d = n.data as unknown as AnswerNodeData
                return {
                    highlighted_text: d.highlighted_text,
                    question: d.question,
                    answer: d.answer,
                    page_index: d.pageIndex ? d.pageIndex - 1 : undefined,
                }
            })
        }

        const fetchQuiz = async () => {
            let imageBase64: string | undefined
            if (sourceType === 'page' && pageContent !== undefined && pageContent.length < 50) {
                const pdfBuffer = useCanvasStore.getState().pdfArrayBuffer
                if (pdfBuffer && pageIndex !== undefined) {
                    const b64 = await extractPageImageBase64(pdfBuffer, pageIndex)
                    if (b64) imageBase64 = b64
                }
            }

            try {
                const qs = await generateQuiz(input, rawText, pdfId, sourceType, pageIndex, pageContent, imageBase64)
                setQuestions(qs)
                setQuestionStates(qs.map(() => emptyQuestionState()))
                setLoading(false)
            } catch (err) {
                setError('Failed to generate quiz. Please try again.')
                setLoading(false)
                console.error(err)
            }
        }

        fetchQuiz()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once on mount

    const current = questions?.[currentIndex]

    // Derived current-question state
    const currentState: QuestionState = questionStates[currentIndex] ?? emptyQuestionState()
    const { answerText, selectedOption, validationResult } = currentState

    const updateCurrentState = useCallback((update: Partial<QuestionState>) => {
        setQuestionStates((prev) => {
            const next = [...prev]
            next[currentIndex] = { ...(next[currentIndex] ?? emptyQuestionState()), ...update }
            return next
        })
    }, [currentIndex])

    // Score derived from all answered questions (no double counting when navigating)
    const score = questionStates.reduce((sum, s) => {
        if (!s.validationResult) return sum
        if (s.validationResult.status === 'correct') return sum + 1
        if (s.validationResult.status === 'partial') return sum + 0.5
        return sum
    }, 0)

    // ── MCQ: select an option immediately validates ──────────────────────
    const handleOptionSelect = async (optionIndex: number) => {
        if (selectedOption !== null || !current) return  // already answered
        updateCurrentState({ selectedOption: optionIndex })

        const isCorrect = optionIndex === current.correct_option
        const result: ValidateAnswerResponse = {
            status: isCorrect ? 'correct' : 'incorrect',
            explanation: isCorrect
                ? "That's exactly right!"
                : `Not quite. The correct answer was choice ${String.fromCharCode(65 + (current.correct_option ?? 0))}: "${current.options?.[current.correct_option ?? 0]}".`,
        }
        updateCurrentState({ selectedOption: optionIndex, validationResult: result })
    }

    // ── Short answer: submit via API ─────────────────────────────────────
    const handleShortAnswerSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!answerText.trim() || !current || validationResult || validating) return

        setValidating(true)
        try {
            const res = await validateAnswer(
                current.question,
                answerText,
                rawText,
                'short_answer',
            )
            updateCurrentState({ validationResult: res })
        } catch (err) {
            console.error(err)
        } finally {
            setValidating(false)
        }
    }

    const handleNext = () => {
        if (!questions) return
        if (currentIndex >= questions.length - 1) {
            setShowScore(true)
        } else {
            setCurrentIndex((i) => i + 1)
        }
    }

    const handleBack = () => {
        if (currentIndex > 0) {
            setCurrentIndex((i) => i - 1)
        }
    }

    // ── Option button styling ────────────────────────────────────────────
    const getOptionClass = (optionIndex: number): string => {
        const base =
            'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors '
        if (selectedOption === null) {
            return base + 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
        }
        if (optionIndex === current?.correct_option) {
            return base + 'border-green-400 bg-green-50 text-green-800 font-medium cursor-default'
        }
        if (optionIndex === selectedOption) {
            return base + 'border-red-400 bg-red-50 text-red-800 cursor-default'
        }
        return base + 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-8 relative max-h-[90vh] overflow-y-auto">

                {/* ── Always-visible close button ── */}
                <button
                    onClick={onClose}
                    aria-label="Close quiz"
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors z-10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>

                {/* ── Loading ── */}
                {loading && (
                    <div className="flex flex-col items-center gap-4 py-12">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-600">Generating your revision quiz...</p>
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div className="text-center py-12">
                        <p className="text-red-500 mb-4">{error}</p>
                    </div>
                )}

                {/* ── Score screen ── */}
                {!loading && !error && showScore && (
                    <div className="text-center py-12">
                        <div className="mb-4 flex justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="6" />
                                <circle cx="12" cy="12" r="2" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">
                            You scored {score}/{questions?.length ?? 0}
                        </h2>
                        <p className="text-gray-600 mb-6">
                            {score === questions?.length
                                ? "Perfect score! You've got this!"
                                : score >= Math.floor((questions?.length ?? 0) / 2)
                                    ? 'Good effort! Keep reviewing the topics you missed.'
                                    : "Keep studying — you'll get there!"}
                        </p>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                        >
                            Finish
                        </button>
                    </div>
                )}

                {/* ── Question screen ── */}
                {!loading && !error && !showScore && current && (
                    <div>
                        {/* Progress */}
                        <div className="flex items-center justify-between mb-6 pr-8">
                            <span className="text-sm text-gray-500 font-medium">
                                Question {currentIndex + 1} of {questions?.length ?? 0}
                            </span>
                            <div className="flex items-center gap-3">
                                {current.question_type === 'mcq' ? (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                        Multiple Choice
                                    </span>
                                ) : (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                        Short Answer
                                    </span>
                                )}
                                <div className="flex gap-1">
                                    {questions?.map((_, i) => {
                                        const answered = !!questionStates[i]?.validationResult
                                        return (
                                            <div
                                                key={i}
                                                className={`w-2 h-2 rounded-full ${i === currentIndex
                                                    ? 'bg-indigo-600'
                                                    : answered
                                                        ? 'bg-indigo-400'
                                                        : 'bg-gray-200'
                                                    }`}
                                            />
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Question text */}
                        <h3 className="text-xl font-bold text-gray-800 mb-6 leading-tight pr-6">
                            {current.question}
                        </h3>

                        {/* ── MCQ options ── */}
                        {current.question_type === 'mcq' && current.options && current.options.length === 4 ? (
                            <div className="flex flex-col gap-3 mb-6">
                                {current.options.map((opt, i) => (
                                    <button
                                        key={opt + i}
                                        onClick={() => handleOptionSelect(i)}
                                        className={getOptionClass(i)}
                                        disabled={selectedOption !== null}
                                    >
                                        <span className="font-semibold mr-2 text-gray-500">
                                            {String.fromCharCode(65 + i)}.
                                        </span>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            /* ── Default to Short answer if not a valid MCQ ── */
                            <form onSubmit={handleShortAnswerSubmit} className="mb-6 block w-full">
                                <label className="block text-sm font-medium text-gray-500 mb-2">
                                    Your Answer
                                </label>
                                <textarea
                                    autoFocus
                                    value={answerText}
                                    onChange={(e) => updateCurrentState({ answerText: e.target.value })}
                                    disabled={validationResult !== null || validating}
                                    placeholder="Type your explanation here..."
                                    className="w-full p-4 rounded-xl border-2 border-gray-100 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none resize-none transition-all disabled:bg-gray-50 disabled:text-gray-500 bg-white"
                                    rows={5}
                                />
                                {!validationResult && (
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={!answerText.trim() || validating}
                                            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none flex flex-row items-center gap-2"
                                        >
                                            {validating ? (
                                                <>
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Validating...
                                                </>
                                            ) : 'Check Answer'}
                                        </button>
                                    </div>
                                )}
                            </form>
                        )}

                        {/* ── Explanation / feedback ── */}
                        {validationResult && (
                            <div
                                className={`mb-4 px-4 py-3 border rounded-lg text-sm transition-all ${validationResult.status === 'correct'
                                    ? 'bg-green-50 border-green-200 text-green-800'
                                    : validationResult.status === 'partial'
                                        ? 'bg-orange-50 border-orange-200 text-orange-800'
                                        : 'bg-red-50 border-red-200 text-red-800'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-1.5 font-bold text-base">
                                    {validationResult.status === 'correct' ? (
                                        <span className="flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                            Correct
                                        </span>
                                    ) : validationResult.status === 'partial' ? (
                                        <span className="flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18V4a8 8 0 0 1 0 16z" /></svg>
                                            Partially Correct
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            Incorrect
                                        </span>
                                    )}
                                </div>
                                <strong className="opacity-75">Explanation:</strong> {validationResult.explanation}
                            </div>
                        )}

                        {/* ── Back / Next navigation ── */}
                        <div className="flex items-center justify-between mt-2">
                            {/* Back button — always visible but disabled on first question */}
                            <button
                                onClick={handleBack}
                                disabled={currentIndex === 0}
                                className="px-5 py-2 rounded-lg font-medium text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                ← Back
                            </button>

                            {/* Next / See Score — only shown once the question is answered */}
                            {validationResult !== null ? (
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    {currentIndex >= (questions?.length ?? 0) - 1 ? 'See Score' : 'Next →'}
                                </button>
                            ) : (
                                /* Placeholder so Back stays left-aligned */
                                <div />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

