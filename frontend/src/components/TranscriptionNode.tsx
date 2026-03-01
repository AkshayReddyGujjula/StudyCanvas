import { useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { TranscriptionNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'

type TranscriptionNodeProps = NodeProps & { data: TranscriptionNodeData }

const COLORS = {
    bg: '#F5F3FF',
    border: '#A78BFA',
    text: '#4C1D95',
    accent: '#7C3AED',
    headerBg: '#EDE9FE',
}

const MIN_WIDTH = 200
const MAX_WIDTH = 600
const MIN_HEIGHT = 80
const MAX_HEIGHT = 500

/** Scale font size linearly with width between 12 px and 17 px. */
function computeFontSize(width: number): number {
    const t = Math.max(0, Math.min(1, (width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)))
    return Math.round(12 + t * 5)
}

export default function TranscriptionNode({ id, data }: TranscriptionNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const [confirmDelete, setConfirmDelete] = useState(false)

    // Resize state — restore from persisted data on mount
    const [width, setWidth] = useState(data.savedWidth ?? 280)
    const [height, setHeight] = useState(data.savedHeight ?? 160)

    // Persist dimensions when they change (debounced via ref)
    const persistDimsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const persistDimensions = useCallback(
        (w: number, h: number) => {
            if (persistDimsTimer.current) clearTimeout(persistDimsTimer.current)
            persistDimsTimer.current = setTimeout(() => {
                updateNodeData(id, { savedWidth: w, savedHeight: h })
                persistToLocalStorage()
            }, 400)
        },
        [id, updateNodeData, persistToLocalStorage],
    )

    useEffect(() => {
        return () => {
            if (persistDimsTimer.current) clearTimeout(persistDimsTimer.current)
        }
    }, [])

    // ── Corner resize drag ────────────────────────────────────────────────
    const resizeRef = useRef<{
        startX: number
        startY: number
        startW: number
        startH: number
    } | null>(null)

    const onResizeMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            resizeRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startW: width,
                startH: height,
            }

            const onMouseMove = (ev: MouseEvent) => {
                if (!resizeRef.current) return
                const dx = ev.clientX - resizeRef.current.startX
                const dy = ev.clientY - resizeRef.current.startY
                const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeRef.current.startW + dx))
                const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.startH + dy))
                setWidth(newW)
                setHeight(newH)
            }

            const onMouseUp = (ev: MouseEvent) => {
                if (!resizeRef.current) return
                const dx = ev.clientX - resizeRef.current.startX
                const dy = ev.clientY - resizeRef.current.startY
                const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeRef.current.startW + dx))
                const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.startH + dy))
                resizeRef.current = null
                setWidth(newW)
                setHeight(newH)
                persistDimensions(newW, newH)
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
            }

            window.addEventListener('mousemove', onMouseMove)
            window.addEventListener('mouseup', onMouseUp)
        },
        [width, height, persistDimensions],
    )

    // ── Delete ───────────────────────────────────────────────────────────
    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        // Clear the lock on the parent voice note so it can be transcribed again.
        if (data.sourceVoiceNoteId) {
            updateNodeData(data.sourceVoiceNoteId, { transcriptionNodeId: null })
        }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, data.sourceVoiceNoteId, id, updateNodeData, setNodes, setEdges, persistToLocalStorage])

    // ── Minimize ─────────────────────────────────────────────────────────
    const toggleMinimize = useCallback(() => {
        updateNodeData(id, { isMinimized: !data.isMinimized })
        persistToLocalStorage()
    }, [id, data.isMinimized, updateNodeData, persistToLocalStorage])

    const fontSize = computeFontSize(width)

    return (
        <div
            data-nodeid={id}
            className="rounded-lg shadow-lg border-2 relative flex flex-col select-none"
            style={{
                width,
                backgroundColor: COLORS.bg,
                borderColor: COLORS.border,
            }}
        >
            {/* ── Top Bar ─────────────────────────────────────────────── */}
            <div
                className="px-2 py-1 flex items-center justify-between shrink-0 rounded-t-lg border-b"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.headerBg }}
            >
                {/* Left: icon + label */}
                <div className="flex items-center gap-1 min-w-0">
                    {/* Text-lines icon */}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: COLORS.accent }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span
                        className="text-[10px] font-bold uppercase tracking-wider truncate"
                        style={{ color: COLORS.text }}
                    >
                        Transcription
                    </span>
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* Delete */}
                    {confirmDelete ? (
                        <div
                            className="flex items-center gap-1"
                            onMouseLeave={() => setConfirmDelete(false)}
                        >
                            <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">
                                Delete?
                            </span>
                            <button
                                title="Confirm"
                                onClick={handleDeleteClick}
                                className="p-1 text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors nodrag"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                            <button
                                title="Cancel"
                                onClick={() => setConfirmDelete(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors nodrag"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            title="Delete transcription"
                            onClick={handleDeleteClick}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-white/40 transition-colors nodrag"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}

                    {/* Minimize */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimise'}
                        onClick={toggleMinimize}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-white/40 rounded-md transition-colors nodrag"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    </button>

                    {/* Pin */}
                    <button
                        title={data.isPinned ? 'Unpin' : 'Pin to all pages'}
                        onClick={() => {
                            updateNodeData(id, { isPinned: !data.isPinned })
                            persistToLocalStorage()
                        }}
                        className={`p-1 rounded-md transition-colors nodrag ${
                            data.isPinned
                                ? 'text-violet-700 bg-white/40'
                                : 'text-gray-400 hover:text-gray-700 hover:bg-white/30'
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

            {/* ── Minimized preview: first 3 lines + ellipsis ────────── */}
            {data.isMinimized && (
                <div className="px-2.5 py-2 nodrag nopan">
                    <p
                        className="leading-relaxed break-words"
                        style={{
                            color: COLORS.text,
                            fontSize: 11,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {data.text || (
                            <span className="italic opacity-50">
                                No transcription text.
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* ── Expanded content area ────────────────────────────────── */}
            {!data.isMinimized && (
                <div
                    className="p-2.5 overflow-y-auto nodrag nopan"
                    style={{ height }}
                >
                    <p
                        className="leading-relaxed whitespace-pre-wrap break-words"
                        style={{ color: COLORS.text, fontSize }}
                    >
                        {data.text || (
                            <span className="italic opacity-50 text-[11px]">
                                No transcription text.
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* ── Resize handle (bottom-right corner) ──────────────────── */}
            {!data.isMinimized && (
                <div
                    title="Resize"
                    onMouseDown={onResizeMouseDown}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize nodrag"
                    style={{ zIndex: 10 }}
                >
                    {/* Grip dots */}
                    <svg
                        viewBox="0 0 10 10"
                        className="w-full h-full"
                        style={{ color: COLORS.border }}
                    >
                        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                        <circle cx="5" cy="8" r="1.2" fill="currentColor" />
                        <circle cx="8" cy="5" r="1.2" fill="currentColor" />
                    </svg>
                </div>
            )}

            {/* React Flow handles */}
            <Handle
                type="source"
                position={Position.Top}
                id="top"
                className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform"
                style={{ backgroundColor: COLORS.accent }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform"
                style={{ backgroundColor: COLORS.accent }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left"
                className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform"
                style={{ backgroundColor: COLORS.accent }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform"
                style={{ backgroundColor: COLORS.accent }}
            />
        </div>
    )
}
