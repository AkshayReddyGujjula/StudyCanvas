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

    return (
        <div className="flex flex-col gap-2">
            {/* Saved color swatches */}
            <div className="grid grid-cols-4 gap-1.5">
                {savedColors.map((color) => (
                    <button
                        key={color}
                        onClick={() => onColorChange(color)}
                        onContextMenu={(e) => handleContextMenu(e, color)}
                        className={`group relative w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            color === currentColor ? 'border-blue-500 scale-110 ring-2 ring-blue-300' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color.toLowerCase() === '#000000' ? color : `${color} (right-click to remove)`}
                    >
                        {/* Delete indicator on hover (not for black) */}
                        {color.toLowerCase() !== '#000000' && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white rounded-full text-[8px] leading-3 font-bold hidden group-hover:flex items-center justify-center pointer-events-none">
                                ×
                            </span>
                        )}
                    </button>
                ))}
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
