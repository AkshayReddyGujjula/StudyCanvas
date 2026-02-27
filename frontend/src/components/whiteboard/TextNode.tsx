import { useState, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { TextNodeData } from '../../types'
import { useCanvasStore } from '../../store/canvasStore'

type TextNodeProps = NodeProps & { data: TextNodeData }

/**
 * TextNode — a movable, resizable, editable text block on the canvas.
 * Double-click to edit; click outside to commit.
 * In cursor mode: click to select, Backspace to delete (handled by Canvas.tsx).
 */
export default function TextNode({ id, data, selected }: TextNodeProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [localText, setLocalText] = useState(data.text || '')
    const textRef = useRef<HTMLTextAreaElement>(null)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const activeTool = useCanvasStore((s) => s.activeTool)

    // Sync local text when data changes externally
    useEffect(() => {
        if (!isEditing) {
            setLocalText(data.text || '')
        }
    }, [data.text, isEditing])

    // Auto-focus when entering edit mode
    useEffect(() => {
        if (isEditing && textRef.current) {
            textRef.current.focus()
            textRef.current.select()
        }
    }, [isEditing])

    // Auto-enter edit mode for new empty text nodes
    useEffect(() => {
        if (!data.text) {
            setIsEditing(true)
        }
    }, [])

    const commitText = useCallback(() => {
        setIsEditing(false)
        const trimmed = localText.trim()
        updateNodeData(id, { text: trimmed } as unknown as Partial<Record<string, unknown>>)
    }, [id, localText, updateNodeData])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (activeTool === 'cursor') {
            setIsEditing(true)
        }
    }, [activeTool])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            commitText()
        }
        // Prevent Backspace from deleting the node while typing
        e.stopPropagation()
    }, [commitText])

    const handleBlur = useCallback(() => {
        commitText()
    }, [commitText])

    const fontSize = data.fontSize || 16
    const color = data.color || '#000000'
    const minWidth = Math.max(60, fontSize * 3)

    return (
        <div
            data-nodeid={id}
            className={`text-node-container ${selected ? 'text-node-selected' : ''} ${isEditing ? 'nodrag nopan' : ''}`}
            style={{
                minWidth,
                minHeight: fontSize + 16,
                padding: '4px 8px',
                borderRadius: 4,
                background: isEditing ? 'rgba(255,255,255,0.95)' : 'transparent',
                border: selected ? '2px solid #2D9CDB' : (isEditing ? '1px solid #d1d5db' : '1px solid transparent'),
                cursor: activeTool === 'cursor' ? (isEditing ? 'text' : 'move') : 'default',
                position: 'relative',
                boxShadow: selected ? '0 0 0 2px rgba(45,156,219,0.2)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onDoubleClick={handleDoubleClick}
        >
            {isEditing ? (
                <textarea
                    ref={textRef}
                    value={localText}
                    onChange={(e) => setLocalText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className="nodrag nopan"
                    style={{
                        fontSize,
                        color,
                        fontFamily: 'inherit',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        resize: 'both',
                        minWidth: minWidth - 16,
                        minHeight: fontSize + 8,
                        width: data.width ? data.width - 16 : 'auto',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                        padding: 0,
                    }}
                    placeholder="Type here…"
                />
            ) : (
                <div
                    style={{
                        fontSize,
                        color,
                        fontFamily: 'inherit',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                        minHeight: fontSize + 8,
                        userSelect: 'none',  // Prevent browser text selection so ReactFlow can select the node
                        pointerEvents: 'none', // Let clicks pass through to the ReactFlow node wrapper
                    }}
                >
                    {localText || (
                        <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                            Double-click to edit
                        </span>
                    )}
                </div>
            )}

            {/* Font size indicator when selected */}
            {selected && !isEditing && (
                <div
                    className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] text-gray-500 shadow-sm select-none"
                    style={{ zIndex: 10 }}
                >
                    <span>{fontSize}px</span>
                </div>
            )}
        </div>
    )
}
