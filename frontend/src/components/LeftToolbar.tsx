import { useRef } from 'react'

interface LeftToolbarProps {
    onCustomPrompt: () => void
    onSnip: () => void
    onAddImage: (dataUrl: string, fileName: string) => void
    onStickyNote: () => void
    onVoiceNote: () => void
    onTimer: () => void
    onSummary: () => void
}

export default function LeftToolbar({
    onCustomPrompt,
    onSnip,
    onAddImage,
    onStickyNote,
    onVoiceNote,
    onTimer,
    onSummary,
}: LeftToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            onAddImage(reader.result as string, file.name)
        }
        reader.readAsDataURL(file)
        // Reset so the same file can be re-selected
        e.target.value = ''
    }

    const btnClass =
        'flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 text-gray-600 hover:bg-gray-100 hover:text-gray-800'

    return (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg select-none">
            {/* Custom Prompt (chat with Gemini) */}
            <button onClick={onCustomPrompt} className={btnClass} title="Custom Prompt">
                <span className="text-[11px] font-extrabold leading-none text-indigo-500">AI</span>
            </button>

            {/* Snipping Tool */}
            <button onClick={onSnip} className={btnClass} title="Snipping Tool (Ctrl+Shift+S)">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <line x1="20" y1="4" x2="8.12" y2="15.88" />
                    <line x1="14.47" y1="14.48" x2="20" y2="20" />
                    <line x1="8.12" y1="8.12" x2="12" y2="12" />
                </svg>
            </button>

            <div className="h-px bg-gray-200 mx-1" />

            {/* Add Image */}
            <button onClick={() => fileInputRef.current?.click()} className={btnClass} title="Add Image">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                </svg>
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
            />

            {/* Sticky Note */}
            <button onClick={onStickyNote} className={btnClass} title="Sticky Note">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                    <path d="M14 3v6h6" />
                </svg>
            </button>

            {/* Voice Note */}
            <button onClick={onVoiceNote} className={btnClass} title="Voice Note">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
            </button>

            <div className="h-px bg-gray-200 mx-1" />

            {/* Timer */}
            <button onClick={onTimer} className={btnClass} title="Timer">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </button>

            <div className="h-px bg-gray-200 mx-1" />

            {/* Summary Generator */}
            <button onClick={onSummary} className={btnClass} title="Generate Summary">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
            </button>
        </div>
    )
}
