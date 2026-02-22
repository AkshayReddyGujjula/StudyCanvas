import { createPortal } from 'react-dom'

interface AskGeminiPopupProps {
    rect: DOMRect
    containerRect: DOMRect | null
    onAsk: () => void
}

function computePopupStyle(
    rect: DOMRect,
    containerRect: DOMRect | null,
): React.CSSProperties {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const BUTTON_HEIGHT = 38    // approximate button height in px
    const BUTTON_WIDTH = 152    // approximate button width in px ("✨ Ask Gemini" + padding)
    const GAP = 12              // gap between PDF edge and popup
    const EDGE_PADDING = 8      // minimum distance from viewport edges

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

    // Use containerRect to determine the PDF panel edges; fall back to selection rect edges.
    const pdfLeft  = containerRect ? containerRect.left  : rect.left
    const pdfRight = containerRect ? containerRect.right : rect.right

    // How much space is available on each side of the PDF panel?
    const spaceLeft  = pdfLeft - EDGE_PADDING              // px available to the left of PDF
    const spaceRight = vw - pdfRight - EDGE_PADDING        // px available to the right of PDF
    const neededWidth = BUTTON_WIDTH + GAP

    // Where is the selected text within the PDF, expressed as a 0-1 fraction.
    const selectionCenterX = rect.left + rect.width / 2
    const pdfWidth = pdfRight - pdfLeft
    const relativeX = pdfWidth > 0
        ? (selectionCenterX - pdfLeft) / pdfWidth
        : 0.5

    // Zone thresholds: left < 35%, right > 65%, center in between
    const zone = relativeX < 0.35 ? 'left' : relativeX > 0.65 ? 'right' : 'center'

    // Vertical centre of the selection, clamped within the viewport
    const verticalCenter = clamp(
        rect.top + rect.height / 2 - BUTTON_HEIGHT / 2,
        EDGE_PADDING,
        vh - BUTTON_HEIGHT - EDGE_PADDING,
    )

    if (zone === 'left' && spaceLeft >= neededWidth) {
        // Enough room to the LEFT of the PDF — anchor to PDF's left edge
        const left = pdfLeft - GAP - BUTTON_WIDTH
        return { position: 'fixed', top: verticalCenter, left }
    }

    if (zone === 'right' && spaceRight >= neededWidth) {
        // Enough room to the RIGHT of the PDF — anchor to PDF's right edge
        const left = pdfRight + GAP
        return { position: 'fixed', top: verticalCenter, left }
    }

    // CENTER, or sides with insufficient space — fall back to BELOW the selection.
    // Prefer the side matching the zone so it doesn't feel misplaced.
    const top = clamp(rect.bottom + GAP, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
    let left: number
    if (zone === 'left') {
        // Lean towards the left: align popup's right edge with the selection's left edge
        left = clamp(rect.left - BUTTON_WIDTH / 2, EDGE_PADDING, vw - BUTTON_WIDTH - EDGE_PADDING)
    } else if (zone === 'right') {
        // Lean towards the right: align popup's left edge with the selection's right edge
        left = clamp(rect.right - BUTTON_WIDTH / 2, EDGE_PADDING, vw - BUTTON_WIDTH - EDGE_PADDING)
    } else {
        // Centre below the selection
        left = clamp(selectionCenterX - BUTTON_WIDTH / 2, EDGE_PADDING, vw - BUTTON_WIDTH - EDGE_PADDING)
    }
    return { position: 'fixed', top, left }
}

export default function AskGeminiPopup({ rect, containerRect, onAsk }: AskGeminiPopupProps) {
    const popupStyle: React.CSSProperties = {
        ...computePopupStyle(rect, containerRect),
        zIndex: 9999,
    }

    return createPortal(
        <div
            data-popup="ask-gemini"
            style={popupStyle}
        >
            <button
                data-popup="ask-gemini"
                onClick={onAsk}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-lg
                   opacity-0 animate-[fadeIn_100ms_ease-in_forwards] hover:bg-indigo-700 transition-colors"
                style={{ animation: 'fadeIn 100ms ease-in forwards' }}
            >
                <span data-popup="ask-gemini">✨</span>
                <span data-popup="ask-gemini">Ask Gemini</span>
            </button>
        </div>,
        document.body
    )
}
