import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * A tiny greyed-out "i" circle that shows which Gemini model generated
 * the response when hovered. The tooltip is rendered via a portal into
 * document.body so it is never clipped by parent overflow:hidden containers.
 */
export default function ModelIndicator({ model }: { model?: string }) {
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
    const ref = useRef<HTMLSpanElement>(null)

    if (!model) return null

    // Shorten display name: "gemini-2.5-flash-lite" → "2.5 flash-lite"
    const short = model
        .replace('gemini-', '')
        .replace(/-/, ' ')

    const handleMouseEnter = () => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect()
            setTooltipPos({
                x: rect.left + rect.width / 2,
                y: rect.top,
            })
        }
    }

    const handleMouseLeave = () => setTooltipPos(null)

    return (
        <>
            <span
                ref={ref}
                className="relative inline-flex items-center ml-1"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <span className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-gray-300 text-gray-400 text-[9px] font-medium leading-none cursor-default select-none opacity-60 hover:opacity-100 transition-opacity">
                    i
                </span>
            </span>

            {tooltipPos && createPortal(
                <span
                    style={{
                        position: 'fixed',
                        left: tooltipPos.x,
                        top: tooltipPos.y - 4,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 99999,
                        pointerEvents: 'none',
                    }}
                    className="px-2 py-0.5 bg-gray-800 text-white text-[9px] rounded-full whitespace-nowrap shadow-lg"
                >
                    {short}
                </span>,
                document.body
            )}
        </>
    )
}
