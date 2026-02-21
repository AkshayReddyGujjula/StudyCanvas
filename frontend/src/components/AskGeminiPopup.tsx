import { createPortal } from 'react-dom'

interface AskGeminiPopupProps {
    rect: DOMRect
    onAsk: () => void
}

export default function AskGeminiPopup({ rect, onAsk }: AskGeminiPopupProps) {
    return createPortal(
        <div
            data-popup="ask-gemini"
            style={{
                position: 'fixed',
                top: rect.bottom + 8,
                left: rect.left,
                zIndex: 9999,
            }}
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
