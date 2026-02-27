import { useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlashcardNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import ModelIndicator from './ModelIndicator'

const STATUS_BORDER_CLASSES: Record<string, string> = {
    loading: 'border-neutral-400 animate-pulse',
    unread: 'border-secondary-500',   // Soft Teal - neutral default
    understood: 'border-success-500',  // Sage Green - correct/understood
    struggling: 'border-accent-500',   // Warm Coral - incorrect/struggling
}

type FlashcardNodeProps = NodeProps & { data: FlashcardNodeData }

export default function FlashcardNode({ id, data }: FlashcardNodeProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const borderClass = STATUS_BORDER_CLASSES[data.status] || 'border-secondary-500'

    // Header background changes based on status
    const headerBgStyle = data.status === 'struggling' 
        ? { backgroundColor: '#FCEEEE' }  // Light red/coral
        : data.status === 'understood' 
            ? { backgroundColor: '#E8F5EC' }  // Light green
            : { backgroundColor: '#E6F4FA' }  // Light teal/secondary

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

    const handleFlip = useCallback(() => {
        if (data.isLoading) return
        updateNodeData(id, { isFlipped: !data.isFlipped })
        persistToLocalStorage()
    }, [id, data.isFlipped, data.isLoading, updateNodeData, persistToLocalStorage])

    return (
        <>
            {/* Flip animation styles — injected once per node render */}
            <style>{`
                .flashcard-scene { perspective: 900px; height: 100%; }
                .flashcard-inner {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-style: preserve-3d;
                }
                .flashcard-inner.is-flipped { transform: rotateY(180deg); }
                .flashcard-face {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                    overflow-y: auto;
                    overflow-x: hidden;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    white-space: normal;
                }
                .flashcard-face-back { transform: rotateY(180deg); }
            `}</style>

            <div
                data-nodeid={id}
                className={`bg-white rounded-lg shadow-lg border-t-4 ${borderClass} border border-gray-200 relative flex flex-col`}
                style={{ width: 380, overflow: 'hidden' }}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between rounded-t-md" style={headerBgStyle}>
                    {/* Left: label + status buttons */}
                    <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-secondary-700 uppercase tracking-wider mr-1 select-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                <line x1="2" y1="10" x2="22" y2="10" />
                            </svg>
                            Flashcard
                        </span>
                        <button
                            onClick={() => handleStatusClick('understood')}
                            title="Got it"
                            className={`p-1 rounded-full transition-all border ${data.status === 'understood'
                                    ? 'bg-success-500 text-white border-success-500 shadow-sm'
                                    : 'bg-white text-neutral-500 border-gray-200 hover:border-success-300 hover:text-success-600'
                                }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        <button
                            onClick={() => handleStatusClick('struggling')}
                            title="Struggling"
                            className={`p-1 rounded-full transition-all border ${data.status === 'struggling'
                                    ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                                    : 'bg-white text-neutral-500 border-gray-200 hover:border-accent-300 hover:text-accent-600'
                                }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>

                    {/* Right: delete / minimize / pin */}
                    <div className="flex items-center gap-0.5">
                        {/* Delete button — two-step */}
                        {confirmDelete ? (
                            <div
                                className="flex items-center gap-1"
                                onMouseLeave={() => setConfirmDelete(false)}
                            >
                                <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">Delete?</span>
                                <button
                                    title="Confirm delete"
                                    onClick={handleDeleteClick}
                                    className="p-1 text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors"
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
                                title="Delete flashcard"
                                onClick={handleDeleteClick}
                                className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}

                        {/* Minimize button */}
                        <button
                            title={data.isMinimized ? 'Expand' : 'Minimize'}
                            onClick={() => {
                                const willBeMinimized = !data.isMinimized
                                updateNodeData(id, {
                                    isMinimized: willBeMinimized,
                                    isExpanding: !willBeMinimized,
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

                        {/* Pin button */}
                        <button
                            title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                            onClick={() => {
                                updateNodeData(id, { isPinned: !data.isPinned })
                                persistToLocalStorage()
                            }}
                            className={`p-1 rounded-md transition-colors ${data.isPinned
                                    ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                    : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50'
                                }`}
                        >
                            <svg
                                className="w-3.5 h-3.5"
                                viewBox="0 0 24 24"
                                fill={data.isPinned ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                                <path d="M9 15l-4.5 4.5" />
                                <path d="M14.5 9l1 1" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Flip card body ────────────────────────────────────── */}
                {!data.isMinimized && (
                    <div className="flashcard-scene px-3 pt-2 pb-3" style={{ height: 200 }}>
                        {data.isLoading ? (
                            /* Loading skeleton */
                            <div className="space-y-2 py-4 px-2">
                                <div className="h-3 bg-teal-100 rounded animate-pulse w-full" />
                                <div className="h-3 bg-teal-100 rounded animate-pulse w-4/5" />
                                <div className="h-3 bg-teal-100 rounded animate-pulse w-3/5" />
                            </div>
                        ) : (
                            <div
                                className={`flashcard-inner${data.isFlipped ? ' is-flipped' : ''}`}
                                style={{ height: '100%' }}
                            >
                                {/* ── Front: Question ── */}
                                <div
                                    className="flashcard-face nodrag nopan cursor-pointer custom-scrollbar"
                                    onClick={handleFlip}
                                    onWheelCapture={(e) => e.stopPropagation()}
                                >
                                    <div className="flex flex-col items-center justify-center text-center h-full px-3 py-3 min-h-0">
                                        <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-2 flex-shrink-0">Question</p>
                                        <p className="text-sm font-bold text-gray-800 leading-snug overflow-y-auto w-full custom-scrollbar" style={{ maxHeight: 130 }} onWheelCapture={(e) => e.stopPropagation()}>{data.question}</p>
                                        <p className="mt-2 text-[10px] text-gray-400 italic flex-shrink-0">Click to reveal answer ↩</p>
                                    </div>
                                </div>

                                {/* ── Back: Answer ── */}
                                <div
                                    className="flashcard-face flashcard-face-back nodrag nopan cursor-pointer custom-scrollbar"
                                    onClick={handleFlip}
                                    onWheelCapture={(e) => e.stopPropagation()}
                                >
                                    <div className="flex flex-col h-full px-2 py-3 min-h-0">
                                        <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-1.5 flex-shrink-0">Answer</p>
                                        <div
                                            className="prose prose-sm max-w-none text-gray-700 overflow-y-auto flex-1 custom-scrollbar"
                                            style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
                                            onWheelCapture={(e) => e.stopPropagation()}
                                        >
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {data.answer}
                                            </ReactMarkdown>
                                        </div>
                                        <div className="flex items-center justify-between mt-1.5 flex-shrink-0">
                                            <ModelIndicator model={data.modelUsed} />
                                            <p className="text-[10px] text-gray-400 italic">Click to flip back ↩</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Handles ──────────────────────────────────────────── */}
                <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-secondary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
                <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-secondary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
                <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-secondary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
                <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-secondary-500 !border-2 !border-white hover:!scale-125 !transition-transform" />
            </div>
        </>
    )
}
