import { useRef, useState, useEffect, useCallback } from 'react'

interface LeftToolbarProps {
    onCustomPrompt: () => void
    onSnip: () => void
    onAddImage: (dataUrl: string, fileName: string) => void
    onCustomFlashcard: () => void
    onCodeEditor: () => void
    onCalculator: () => void
    onStickyNote: () => void
    onVoiceNote: () => void
    onTimer: () => void
    onSummary: () => void
    /** Last autosave timestamp (null = no autosave yet this session) */
    lastAutoSave?: Date | null
    /** Autosave interval in milliseconds (used to display the cadence) */
    autoSaveInterval?: number
}

/** Format ms interval as a short human-readable label: 30000 → "30s", 60000 → "1m" */
function formatInterval(ms: number): string {
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m`
    return `${Math.round(m / 60)}h`
}

/** Format a Date relative to now, e.g. "just now", "2m ago", "14:32". */
function formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 10) return 'just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Drag-to-reorder types and persistence ──────────────────────────────────

type ToolbarItemId =
    | 'ai' | 'snip' | 'image' | 'flashcard' | 'codeEditor'
    | 'calculator' | 'stickyNote' | 'voiceNote' | 'timer' | 'summary'

const DEFAULT_ORDER: ToolbarItemId[] = [
    'ai', 'snip', 'image', 'flashcard', 'codeEditor',
    'calculator', 'stickyNote', 'voiceNote', 'timer', 'summary',
]

const STORAGE_KEY = 'studycanvas_left_toolbar_order'

function loadOrder(): ToolbarItemId[] {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (!saved) return [...DEFAULT_ORDER]
        const parsed = JSON.parse(saved) as string[]
        const valid = parsed.filter((id): id is ToolbarItemId =>
            (DEFAULT_ORDER as string[]).includes(id)
        )
        const missing = DEFAULT_ORDER.filter(id => !valid.includes(id))
        return [...valid, ...missing]
    } catch {
        return [...DEFAULT_ORDER]
    }
}

function persistOrder(order: ToolbarItemId[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)) } catch { /* ignore */ }
}

function reorderItems(
    arr: ToolbarItemId[],
    draggedId: ToolbarItemId,
    targetId: ToolbarItemId,
    dropPosition: 'before' | 'after',
): ToolbarItemId[] {
    const fromIdx = arr.indexOf(draggedId)
    let insertIdx = arr.indexOf(targetId)
    if (dropPosition === 'after') insertIdx++
    const next = arr.filter(id => id !== draggedId)
    const finalIdx = Math.max(0, Math.min(next.length, fromIdx < insertIdx ? insertIdx - 1 : insertIdx))
    next.splice(finalIdx, 0, draggedId)
    return next
}

// ── Component ─────────────────────────────────────────────────────────────

export default function LeftToolbar({
    onCustomPrompt,
    onSnip,
    onAddImage,
    onCustomFlashcard,
    onCodeEditor,
    onCalculator,
    onStickyNote,
    onVoiceNote,
    onTimer,
    onSummary,
    lastAutoSave,
    autoSaveInterval,
}: LeftToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isHovering, setIsHovering] = useState(false)
    // Refresh the autosave label every 10 seconds so "2m ago" stays accurate
    const [, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 10_000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        if (!isCollapsed) return
        const handleMouseMove = (e: MouseEvent) => {
            if (e.clientX < 20) {
                setIsHovering(true)
            } else if (e.clientX > 120) {
                setIsHovering(false)
            }
        }
        document.addEventListener('mousemove', handleMouseMove)
        return () => document.removeEventListener('mousemove', handleMouseMove)
    }, [isCollapsed])

    // ── Drag-to-reorder state ──────────────────────────────────────────────
    const [itemOrder, setItemOrder] = useState<ToolbarItemId[]>(() => loadOrder())
    const [draggedId, setDraggedId] = useState<ToolbarItemId | null>(null)
    const [dragOverId, setDragOverId] = useState<ToolbarItemId | null>(null)
    const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before')

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: ToolbarItemId) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        setDraggedId(id)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, id: ToolbarItemId) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverId(id)
        const rect = e.currentTarget.getBoundingClientRect()
        setDropPosition(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverId(null)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetId: ToolbarItemId) => {
        e.preventDefault()
        if (!draggedId || draggedId === targetId) {
            setDraggedId(null)
            setDragOverId(null)
            return
        }
        const newOrder = reorderItems(itemOrder, draggedId, targetId, dropPosition)
        setItemOrder(newOrder)
        persistOrder(newOrder)
        setDraggedId(null)
        setDragOverId(null)
    }, [draggedId, itemOrder, dropPosition])

    const handleDragEnd = useCallback(() => {
        setDraggedId(null)
        setDragOverId(null)
    }, [])

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            onAddImage(reader.result as string, file.name)
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    const isVisible = !isCollapsed || isHovering

    const btnClass =
        'flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 text-gray-600 hover:bg-gray-100 hover:text-gray-800'

    const autoSaveLabel = lastAutoSave ? formatRelativeTime(lastAutoSave) : 'Never'
    const intervalLabel = autoSaveInterval ? `(${formatInterval(autoSaveInterval)})` : ''

    // ── Button renderer ────────────────────────────────────────────────────
    const renderButton = (id: ToolbarItemId) => {
        switch (id) {
            case 'ai':
                return (
                    <button data-tutorial="ai-btn" onClick={onCustomPrompt} className={btnClass} title="Custom Prompt">
                        <span className="text-[11px] font-extrabold leading-none text-indigo-500">AI</span>
                    </button>
                )
            case 'snip':
                return (
                    <button onClick={onSnip} className={btnClass} title="Snipping Tool (Ctrl+Shift+S)">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <line x1="20" y1="4" x2="8.12" y2="15.88" />
                            <line x1="14.47" y1="14.48" x2="20" y2="20" />
                            <line x1="8.12" y1="8.12" x2="12" y2="12" />
                        </svg>
                    </button>
                )
            case 'image':
                return (
                    <button onClick={() => fileInputRef.current?.click()} className={btnClass} title="Add Image">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                    </button>
                )
            case 'flashcard':
                return (
                    <button onClick={onCustomFlashcard} className={btnClass} title="Custom Flashcard">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="13" rx="2" />
                            <path d="M2 10h20" />
                            <path d="M7 14h4" />
                            <path d="M15 14h2" />
                        </svg>
                    </button>
                )
            case 'codeEditor':
                return (
                    <button data-tutorial="code-editor-btn" onClick={onCodeEditor} className={btnClass} title="Code Editor">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                    </button>
                )
            case 'calculator':
                return (
                    <button onClick={onCalculator} className={btnClass} title="Calculator">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="2" width="16" height="20" rx="2" />
                            <line x1="8" y1="6" x2="16" y2="6" />
                            <line x1="8" y1="10" x2="10" y2="10" />
                            <line x1="14" y1="10" x2="16" y2="10" />
                            <line x1="8" y1="14" x2="10" y2="14" />
                            <line x1="14" y1="14" x2="16" y2="14" />
                            <line x1="8" y1="18" x2="10" y2="18" />
                            <line x1="14" y1="18" x2="16" y2="18" />
                        </svg>
                    </button>
                )
            case 'stickyNote':
                return (
                    <button onClick={onStickyNote} className={btnClass} title="Sticky Note">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                            <path d="M14 3v6h6" />
                        </svg>
                    </button>
                )
            case 'voiceNote':
                return (
                    <button onClick={onVoiceNote} className={btnClass} title="Voice Note">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                    </button>
                )
            case 'timer':
                return (
                    <button data-tutorial="timer-btn" onClick={onTimer} className={btnClass} title="Timer">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </button>
                )
            case 'summary':
                return (
                    <button onClick={onSummary} className={btnClass} title="Generate Summary">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </button>
                )
        }
    }

    return (
        <>
            {/* Thin edge indicator strip — visible only when collapsed and not peeking */}
            {isCollapsed && !isHovering && (
                <div
                    className="fixed left-0 z-40 cursor-pointer"
                    style={{
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '6px',
                        height: '64px',
                        borderRadius: '0 6px 6px 0',
                        background: 'rgba(156,163,175,0.7)',
                        boxShadow: '2px 0 8px rgba(0,0,0,0.18)',
                    }}
                    onClick={() => setIsHovering(true)}
                    title="Show left toolbar"
                />
            )}
            <div
                ref={toolbarRef}
                data-tutorial="left-toolbar"
                className="fixed left-4 z-40 flex flex-col gap-1 p-1.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg select-none transition-transform duration-300"
                style={{
                    top: '50%',
                    transform: `translateY(-50%) translateX(${isVisible ? '0' : 'calc(-100% - 1.5rem)'})`
                }}
            >
                {/* Hidden file input — kept outside the drag map to preserve ref stability */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                />

                {/* Draggable toolbar items */}
                {itemOrder.map(id => {
                    const isDragging = draggedId === id
                    const isDragTarget = dragOverId === id
                    return (
                        <div
                            key={id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, id)}
                            onDragOver={(e) => handleDragOver(e, id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, id)}
                            onDragEnd={handleDragEnd}
                            className="relative cursor-grab active:cursor-grabbing"
                            style={{ opacity: isDragging ? 0.4 : 1 }}
                            title={isDragTarget ? undefined : 'Drag to reorder'}
                        >
                            {/* Drop indicator — before */}
                            {isDragTarget && dropPosition === 'before' && (
                                <div
                                    className="absolute inset-x-1 h-0.5 bg-blue-400 rounded-full pointer-events-none z-10"
                                    style={{ top: -3 }}
                                />
                            )}
                            {renderButton(id)}
                            {/* Drop indicator — after */}
                            {isDragTarget && dropPosition === 'after' && (
                                <div
                                    className="absolute inset-x-1 h-0.5 bg-blue-400 rounded-full pointer-events-none z-10"
                                    style={{ bottom: -3 }}
                                />
                            )}
                        </div>
                    )
                })}

                <div className="h-px bg-gray-200 mx-1" />

                {/* Collapse toggle — not reorderable, stays pinned to bottom */}
                <button
                    onClick={() => { setIsCollapsed(!isCollapsed); setIsHovering(false) }}
                    className="flex items-center justify-center w-full h-4 rounded px-2 transition-all duration-150 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title={isCollapsed ? 'Pin toolbar' : 'Collapse toolbar'}
                >
                    {isCollapsed ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="13 17 18 12 13 7" />
                            <polyline points="6 17 11 12 6 7" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="11 17 6 12 11 7" />
                            <polyline points="18 17 13 12 18 7" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Autosave info — tiny grey text at bottom-left, only when toolbar is visible */}
            {isVisible && (
                <div
                    className="fixed bottom-1 left-4 z-40 flex flex-col items-start gap-0 pointer-events-none select-none"
                    style={{ transition: 'opacity 0.3s' }}
                >
                    <span
                        style={{ fontSize: '9px', lineHeight: '1.3', color: '#9ca3af', letterSpacing: '0.02em' }}
                        title={`Autosave: ${autoSaveLabel}${intervalLabel ? ' ' + intervalLabel : ''}`}
                    >
                        {autoSaveLabel} {intervalLabel}
                    </span>
                </div>
            )}
        </>
    )
}
