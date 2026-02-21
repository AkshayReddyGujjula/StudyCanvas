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
    const GAP = 8               // gap between selection and popup
    const EDGE_PADDING = 8      // minimum distance from viewport edges

    // Determine the horizontal zone of the selection relative to the PDF container
    const selectionCenterX = rect.left + rect.width / 2
    let relativeX: number
    if (containerRect && containerRect.width > 0) {
        relativeX = (selectionCenterX - containerRect.left) / containerRect.width
    } else {
        relativeX = selectionCenterX / vw
    }

    // Zone thresholds: left < 35%, right > 65%, center in between
    const zone = relativeX < 0.35 ? 'left' : relativeX > 0.65 ? 'right' : 'center'

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

    if (zone === 'left') {
        // Popup appears to the LEFT of the selection, vertically centred on it
        const top = clamp(rect.top + rect.height / 2 - BUTTON_HEIGHT / 2, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
        const right = vw - rect.left + GAP
        return { position: 'fixed', top, right: clamp(right, EDGE_PADDING, vw - EDGE_PADDING) }
    }

    if (zone === 'right') {
        // Popup appears to the RIGHT of the selection, vertically centred on it
        const top = clamp(rect.top + rect.height / 2 - BUTTON_HEIGHT / 2, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
        const left = rect.right + GAP
        return { position: 'fixed', top, left: clamp(left, EDGE_PADDING, vw - EDGE_PADDING) }
    }

    // CENTER — popup appears BELOW the selection, horizontally centred under it
    const top = clamp(rect.bottom + GAP, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
    const centreLeft = selectionCenterX
    return {
        position: 'fixed',
        top,
        left: clamp(centreLeft, EDGE_PADDING, vw - EDGE_PADDING),
        transform: 'translateX(-50%)',
    }
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
