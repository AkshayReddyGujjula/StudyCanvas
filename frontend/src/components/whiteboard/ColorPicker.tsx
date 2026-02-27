import { useState, useRef, useEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'

interface ColorPickerProps {
    currentColor: string
    onColorChange: (color: string) => void
}

export default function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
    const savedColors = useCanvasStore((s) => s.savedColors)
    const addSavedColor = useCanvasStore((s) => s.addSavedColor)
    const removeSavedColor = useCanvasStore((s) => s.removeSavedColor)
    const [showCustom, setShowCustom] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragOverBin, setDragOverBin] = useState(false)
    const dragColorRef = useRef<string | null>(null)

    // When native color picker opens and selects, auto-apply
    useEffect(() => {
        const input = inputRef.current
        if (!input) return
        const handler = () => {
            onColorChange(input.value)
        }
        input.addEventListener('input', handler)
        return () => input.removeEventListener('input', handler)
    }, [onColorChange])

    const handleContextMenu = (e: React.MouseEvent, color: string) => {
        e.preventDefault()
        // Don't allow deleting black (#000000)
        if (color.toLowerCase() === '#000000') return
        removeSavedColor(color)
    }

    // ── Drag-to-bin handlers ────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent, color: string) => {
        if (color.toLowerCase() === '#000000') {
            e.preventDefault()
            return
        }
        dragColorRef.current = color
        setIsDragging(true)
        e.dataTransfer.setData('text/plain', color)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragEnd = () => {
        setIsDragging(false)
        setDragOverBin(false)
        dragColorRef.current = null
    }

    const handleBinDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverBin(true)
    }

    const handleBinDragLeave = () => {
        setDragOverBin(false)
    }

    const handleBinDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const color = e.dataTransfer.getData('text/plain') || dragColorRef.current
        if (color && color.toLowerCase() !== '#000000') {
            removeSavedColor(color)
        }
        setDragOverBin(false)
        setIsDragging(false)
        dragColorRef.current = null
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Saved color swatches + bin */}
            <div className="grid grid-cols-5 gap-1.5">
                {savedColors.map((color) => {
                    const isBlack = color.toLowerCase() === '#000000'
                    return (
                        <button
                            key={color}
                            draggable={!isBlack}
                            onClick={() => onColorChange(color)}
                            onContextMenu={(e) => handleContextMenu(e, color)}
                            onDragStart={(e) => handleDragStart(e, color)}
                            onDragEnd={handleDragEnd}
                            className={`relative w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                                color === currentColor ? 'border-blue-500 scale-110 ring-2 ring-blue-300' : 'border-gray-300'
                            } ${!isBlack ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            style={{ backgroundColor: color }}
                            title={isBlack ? color : `${color} — drag to bin to remove`}
                        />
                    )
                })}

                {/* Bin icon — always visible at end of swatch grid */}
                <div
                    onDragOver={handleBinDragOver}
                    onDragLeave={handleBinDragLeave}
                    onDrop={handleBinDrop}
                    className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed transition-all ${
                        dragOverBin
                            ? 'border-red-400 bg-red-50 scale-125'
                            : isDragging
                              ? 'border-red-300 bg-red-50/50 animate-pulse'
                              : 'border-gray-300 bg-gray-50'
                    }`}
                    title="Drag a colour here to remove it"
                >
                    <svg
                        className={`w-3 h-3 transition-colors ${dragOverBin ? 'text-red-500' : isDragging ? 'text-red-400' : 'text-gray-400'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
            </div>

            {/* Add / Custom color row */}
            <div className="flex items-center gap-1.5 mt-1">
                <button
                    onClick={() => addSavedColor(currentColor)}
                    className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed border-gray-400 hover:border-gray-600 text-gray-400 hover:text-gray-600 text-xs transition-colors"
                    title="Save current color"
                >
                    +
                </button>
                <button
                    onClick={() => {
                        setShowCustom(!showCustom)
                        if (!showCustom) {
                            // Trigger native color picker
                            setTimeout(() => inputRef.current?.click(), 0)
                        }
                    }}
                    className="flex-1 text-xs text-gray-500 hover:text-gray-700 text-center py-1 rounded hover:bg-gray-100 transition-colors"
                >
                    Custom…
                </button>
                {/* Hidden native color picker */}
                <input
                    ref={inputRef}
                    type="color"
                    value={currentColor}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="w-0 h-0 opacity-0 absolute"
                    tabIndex={-1}
                />
                {/* Current color preview */}
                <div
                    className="w-6 h-6 rounded-full border-2 border-gray-300"
                    style={{ backgroundColor: currentColor }}
                    title={`Current: ${currentColor}`}
                />
            </div>
        </div>
    )
}
