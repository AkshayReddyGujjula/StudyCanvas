import { useState, useCallback, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { ImageNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'

type ImageNodeProps = NodeProps & { data: ImageNodeData }

export default function ImageNode({ id, data }: ImageNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const [confirmDelete, setConfirmDelete] = useState(false)

    // Resizing state — initialize from persisted data if available
    const [size, setSize] = useState({
        width: data.savedWidth ?? 300,
        height: data.savedHeight ?? 0,
    })
    const [autoHeight, setAutoHeight] = useState(!data.savedHeight || data.savedHeight === 0)
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

    const handleRotate = useCallback(() => {
        const currentRotation = data.rotation || 0
        const newRotation = (currentRotation + 90) % 360
        updateNodeData(id, { rotation: newRotation })
        persistToLocalStorage()
    }, [id, data.rotation, updateNodeData, persistToLocalStorage])

    const handleResizeMouseDown = useCallback((corner: string) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const imgEl = document.querySelector(`[data-nodeid="${id}"] img`) as HTMLImageElement | null
        const currentH = imgEl?.offsetHeight ?? 200
        resizingRef.current = {
            corner,
            startX: e.clientX,
            startY: e.clientY,
            startW: size.width,
            startH: autoHeight ? currentH + 36 : size.height, // 36 = header
        }
        setAutoHeight(false)
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
                width: Math.max(150, newW),
                height: Math.max(100, newH),
            })
        }
        const handleMouseUp = () => {
            resizingRef.current = null
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            // Persist the new size to node data after resize ends
            setSize((currentSize) => {
                updateNodeData(id, { savedWidth: currentSize.width, savedHeight: currentSize.height })
                persistToLocalStorage()
                return currentSize
            })
        }
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [size, autoHeight, id, updateNodeData, persistToLocalStorage])

    return (
        <div
            data-nodeid={id}
            className="bg-white rounded-lg shadow-lg border border-gray-200 relative overflow-hidden flex flex-col"
            style={{ width: size.width, height: autoHeight ? 'auto' : size.height }}
        >
            {/* Resize handles */}
            <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-left')} />
            <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-right')} />
            <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-left')} />
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-right')} />

            {/* Top Action Bar */}
            <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50">
                <div className="flex items-center gap-1.5 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="text-[10px] text-gray-500 truncate font-medium">{data.imageName}</span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
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

                    {/* Rotate button */}
                    <button
                        title="Rotate 90°"
                        onClick={handleRotate}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded-md hover:bg-blue-50 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6" />
                            <path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Image Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-gray-50/50 nodrag nopan" onWheelCapture={(e) => e.stopPropagation()}>
                <img
                    src={data.imageDataUrl}
                    alt={data.imageName}
                    className="w-full h-full"
                    style={{
                        objectFit: 'contain',
                        transform: `rotate(${data.rotation || 0}deg)`,
                        transition: 'transform 0.2s ease',
                    }}
                    draggable={false}
                />
            </div>

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white hover:!scale-125 !transition-transform" />
        </div>
    )
}
