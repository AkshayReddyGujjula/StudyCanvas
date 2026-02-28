import { useState, useCallback, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { StickyNoteNodeData } from '../types'
import { STICKY_NOTE_COLORS } from '../types'
import { useCanvasStore } from '../store/canvasStore'

type StickyNoteNodeProps = NodeProps & { data: StickyNoteNodeData }

/** Slightly darker border shade for each pastel color */
const COLOR_BORDERS: Record<string, string> = {
    '#FFF9C4': '#F9E547',
    '#FFCDD2': '#EF9A9A',
    '#C8E6C9': '#81C784',
    '#BBDEFB': '#64B5F6',
    '#E1BEE7': '#BA68C8',
    '#FFE0B2': '#FFB74D',
}

export default function StickyNoteNode({ id, data }: StickyNoteNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [showColorPicker, setShowColorPicker] = useState(false)

    // Resizing state
    const [size, setSize] = useState({ width: 260, height: 200 })
    const resizingRef = useRef<{ corner: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])

    const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateNodeData(id, { content: e.target.value })
        // Debounced persist — save on blur instead
    }, [id, updateNodeData])

    const handleBlur = useCallback(() => {
        persistToLocalStorage()
    }, [persistToLocalStorage])

    const handleColorChange = useCallback((color: string) => {
        updateNodeData(id, { color })
        setShowColorPicker(false)
        persistToLocalStorage()
    }, [id, updateNodeData, persistToLocalStorage])

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
                width: Math.max(180, newW),
                height: Math.max(120, newH),
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

    const borderColor = COLOR_BORDERS[data.color] || data.color

    return (
        <div
            data-nodeid={id}
            className="rounded-lg shadow-lg border relative overflow-hidden flex flex-col"
            style={{
                width: size.width,
                height: size.height,
                backgroundColor: data.color,
                borderColor: borderColor,
                borderWidth: 1.5,
            }}
        >
            {/* Resize handles */}
            <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-left')} />
            <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-right')} />
            <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-left')} />
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-right')} />

            {/* Top Action Bar */}
            <div className="px-2 py-1 border-b flex items-center justify-between shrink-0" style={{ borderColor: borderColor, backgroundColor: `${data.color}CC` }}>
                <div className="flex items-center gap-1">
                    {/* Color picker toggle */}
                    <button
                        title="Change color"
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="p-1 rounded-md hover:bg-white/40 transition-colors"
                    >
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: data.color }} />
                    </button>
                    <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Note</span>
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Delete button */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-accent-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button title="Confirm delete" onClick={handleDeleteClick} className="p-1 text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button title="Cancel" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-white/30 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button title="Delete note" onClick={handleDeleteClick} className="p-1 text-gray-500 hover:text-red-500 rounded-md hover:bg-white/30 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    {/* Pin button */}
                    <button
                        title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`p-1 rounded-md transition-colors ${data.isPinned
                            ? 'text-gray-700 bg-white/40'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/30'
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

            {/* Color picker dropdown */}
            {showColorPicker && (
                <div className="absolute top-[32px] left-2 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex gap-1.5">
                    {STICKY_NOTE_COLORS.map((color) => (
                        <button
                            key={color}
                            onClick={() => handleColorChange(color)}
                            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === data.color ? 'border-gray-600 scale-110' : 'border-white shadow-sm'}`}
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}
                </div>
            )}

            {/* Text Content */}
            <textarea
                value={data.content}
                onChange={handleContentChange}
                onBlur={handleBlur}
                placeholder="Type your note here…"
                className="flex-1 w-full resize-none border-none outline-none p-3 text-sm text-gray-800 leading-relaxed nodrag nopan"
                style={{ backgroundColor: 'transparent' }}
                onWheelCapture={(e) => e.stopPropagation()}
            />

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
        </div>
    )
}
