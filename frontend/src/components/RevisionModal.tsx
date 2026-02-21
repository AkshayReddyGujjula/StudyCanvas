import { useState, useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { generateQuiz } from '../api/studyApi'
import type { AnswerNodeData, QuizQuestion } from '../types'

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
    const [selected, setSelected] = useState<string | null>(null)
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

    const handleOptionSelect = (key: string) => {
        if (selected !== null) return // already answered
        setSelected(key)
        if (questions && key === questions[currentIndex].answer) {
            setScore((s) => s + 1)
        }
    }

    const handleNext = () => {
        if (!questions) return
        if (currentIndex >= questions.length - 1) {
            setShowScore(true)
        } else {
            setCurrentIndex((i) => i + 1)
            setSelected(null)
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
                            You scored {score}/{questions?.length ?? 4}
                        </h2>
                        <p className="text-gray-600 mb-6">
                            {score === questions?.length
                                ? "Perfect score! You've got this! 🎉"
                                : score >= Math.floor((questions?.length ?? 4) / 2)
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
                                Question {currentIndex + 1} of {questions?.length ?? 4}
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

                        {/* Options */}
                        <div className="space-y-3 mb-6">
                            {Object.entries(current.options).map(([key, value]) => {
                                let cls =
                                    'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors cursor-pointer'
                                if (selected === null) {
                                    cls += ' border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
                                } else if (key === current.answer) {
                                    cls += ' border-green-500 bg-green-50 text-green-800 font-medium'
                                } else if (key === selected) {
                                    cls += ' border-red-500 bg-red-50 text-red-800'
                                } else {
                                    cls += ' border-gray-200 text-gray-400'
                                }

                                return (
                                    <button key={key} className={cls} onClick={() => handleOptionSelect(key)}>
                                        <span className="font-bold mr-2">{key}.</span>
                                        {value}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Explanation */}
                        {selected !== null && (
                            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                                <strong>Explanation:</strong> {current.explanation}
                            </div>
                        )}

                        {/* Next button */}
                        {selected !== null && (
                            <div className="flex justify-end">
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    {currentIndex >= (questions?.length ?? 4) - 1 ? 'See Score' : 'Next →'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
