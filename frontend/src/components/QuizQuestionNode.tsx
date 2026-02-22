import { useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { QuizQuestionNodeData, ChatMessage, NodeStatus } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { streamQuery } from '../api/studyApi'

const customSchema: SanitizeOptions = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
    attributes: {
        ...defaultSchema.attributes,
        mark: ['className', 'dataHighlightId'],
    },
}

type QuizQuestionNodeProps = NodeProps & {
    data: QuizQuestionNodeData & {
        onGradeAnswer: (nodeId: string, question: string, answer: string) => Promise<void>
        pageMarkdown: string
    }
}

export default function QuizQuestionNode({ id, data }: QuizQuestionNodeProps) {
    const updateQuizNodeData = useCanvasStore((s) => s.updateQuizNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const fileData = useCanvasStore((s) => s.fileData)
    const userDetails = useCanvasStore((s) => s.userDetails)

    const [draftAnswer, setDraftAnswer] = useState('')
    const [followUp, setFollowUp] = useState('')
    const [isFollowUpLoading, setIsFollowUpLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)

    const handleDelete = useCallback(() => {
        if (!confirmDelete) { setConfirmDelete(true); return }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])

    const handleStatusClick = useCallback((clickedStatus: 'understood' | 'struggling') => {
        const newStatus: NodeStatus = data.status === clickedStatus ? 'unread' : clickedStatus
        updateQuizNodeData(id, { status: newStatus })
        persistToLocalStorage()
    }, [data.status, id, updateQuizNodeData, persistToLocalStorage])

    const handleMinimize = useCallback(() => {
        updateQuizNodeData(id, { isMinimized: !data.isMinimized })
        persistToLocalStorage()
    }, [data.isMinimized, id, updateQuizNodeData, persistToLocalStorage])

    const handlePin = useCallback(() => {
        updateQuizNodeData(id, { isPinned: !data.isPinned })
        persistToLocalStorage()
    }, [data.isPinned, id, updateQuizNodeData, persistToLocalStorage])

    const handleSubmitAnswer = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        const answer = draftAnswer.trim()
        if (!answer || data.isGrading) return
        // Save the draft answer on the node immediately
        updateQuizNodeData(id, { userAnswer: answer, isGrading: true })
        await data.onGradeAnswer(id, data.question, answer)
    }, [draftAnswer, data, id, updateQuizNodeData])

    const handleFollowUpSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        const q = followUp.trim()
        if (!q || isFollowUpLoading || !fileData) return
        setFollowUp('')
        setIsFollowUpLoading(true)

        // Capture history at call time before any async updates
        const baseHistory: ChatMessage[] = data.chatHistory ?? []
        const historyWithUser: ChatMessage[] = [...baseHistory, { role: 'user' as const, content: q }]

        // Build API context: quiz question, feedback, full chat, new question
        const fullHistory: ChatMessage[] = [
            { role: 'user', content: `Quiz question: ${data.question}` },
            { role: 'model', content: data.feedback ?? '' },
            ...historyWithUser,
        ]

        // Persist user message + empty model placeholder immediately
        updateQuizNodeData(id, { chatHistory: [...historyWithUser, { role: 'model' as const, content: '' }] })

        try {
            const controller = new AbortController()
            const response = await streamQuery(
                {
                    question: q,
                    highlighted_text: data.question,
                    raw_text: data.pageMarkdown || fileData.raw_text,
                    parent_response: data.feedback || null,
                    chat_history: fullHistory,
                    user_details: userDetails,
                },
                controller.signal
            )
            if (!response.body) throw new Error('No response body')
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let streamingAnswer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                streamingAnswer += decoder.decode(value, { stream: true })
                // Replace placeholder using captured historyWithUser (avoids stale closure)
                updateQuizNodeData(id, {
                    chatHistory: [...historyWithUser, { role: 'model' as const, content: streamingAnswer }],
                })
            }
        } catch (err) {
            console.error('Quiz follow-up stream error:', err)
        } finally {
            setIsFollowUpLoading(false)
            persistToLocalStorage()
        }
    }, [followUp, data, id, fileData, userDetails, updateQuizNodeData, persistToLocalStorage, isFollowUpLoading])

    const submitted = !!data.userAnswer

    // Derive verdict from the opening words of the feedback
    const verdict: 'correct' | 'partial' | 'incorrect' | null = data.feedback
        ? (() => {
            const lower = data.feedback.toLowerCase()
            if (/\bpartially correct\b/.test(lower)) return 'partial'
            if (/\bincorrect\b|\bwrong\b|\bnot correct\b/.test(lower)) return 'incorrect'
            if (/\bcorrect\b/.test(lower)) return 'correct'
            return null
        })()
        : null

    const feedbackStyles = {
        correct:   { box: 'bg-green-50 border border-green-200',   label: 'text-green-700',  title: 'CORRECT' },
        partial:   { box: 'bg-amber-50 border border-amber-200',   label: 'text-amber-700',  title: 'PARTIALLY CORRECT' },
        incorrect: { box: 'bg-red-50 border border-red-200',       label: 'text-red-700',    title: 'INCORRECT' },
        fallback:  { box: 'bg-amber-50 border border-amber-200',   label: 'text-amber-700',  title: 'GEMINI FEEDBACK' },
    }

    const fs = feedbackStyles[verdict ?? 'fallback']

    const borderClass = data.status === 'understood' ? 'border-green-500'
        : data.status === 'struggling' ? 'border-red-500'
        : 'border-violet-500'

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-xl shadow-lg border-t-4 ${borderClass} border border-gray-200 flex flex-col`}
            style={{ width: 360, ...(data.isMinimized ? {} : { height: 420 }) }}
        >
            {/* Header — violet top bar */}
            <div className="flex-shrink-0 px-3 py-2 bg-violet-50 border-b border-violet-100 flex items-center rounded-t-xl">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-[10px] font-bold flex-shrink-0">
                        {data.questionNumber}
                    </span>
                    <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                        Page Quiz
                    </span>
                </div>
            </div>

            {/* Action bar */}
            <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex gap-1.5">
                    <button
                        onClick={() => handleStatusClick('understood')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            data.status === 'understood'
                                ? 'bg-green-500 text-white border-green-500 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                        }`}
                    >
                        got it
                    </button>
                    <button
                        onClick={() => handleStatusClick('struggling')}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            data.status === 'struggling'
                                ? 'bg-red-500 text-white border-red-500 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
                        }`}
                    >
                        struggling
                    </button>
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Delete — two-step confirm */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button
                                title="Confirm delete"
                                onClick={handleDelete}
                                className="p-1 text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            <button
                                title="Cancel"
                                onClick={() => setConfirmDelete(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            title="Delete node"
                            onClick={handleDelete}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}

                    {/* Minimise */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimise'}
                        onClick={handleMinimize}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors"
                    >
                        {data.isMinimized ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                            </svg>
                        )}
                    </button>

                    {/* Pin */}
                    <button
                        title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                        onClick={handlePin}
                        className={`p-1 rounded-md transition-colors ${
                            data.isPinned
                                ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={data.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                            <path d="M9 15l-4.5 4.5" />
                            <path d="M14.5 9l1 1" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Question — always visible */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2" style={{ userSelect: 'text', cursor: 'text' }}>
                <p className="text-sm font-semibold text-gray-800 leading-snug">{data.question}</p>
            </div>

            {/* Scrollable body — hidden when minimised */}
            {!data.isMinimized && (
            <div className="flex-1 overflow-y-auto nodrag nopan" onWheelCapture={(e) => e.stopPropagation()}>

                {/* Answer area */}
                {!submitted ? (
                    <form onSubmit={handleSubmitAnswer} className="px-3 pb-3 flex flex-col gap-2">
                        <textarea
                            value={draftAnswer}
                            onChange={(e) => setDraftAnswer(e.target.value)}
                            placeholder="Write your answer here..."
                            rows={3}
                            disabled={data.isGrading}
                            className="nodrag nopan w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none resize-none transition-all disabled:opacity-50"
                            onWheelCapture={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    handleSubmitAnswer(e as unknown as React.FormEvent)
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!draftAnswer.trim() || data.isGrading}
                            className="w-full py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {data.isGrading ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Grading…
                                </>
                            ) : (
                                'Submit Answer'
                            )}
                        </button>
                    </form>
                ) : (
                    <div className="px-3 pb-3 flex flex-col gap-3">
                        {/* Submitted answer */}
                        <div className="pl-3 border-l-4 border-violet-300 bg-violet-50 rounded-r-lg py-2 pr-2">
                            <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1">Your Answer</p>
                            <p className="text-xs text-gray-700 leading-relaxed" style={{ userSelect: 'text', cursor: 'text' }}>
                                {data.userAnswer}
                            </p>
                        </div>

                        {/* Gemini feedback */}
                        {data.isGrading ? (
                            <div className="space-y-1.5">
                                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-full" />
                                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-4/5" />
                                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-3/5" />
                            </div>
                        ) : data.feedback ? (
                            <div className={`${fs.box} rounded-lg px-3 py-2`}>
                                <p className={`text-[10px] font-bold ${fs.label} uppercase tracking-wider mb-1.5`}>{fs.title}</p>
                                <p className="text-xs text-gray-800 leading-relaxed" style={{ userSelect: 'text', cursor: 'text' }}>
                                    {data.feedback}
                                </p>
                            </div>
                        ) : null}

                        {/* Follow-up chat history */}
                        {data.chatHistory && data.chatHistory.length > 0 && (
                            <div className="space-y-2 nodrag nopan">
                                {data.chatHistory.map((msg, idx) => (
                                    <div key={idx} className={`${msg.role === 'user' ? 'bg-blue-50/60 border-y border-blue-100 -mx-3 px-3 py-2' : ''}`}>
                                        {msg.role === 'user' && (
                                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">Follow-up</p>
                                        )}
                                        <div className={`text-xs ${msg.role === 'user' ? 'text-blue-900 font-medium' : 'text-gray-700 prose prose-xs max-w-none'}`} style={{ userSelect: 'text', cursor: 'text' }}>
                                            {msg.role === 'user' ? msg.content : (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}

            {/* Follow-up input — fixed at bottom, only after feedback and not minimised */}
            {!data.isMinimized && submitted && data.feedback && !data.isGrading && (
                <form
                    onSubmit={handleFollowUpSubmit}
                    className="flex-shrink-0 flex gap-2 items-center px-3 py-2 border-t border-gray-100 bg-white rounded-b-xl"
                >
                    <input
                        type="text"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        placeholder="Ask a follow-up..."
                        disabled={isFollowUpLoading}
                        className="nodrag nopan flex-1 bg-white border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-violet-400 focus:border-violet-400 outline-none transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!followUp.trim() || isFollowUpLoading}
                        className="p-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        {isFollowUpLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                </form>
            )}

            {/* Handles */}
            <Handle type="target" position={Position.Left} id="left" style={{ background: '#7c3aed' }} />
            <Handle type="source" position={Position.Right} id="right" style={{ background: '#7c3aed' }} />
            <Handle type="target" position={Position.Top} id="top" style={{ background: '#7c3aed' }} />
            <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#7c3aed' }} />
            <Handle type="target" position={Position.Right} id="right-target" style={{ background: '#7c3aed' }} />
        </div>
    )
}
