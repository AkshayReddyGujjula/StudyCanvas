import { useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { CustomPromptNodeData, ChatMessage, PromptModel } from '../types'
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
    loading: 'border-neutral-400 animate-pulse',
    unread: 'border-indigo-400',
    understood: 'border-success-500',
    struggling: 'border-accent-500',
}

type CustomPromptNodeProps = NodeProps & { data: CustomPromptNodeData }

export default function CustomPromptNode({ id, data }: CustomPromptNodeProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const fileData = useCanvasStore((s) => s.fileData)
    const userDetails = useCanvasStore((s) => s.userDetails)
    const currentPage = useCanvasStore((s) => s.currentPage)
    const pageMarkdowns = useCanvasStore((s) => s.pageMarkdowns)

    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

    // Resizing state
    const [size, setSize] = useState({ width: 440, height: 380 })
    const resizingRef = useRef<{ corner: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [data.chatHistory])

    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])

    const handleStatusClick = (clickedStatus: 'understood' | 'struggling') => {
        const newStatus = data.status === clickedStatus ? 'unread' : clickedStatus
        updateNodeData(id, { status: newStatus })
        persistToLocalStorage()
    }

    const borderClass = STATUS_BORDER_CLASSES[data.status] || 'border-indigo-400'

    const headerBgStyle = data.status === 'struggling'
        ? { backgroundColor: '#FCEEEE' }
        : data.status === 'understood'
            ? { backgroundColor: '#E8F5EC' }
            : { backgroundColor: '#EEF2FF' } // Light indigo

    const handleSendMessage = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isLoading) return

        const question = input.trim()
        setInput('')
        setIsLoading(true)

        const prevHistory = data.chatHistory || []
        const newHistory: ChatMessage[] = [...prevHistory, { role: 'user' as const, content: question }]
        updateNodeData(id, {
            chatHistory: newHistory,
            isLoading: true,
            isStreaming: true,
        })

        // Build full chat history for API
        const fullHistoryForApi: ChatMessage[] = [...newHistory]

        // Determine context
        let rawText = ''
        let highlightedText = ''
        if (data.useContext && fileData) {
            rawText = fileData.raw_text
            highlightedText = pageMarkdowns[currentPage - 1] ?? ''
        }

        try {
            const controller = new AbortController()
            const response = await streamQuery({
                question,
                highlighted_text: highlightedText,
                raw_text: rawText,
                parent_response: null,
                chat_history: fullHistoryForApi.length > 1 ? fullHistoryForApi.slice(0, -1) : undefined,
                user_details: userDetails,
                preferred_model: data.selectedModel,
            }, controller.signal)

            const modelUsed = response.headers.get('X-Model-Used') || undefined
            if (modelUsed) {
                updateNodeData(id, { modelUsed })
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
                    chatHistory: [
                        ...newHistory,
                        { role: 'model' as const, content: streamingAnswer },
                    ],
                    isLoading: false,
                })
            }

            updateNodeData(id, { isStreaming: false, status: data.status === 'loading' ? 'unread' : data.status })
        } catch (err) {
            console.error('Custom prompt error:', err)
            updateNodeData(id, {
                chatHistory: [
                    ...newHistory,
                    { role: 'model' as const, content: 'An error occurred. Please try again.' },
                ],
                isLoading: false,
                isStreaming: false,
            })
        } finally {
            setIsLoading(false)
            persistToLocalStorage()
        }
    }, [input, isLoading, data, fileData, userDetails, currentPage, pageMarkdowns, updateNodeData, persistToLocalStorage, id])

    const toggleModel = useCallback(() => {
        const newModel: PromptModel = data.selectedModel === 'gemini-2.5-flash' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash'
        updateNodeData(id, { selectedModel: newModel })
        persistToLocalStorage()
    }, [data.selectedModel, id, updateNodeData, persistToLocalStorage])

    const toggleContext = useCallback(() => {
        updateNodeData(id, { useContext: !data.useContext })
        persistToLocalStorage()
    }, [data.useContext, id, updateNodeData, persistToLocalStorage])

    // Corner resize logic
    const handleResizeMouseDown = useCallback((corner: string) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        resizingRef.current = {
            corner,
            startX: e.clientX,
            startY: e.clientY,
            startW: size.width,
            startH: size.height,
        }
        const handleMouseMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return
            const dx = ev.clientX - resizingRef.current.startX
            const dy = ev.clientY - resizingRef.current.startY
            let newW = resizingRef.current.startW
            let newH = resizingRef.current.startH
            if (corner.includes('right')) newW += dx
            if (corner.includes('left')) newW -= dx
            if (corner.includes('bottom')) newH += dy
            if (corner.includes('top')) newH -= dy
            setSize({
                width: Math.max(340, newW),
                height: Math.max(240, newH),
            })
        }
        const handleMouseUp = () => {
            resizingRef.current = null
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [size])

    const hasMessages = data.chatHistory && data.chatHistory.length > 0
    const firstUserMessage = data.chatHistory?.find((m) => m.role === 'user')?.content

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-lg shadow-lg border-t-4 ${borderClass} border border-gray-200 relative overflow-hidden flex flex-col`}
            style={{ width: size.width, height: data.isMinimized ? 'auto' : size.height, minHeight: data.isMinimized ? 'auto' : 240 }}
        >
            {/* Resize handles */}
            {!data.isMinimized && (
                <>
                    <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-left')} />
                    <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-right')} />
                    <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-left')} />
                    <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-right')} />
                </>
            )}

            {/* Top Action Bar */}
            <div className="px-2 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0" style={headerBgStyle}>
                <div className="flex gap-1.5 items-center">
                    {/* Understood / Struggling */}
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
                            ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-accent-300 hover:text-accent-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>

                    {/* Separator */}
                    <div className="w-px h-5 bg-gray-200 mx-1" />

                    {/* Context toggle */}
                    <button
                        onClick={toggleContext}
                        title={data.useContext ? 'Page context: ON' : 'Page context: OFF'}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-all border ${data.useContext
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Context
                    </button>
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Delete button */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-accent-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button title="Confirm delete" onClick={handleDeleteClick} className="p-1 text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button title="Cancel" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button title="Delete node" onClick={handleDeleteClick} className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    {/* Minimize button */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimize'}
                        onClick={() => {
                            updateNodeData(id, { isMinimized: !data.isMinimized })
                            persistToLocalStorage()
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors"
                    >
                        {data.isMinimized ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                        )}
                    </button>

                    {/* Pin button */}
                    <button
                        title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`p-1 rounded-md transition-colors ${data.isPinned
                            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                            : 'text-gray-400 hover:text-primary-500 hover:bg-primary-50'
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

            {/* Minimized preview: show first user question */}
            {data.isMinimized && firstUserMessage && (
                <div className="px-3 py-2">
                    <p className="text-sm font-bold text-gray-800 leading-tight truncate">
                        <span className="text-indigo-500 mr-1">Q:</span>
                        {firstUserMessage}
                    </p>
                </div>
            )}

            {/* Chat Area */}
            {!data.isMinimized && (
                <div className="flex-1 overflow-y-auto custom-scrollbar nodrag nopan" onWheelCapture={(e) => e.stopPropagation()}>
                    {!hasMessages ? (
                        <div className="flex items-center justify-center h-full text-gray-400 text-sm px-4">
                            <div className="text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto mb-2 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p>Ask anything{data.useContext ? ' about this page' : ''}…</p>
                            </div>
                        </div>
                    ) : (
                        <div className="px-3 py-2 space-y-3">
                            {data.chatHistory?.map((msg, idx) => (
                                <div key={idx} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                                    {msg.role === 'user' ? (
                                        <div className="bg-indigo-50 text-indigo-900 text-sm font-medium px-3 py-2 rounded-lg rounded-br-sm max-w-[85%] border border-indigo-100">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-700 prose prose-sm max-w-none">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                            {/* Model indicator after last model message */}
                                            {idx === (data.chatHistory?.length ?? 0) - 1 && msg.role === 'model' && !data.isStreaming && (
                                                <div className="flex justify-start mt-1">
                                                    <ModelIndicator model={data.modelUsed} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {data.isLoading && data.isStreaming && (!data.chatHistory || data.chatHistory[data.chatHistory.length - 1]?.role === 'user') && (
                                <div className="space-y-2">
                                    <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                                    <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>
            )}

            {/* Input Area */}
            {!data.isMinimized && (
                <form onSubmit={handleSendMessage} className="p-2 bg-gray-50 border-t border-gray-100 flex gap-2 items-center shrink-0">
                    {/* Model toggle */}
                    <button
                        type="button"
                        onClick={toggleModel}
                        title={`Model: ${data.selectedModel === 'gemini-2.5-flash' ? 'Flash' : 'Lite'}`}
                        className={`shrink-0 px-1.5 py-1 rounded text-[9px] font-bold tracking-wide border transition-all ${data.selectedModel === 'gemini-2.5-flash'
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                            : 'bg-gray-100 text-gray-500 border-gray-300'
                            }`}
                    >
                        {data.selectedModel === 'gemini-2.5-flash' ? '⚡ FLASH' : '💡 LITE'}
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={hasMessages ? 'Follow up…' : 'Type your question…'}
                        disabled={isLoading}
                        className="flex-1 bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none transition-all disabled:opacity-50 nodrag nopan"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </form>
            )}

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
        </div>
    )
}
