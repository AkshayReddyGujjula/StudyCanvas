import { useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { SummaryNodeData } from '../types'
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
    unread: 'border-primary-500',
    understood: 'border-success-500',
    struggling: 'border-accent-500',
}

type SummaryNodeProps = NodeProps & { data: SummaryNodeData }

export default function SummaryNode({ id, data }: SummaryNodeProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const fileData = useCanvasStore((s) => s.fileData)
    const userDetails = useCanvasStore((s) => s.userDetails)
    const pageMarkdowns = useCanvasStore((s) => s.pageMarkdowns)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isRegenerating, setIsRegenerating] = useState(false)

    const borderClass = STATUS_BORDER_CLASSES[data.status] || 'border-primary-500'

    const headerBgStyle = data.status === 'struggling'
        ? { backgroundColor: '#FCEEEE' }
        : data.status === 'understood'
            ? { backgroundColor: '#E8F5EC' }
            : { backgroundColor: '#EBF0F7' } // Light navy/primary

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

    const handleRegenerate = useCallback(async () => {
        if (!fileData || isRegenerating) return
        setIsRegenerating(true)

        const pageContent = pageMarkdowns[data.sourcePage - 1] ?? ''
        updateNodeData(id, { summary: '', isLoading: true, isStreaming: true, status: 'loading' })

        try {
            const controller = new AbortController()
            const response = await streamQuery({
                question: `Summarize the following page content concisely in 3-5 bullet points for a student. Focus on the key concepts, definitions, and takeaways. Use markdown bullet points. Be brief but comprehensive.`,
                highlighted_text: '',
                raw_text: pageContent,
                parent_response: null,
                user_details: userDetails,
                preferred_model: 'gemini-2.5-flash-lite',
            }, controller.signal)

            const modelUsed = response.headers.get('X-Model-Used') || undefined

            if (!response.body) throw new Error('No response body')
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let fullText = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                fullText += decoder.decode(value, { stream: true })
                updateNodeData(id, { summary: fullText, isLoading: false, modelUsed })
            }

            updateNodeData(id, { isStreaming: false, status: 'unread', modelUsed })
        } catch (err) {
            console.error('Summary regeneration error:', err)
            updateNodeData(id, {
                summary: 'Failed to generate summary. Please try again.',
                isLoading: false,
                isStreaming: false,
                status: 'unread',
            })
        } finally {
            setIsRegenerating(false)
            persistToLocalStorage()
        }
    }, [id, data.sourcePage, fileData, userDetails, pageMarkdowns, updateNodeData, persistToLocalStorage, isRegenerating])

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-lg shadow-lg border-t-4 ${borderClass} border border-gray-200 relative overflow-hidden flex flex-col`}
            style={{ width: 380, minHeight: data.isMinimized ? 'auto' : 160 }}
        >
            {/* Top Action Bar */}
            <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between" style={headerBgStyle}>
                <div className="flex gap-1.5 items-center">
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

                    <div className="w-px h-5 bg-gray-200 mx-0.5" />

                    {/* Regenerate button */}
                    <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating || data.isStreaming}
                        title="Regenerate summary"
                        className="p-1 text-gray-400 hover:text-primary-600 rounded-md hover:bg-primary-50 transition-colors disabled:opacity-40"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                        </svg>
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

                    {/* Minimize */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimize'}
                        onClick={() => { updateNodeData(id, { isMinimized: !data.isMinimized }); persistToLocalStorage() }}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-200/50 transition-colors"
                    >
                        {data.isMinimized ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                        )}
                    </button>

                    {/* Pin */}
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

            {/* Title / Header */}
            <div className="px-3 pt-2 pb-1">
                <p className="text-xs font-bold text-primary-700 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Page {data.sourcePage} Summary
                </p>
            </div>

            {/* Content */}
            {!data.isMinimized && (
                <div className="flex-1 overflow-y-auto custom-scrollbar nodrag nopan px-3 pb-3" style={{ maxHeight: 350, userSelect: 'text', cursor: 'text' }} onWheelCapture={(e) => e.stopPropagation()}>
                    {data.isLoading && data.isStreaming && !data.summary ? (
                        <div className="space-y-2 mt-2">
                            <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                            <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
                            <div className="h-3 bg-gray-100 rounded animate-pulse w-4/6" />
                        </div>
                    ) : (
                        <div className="prose prose-sm max-w-none mt-1">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                            >
                                {data.summary}
                            </ReactMarkdown>
                        </div>
                    )}

                    {!data.isLoading && !data.isStreaming && data.summary && (
                        <div className="flex justify-start mt-1">
                            <ModelIndicator model={data.modelUsed} />
                        </div>
                    )}
                </div>
            )}

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
        </div>
    )
}
