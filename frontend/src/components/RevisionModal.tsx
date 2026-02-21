import { useState, useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { generateQuiz, validateAnswer } from '../api/studyApi'
import type { AnswerNodeData, QuizQuestion, ValidateAnswerResponse } from '../types'

interface RevisionModalProps {
    nodes: Node[]
    rawText: string
    onClose: () => void
}

export default function RevisionModal({ nodes, rawText, onClose }: RevisionModalProps) {
    const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [answerText, setAnswerText] = useState('')
    const [validating, setValidating] = useState(false)
    const [validationResult, setValidationResult] = useState<ValidateAnswerResponse | null>(null)
    const [score, setScore] = useState(0)
    const [showScore, setShowScore] = useState(false)

    useEffect(() => {
        const strugglingNodes = nodes.filter(
            (n) => n.type === 'answerNode' && (n.data as unknown as AnswerNodeData).status === 'struggling'
        )
        const input = strugglingNodes.map((n) => {
            const d = n.data as unknown as AnswerNodeData
            return {
                highlighted_text: d.highlighted_text,
                question: d.question,
                answer: d.answer,
            }
        })

        generateQuiz(input, rawText)
            .then((qs) => {
                setQuestions(qs)
                setLoading(false)
            })
            .catch((err) => {
                setError('Failed to generate quiz. Please try again.')
                setLoading(false)
                console.error(err)
            })
    }, [nodes, rawText])

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!answerText.trim() || !current || validationResult || validating) return

        setValidating(true)
        try {
            const res = await validateAnswer(current.question, answerText, rawText)
            setValidationResult(res)
            if (res.is_correct) setScore((s) => s + 1)
        } catch (err) {
            console.error(err)
            // Error handling fallback
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
            setAnswerText('')
            setValidationResult(null)
        }
    }

    const current = questions?.[currentIndex]

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-8">
                {loading && (
                    <div className="flex flex-col items-center gap-4 py-12">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-600">Generating your revision quiz...</p>
                    </div>
                )}

                {error && (
                    <div className="text-center py-12">
                        <p className="text-red-500 mb-4">{error}</p>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                            Close
                        </button>
                    </div>
                )}

                {!loading && !error && showScore && (
                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">🎯</div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">
                            You scored {score}/{questions?.length ?? 0}
                        </h2>
                        <p className="text-gray-600 mb-6">
                            {score === questions?.length
                                ? "Perfect score! You've got this! 🎉"
                                : score >= Math.floor((questions?.length ?? 0) / 2)
                                    ? 'Good effort! Keep reviewing the topics you missed.'
                                    : 'Keep studying — you\'ll get there!'}
                        </p>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                )}

                {!loading && !error && !showScore && current && (
                    <div>
                        {/* Progress */}
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-sm text-gray-500 font-medium">
                                Question {currentIndex + 1} of {questions?.length ?? 0}
                            </span>
                            <div className="flex gap-1">
                                {questions?.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-2 h-2 rounded-full ${i < currentIndex
                                            ? 'bg-indigo-400'
                                            : i === currentIndex
                                                ? 'bg-indigo-600'
                                                : 'bg-gray-200'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Question */}
                        <h3 className="text-lg font-semibold text-gray-800 mb-5">{current.question}</h3>

                        {/* Text Input area */}
                        <form onSubmit={handleSubmit} className="mb-6">
                            <textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                disabled={validationResult !== null || validating}
                                placeholder="Type your answer here..."
                                className="w-full p-4 rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500"
                                rows={4}
                            />
                            {!validationResult && (
                                <div className="mt-3 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={!answerText.trim() || validating}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 flex flex-row items-center gap-2"
                                    >
                                        {validating ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Validating...
                                            </>
                                        ) : 'Submit Answer'}
                                    </button>
                                </div>
                            )}
                        </form>

                        {/* Explanation */}
                        {validationResult && (
                            <div className={`mb-4 px-4 py-3 border rounded-lg text-sm ${validationResult.is_correct ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                <div className="flex items-center gap-2 mb-1.5 font-bold text-base">
                                    {validationResult.is_correct ? '✅ Correct' : '❌ Incorrect'}
                                </div>
                                <strong>Explanation:</strong> {validationResult.explanation}
                            </div>
                        )}

                        {/* Next button */}
                        {validationResult !== null && (
                            <div className="flex justify-end">
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    {currentIndex >= (questions?.length ?? 0) - 1 ? 'See Score' : 'Next →'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
