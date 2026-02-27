import { useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { AnswerNodeData, ChatMessage } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { streamQuery } from '../api/studyApi'
import ModelIndicator from './ModelIndicator'

const customSchema: SanitizeOptions = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
    attributes: {
        ...defaultSchema.attributes,
        mark: ['className', 'dataHighlightId'],
    },
}

const STATUS_BORDER_CLASSES: Record<string, string> = {
    loading: 'border-gray-400 animate-pulse',
    unread: 'border-blue-500',
    understood: 'border-green-500',
    struggling: 'border-red-500',
}

type AnswerNodeProps = NodeProps & { data: AnswerNodeData }

export default function AnswerNode({ id, data }: AnswerNodeProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const removeHighlight = useCanvasStore((s) => s.removeHighlight)
    const fileData = useCanvasStore((s) => s.fileData)
    const userDetails = useCanvasStore((s) => s.userDetails)
    const [followUp, setFollowUp] = useState('')
    const [isFollowUpLoading, setIsFollowUpLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        // Confirmed — remove node, its edges, and any associated highlight
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        removeHighlight(id)
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, removeHighlight, persistToLocalStorage])

    const borderClass = STATUS_BORDER_CLASSES[data.status] || 'border-blue-500'

    const handleStatusClick = (clickedStatus: 'understood' | 'struggling') => {
        const newStatus = data.status === clickedStatus ? 'unread' : clickedStatus
        updateNodeData(id, { status: newStatus })
        persistToLocalStorage()
    }

    const handleFollowUpSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        if (!followUp.trim() || !fileData || isFollowUpLoading) return

        const question = followUp.trim()
        setFollowUp('')
        setIsFollowUpLoading(true)

        // Prepare context
        const followUpHistory = data.chatHistory || []
        // For the API, we ALWAYS prepend the very first Q&A of this node
        const fullHistoryForApi: ChatMessage[] = [
            { role: 'user' as const, content: data.question },
            { role: 'model' as const, content: data.answer },
            ...followUpHistory,
            { role: 'user' as const, content: question }
        ]

        // Optimistically add the new user follow-up to the state
        const newFollowUpHistoryWithUser = [...followUpHistory, { role: 'user' as const, content: question }]
        updateNodeData(id, {
            chatHistory: newFollowUpHistoryWithUser,
            isLoading: true,
            isStreaming: true
        })

        try {
            const controller = new AbortController()
            const response = await streamQuery({
                question,
                highlighted_text: data.highlighted_text,
                raw_text: fileData.raw_text,
                parent_response: data.parentResponseText || null,
                chat_history: fullHistoryForApi,
                user_details: userDetails
            }, controller.signal)

            // Capture which model was used for this follow-up
            const followUpModel = response.headers.get('X-Model-Used') || undefined
            if (followUpModel) {
                updateNodeData(id, { modelUsed: followUpModel })
            }

            if (!response.body) throw new Error('No response body')
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let streamingAnswer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                streamingAnswer += decoder.decode(value, { stream: true })
                updateNodeData(id, {
                    // Update the last history item (model response) or add it
                    chatHistory: [
                        ...newFollowUpHistoryWithUser,
                        { role: 'model' as const, content: streamingAnswer }
                    ],
                    isLoading: false
                })
            }

            updateNodeData(id, { isStreaming: false })
        } catch (err) {
            console.error('Follow-up error:', err)
            updateNodeData(id, {
                isLoading: false,
                isStreaming: false
            })
        } finally {
            setIsFollowUpLoading(false)
            persistToLocalStorage()
        }
    }, [followUp, data, fileData, userDetails, updateNodeData, persistToLocalStorage, isFollowUpLoading])

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-lg shadow-lg border-t-4 ${borderClass} border border-gray-200 relative overflow-hidden flex flex-col`}
            style={{ width: 360, minHeight: data.isMinimized ? 'auto' : 160 }}
        >
            {/* Top Action Bar */}
            <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex gap-1.5">
                    <button
                        onClick={() => handleStatusClick('understood')}
                        title="Got it"
                        className={`p-1 rounded-full transition-all border ${data.status === 'understood'
                            ? 'bg-green-500 text-white border-green-500 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                    <button
                        onClick={() => handleStatusClick('struggling')}
                        title="Struggling"
                        className={`p-1 rounded-full transition-all border ${data.status === 'struggling'
                            ? 'bg-red-500 text-white border-red-500 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Delete button — two-step confirmation */}
                    {confirmDelete ? (
                        <div
                            className="flex items-center gap-1"
                            onMouseLeave={() => setConfirmDelete(false)}
                        >
                            <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button
                                title="Confirm delete"
                                onClick={handleDeleteClick}
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
                            onClick={handleDeleteClick}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}

                    {/* Minimise button */}
                    <button
                        title={data.isMinimized ? "Expand" : "Minimize"}
                        onClick={() => {
                            const willBeMinimized = !data.isMinimized
                            updateNodeData(id, {
                                isMinimized: willBeMinimized,
                                isExpanding: !willBeMinimized
                            })
                            persistToLocalStorage()
                        }}
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

                    {/* Pin button — pin this node to appear on ALL pages */}
                    <button
                        title={data.isPinned ? "Unpin from all pages" : "Pin to all pages"}
                        onClick={() => {
                            updateNodeData(id, { isPinned: !data.isPinned })
                            persistToLocalStorage()
                        }}
                        className={`p-1 rounded-md transition-colors ${data.isPinned
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

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar nodrag nopan" style={{ maxHeight: 400 }} onWheelCapture={(e) => e.stopPropagation()}>
                {/* Yellow quote block */}
                <div className="mx-3 mt-3 pl-3 pr-4 py-2 bg-yellow-50 border-l-4 border-yellow-400 rounded text-[11px] text-gray-600 italic">
                    &ldquo;{data.highlighted_text.slice(0, 300)}{data.highlighted_text.length > 300 ? '...' : ''}&rdquo;
                </div>

                {/* Question */}
                <div className="px-3 pt-3 pb-1">
                    <p className="text-sm font-bold text-gray-800 leading-tight">{data.question}</p>
                </div>

                {/* Responses — only visible when NOT minimized */}
                {!data.isMinimized && (
                    <div className="px-3 pb-4 nodrag nopan space-y-4" style={{ userSelect: 'text', cursor: 'text' }}>
                        {/* Initial Response */}
                        <div className="prose prose-sm max-w-none mt-1">
                            {data.isLoading && data.isStreaming && !data.answer ? (
                                <div className="space-y-2">
                                    <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                                    <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
                                </div>
                            ) : (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                                >
                                    {data.answer}
                                </ReactMarkdown>
                            )}
                        </div>

                        {/* Model indicator — shown after initial response */}
                        {!data.isLoading && !data.isStreaming && data.answer && (
                            <div className="flex justify-start -mt-2">
                                <ModelIndicator model={data.modelUsed} />
                            </div>
                        )}

                        {/* Chat History / Follow ups */}
                        {data.chatHistory && data.chatHistory.map((msg, idx) => (
                            <div key={idx} className={`space-y-1 ${msg.role === 'user' ? 'bg-blue-50/50 -mx-3 px-3 py-2 border-y border-blue-100' : ''}`}>
                                {msg.role === 'user' && <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Follow-up</p>}
                                <div className={`text-sm ${msg.role === 'user' ? 'text-blue-900 font-medium' : 'text-gray-700 prose prose-sm max-w-none'}`}>
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

            {/* Bottom Follow-up Input */}
            {!data.isMinimized && (
                <form
                    onSubmit={handleFollowUpSubmit}
                    className="p-2 bg-gray-50 border-t border-gray-100 flex gap-2 items-center"
                >
                    <input
                        type="text"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        placeholder="Ask follow up..."
                        disabled={isFollowUpLoading}
                        className="flex-1 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!followUp.trim() || isFollowUpLoading}
                        className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {isFollowUpLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                </form>
            )}

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
        </div>
    )
}
