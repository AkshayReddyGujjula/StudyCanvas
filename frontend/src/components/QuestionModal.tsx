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
    const [copied, setCopied] = useState(false)
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

    const handleCopyText = useCallback(() => {
        navigator.clipboard.writeText(selectedText).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {/* silently ignore clipboard errors */})
    }, [selectedText])

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
                        onClick={handleCopyText}
                        title="Copy extracted text to clipboard"
                        className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        {copied ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span className="text-green-700 font-medium">Copied!</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Copy Text
                            </>
                        )}
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
