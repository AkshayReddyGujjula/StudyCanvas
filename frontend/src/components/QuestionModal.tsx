import { useRef, useState, useEffect, useCallback } from 'react'

interface QuestionModalProps {
    selectedText: string
    sourceNodeId: string
    preGeneratedNodeId: string
    onSubmit: (question: string) => void
    onCancel: () => void
}

export default function QuestionModal({
    selectedText,
    onSubmit,
    onCancel,
}: QuestionModalProps) {
    const [question, setQuestion] = useState('')
    const [error, setError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSubmit = useCallback(() => {
        if (!question.trim()) {
            setError('Type a question first')
            return
        }
        onSubmit(question.trim())
    }, [question, onSubmit])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') onCancel()
        },
        [handleSubmit, onCancel]
    )

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel()
            }}
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
                {/* Quote block */}
                <div className="mb-4 px-4 py-3 bg-yellow-50 border-l-4 border-yellow-400 rounded text-sm text-gray-600 italic">
                    &ldquo;{selectedText.slice(0, 200)}{selectedText.length > 200 ? '...' : ''}&rdquo;
                </div>

                {/* Question input */}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your question
                </label>
                <input
                    ref={inputRef}
                    type="text"
                    value={question}
                    onChange={(e) => {
                        setQuestion(e.target.value)
                        setError('')
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="What would you like to know about this?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

                {/* Actions */}
                <div className="flex gap-3 mt-4 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                        Ask
                    </button>
                </div>
            </div>
        </div>
    )
}
