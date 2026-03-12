import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlashcardNodeData, NodeStatus } from '../types'
import { useCanvasStore } from '../store/canvasStore'

interface FlashcardRevisionPopupProps {
    cards: FlashcardNodeData[]
    nodeIds: string[]   // parallel array — same length and order as cards
    onClose: () => void
    onFinish?: () => void
}

type FilterMode = 'all' | 'needsReview'

interface DeckEntry {
    card: FlashcardNodeData
    nodeId: string
}

function computeDeck(cards: FlashcardNodeData[], nodeIds: string[], mode: FilterMode): DeckEntry[] {
    const indexed = cards.map((card, i) => ({ card, nodeId: nodeIds[i] }))
    if (mode === 'needsReview') {
        return indexed.filter(({ card }) => card.status !== 'understood')
    }
    return indexed
}

export default function FlashcardRevisionPopup({ cards, nodeIds, onClose, onFinish }: FlashcardRevisionPopupProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const recordFlashcardFlip = useCanvasStore((s) => s.recordFlashcardFlip)

    // Document-level wheel capture — stops scroll events reaching the canvas for
    // all three conditional screens (completion / empty / main). Stays active as
    // long as this component is mounted.
    useEffect(() => {
        const stopWheel = (e: WheelEvent) => e.stopPropagation()
        document.addEventListener('wheel', stopWheel, { capture: true, passive: false })
        return () => document.removeEventListener('wheel', stopWheel, { capture: true })
    }, [])

    const [filterMode, setFilterMode] = useState<FilterMode>('all')
    const [deckSnapshot, setDeckSnapshot] = useState<DeckEntry[]>(() => computeDeck(cards, nodeIds, 'all'))
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [done, setDone] = useState(false)
    // Track per-session statuses so completion stats are accurate
    const [sessionStatuses, setSessionStatuses] = useState<Record<string, NodeStatus>>(
        () => Object.fromEntries(cards.map((c, i) => [nodeIds[i], c.status]))
    )

    const currentEntry = deckSnapshot[currentIndex] ?? null
    const totalInDeck = deckSnapshot.length

    // Progress: how many cards have been acted on (current card shown counts as in-progress)
    const progress = totalInDeck > 0 ? Math.round((currentIndex / totalInDeck) * 100) : 0

    const handleFilterToggle = useCallback(() => {
        const newMode: FilterMode = filterMode === 'all' ? 'needsReview' : 'all'
        const newDeck = computeDeck(cards, nodeIds, newMode)
        setFilterMode(newMode)
        setDeckSnapshot(newDeck)
        setCurrentIndex(0)
        setIsFlipped(false)
        setDone(newDeck.length === 0)
    }, [filterMode, cards, nodeIds])

    const advance = useCallback(() => {
        if (currentIndex >= deckSnapshot.length - 1) {
            setDone(true)
        } else {
            setCurrentIndex((i) => i + 1)
            setIsFlipped(false)
        }
    }, [currentIndex, deckSnapshot.length])

    const handleFlip = useCallback(() => {
        if (!currentEntry) return
        setIsFlipped((f) => !f)
        recordFlashcardFlip(currentEntry.nodeId)
        persistToLocalStorage()
    }, [currentEntry, recordFlashcardFlip, persistToLocalStorage])

    const handleGotIt = useCallback(() => {
        if (!currentEntry) return
        updateNodeData(currentEntry.nodeId, { status: 'understood' })
        setSessionStatuses((s) => ({ ...s, [currentEntry.nodeId]: 'understood' }))
        persistToLocalStorage()
        advance()
    }, [currentEntry, updateNodeData, persistToLocalStorage, advance])

    const handleStruggling = useCallback(() => {
        if (!currentEntry) return
        updateNodeData(currentEntry.nodeId, { status: 'struggling' })
        setSessionStatuses((s) => ({ ...s, [currentEntry.nodeId]: 'struggling' }))
        persistToLocalStorage()
        advance()
    }, [currentEntry, updateNodeData, persistToLocalStorage, advance])

    const handleSkip = useCallback(() => advance(), [advance])

    const handleRestart = useCallback(() => {
        setCurrentIndex(0)
        setIsFlipped(false)
        setDone(false)
        // Restore sessionStatuses from the current cards
        setSessionStatuses(Object.fromEntries(cards.map((c, i) => [nodeIds[i], c.status])))
    }, [cards, nodeIds])

    // Completion stats
    const completionStats = useMemo(() => {
        if (!done) return null
        let understood = 0, struggling = 0, skipped = 0
        for (const { nodeId, card } of deckSnapshot) {
            const finalStatus = sessionStatuses[nodeId] ?? card.status
            if (finalStatus === 'understood') understood++
            else if (finalStatus === 'struggling') struggling++
            else skipped++
        }
        return { understood, struggling, skipped, total: deckSnapshot.length }
    }, [done, deckSnapshot, sessionStatuses])

    // Show page badge if cards span multiple pages
    const hasMultiplePages = useMemo(() => {
        const pages = new Set(cards.map((c) => c.pageIndex ?? 0))
        return pages.size > 1
    }, [cards])

    // ── Completion screen ─────────────────────────────────────────────────────
    if (done && completionStats) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
                <div
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-8 py-8 text-center">
                        <div className="w-14 h-14 rounded-full bg-secondary-50 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-7 h-7 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Session complete!</h3>
                        <p className="text-sm text-gray-500 mb-6">You reviewed {completionStats.total} card{completionStats.total !== 1 ? 's' : ''}.</p>

                        <div className="grid grid-cols-3 gap-3 mb-8">
                            <div className="bg-success-50 rounded-lg py-3 px-2 text-center">
                                <p className="text-2xl font-bold text-success-600">{completionStats.understood}</p>
                                <p className="text-[11px] font-medium text-success-700 mt-0.5">Got it</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg py-3 px-2 text-center">
                                <p className="text-2xl font-bold text-gray-500">{completionStats.skipped}</p>
                                <p className="text-[11px] font-medium text-gray-500 mt-0.5">Skipped</p>
                            </div>
                            <div className="bg-accent-50 rounded-lg py-3 px-2 text-center">
                                <p className="text-2xl font-bold text-accent-600">{completionStats.struggling}</p>
                                <p className="text-[11px] font-medium text-accent-700 mt-0.5">Struggling</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleRestart}
                                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Restart
                            </button>
                            <button
                                type="button"
                                onClick={onFinish ?? onClose}
                                className="flex-1 px-4 py-2.5 bg-secondary-500 hover:bg-secondary-600 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ── Empty deck (Needs Review but all understood) ───────────────────────────
    if (totalInDeck === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
                <div
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-8 py-10 text-center">
                        <div className="w-14 h-14 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-7 h-7 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">All cards understood!</h3>
                        <p className="text-sm text-gray-500 mb-6">No cards need review. Switch to "All Cards" to revise everything.</p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleFilterToggle}
                                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Show all cards
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 bg-secondary-500 hover:bg-secondary-600 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ── Main revision view ────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div
                            className="h-full bg-secondary-500 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">
                                {currentIndex + 1} <span className="text-gray-400 font-normal">/ {totalInDeck}</span>
                            </span>
                            {/* Filter toggle */}
                            <button
                                type="button"
                                onClick={handleFilterToggle}
                                title={filterMode === 'all' ? 'Switch to Needs Review' : 'Switch to All Cards'}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                                    filterMode === 'needsReview'
                                        ? 'bg-accent-50 text-accent-700 border-accent-200'
                                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                }`}
                            >
                                {filterMode === 'needsReview' ? (
                                    <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        Needs review
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                                        All cards
                                    </>
                                )}
                            </button>
                        </div>
                        <button
                            type="button"
                            title="Close revision"
                            onClick={onClose}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* ── Card body ────────────────────────────────────────────── */}
                {currentEntry && (
                    <>
                        <div
                            className="flashcard-scene px-6 pt-4 pb-2 cursor-pointer flex-1"
                            style={{ minHeight: 220 }}
                            onClick={handleFlip}
                        >
                            <div className={`flashcard-inner${isFlipped ? ' is-flipped' : ''}`} style={{ height: 220 }}>
                                {/* Front — Question */}
                                <div className="flashcard-face nodrag nopan">
                                    <div className="flex flex-col items-center justify-center text-center h-full px-4 py-4">
                                        <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-3">Question</p>
                                        <p className="text-base font-bold text-gray-800 leading-snug overflow-y-auto w-full custom-scrollbar" style={{ maxHeight: 140 }}>
                                            {currentEntry.card.question}
                                        </p>
                                        {hasMultiplePages && currentEntry.card.pageIndex && (
                                            <span className="mt-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary-50 text-secondary-700 border border-secondary-100">
                                                Page {currentEntry.card.pageIndex}
                                            </span>
                                        )}
                                        <p className="mt-3 text-[10px] text-gray-400 italic">Click to reveal answer ↩</p>
                                    </div>
                                </div>

                                {/* Back — Answer */}
                                <div className="flashcard-face flashcard-face-back nodrag nopan">
                                    <div className="flex flex-col h-full px-4 py-4 min-h-0">
                                        <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-2 flex-shrink-0">Answer</p>
                                        <div
                                            className="prose prose-sm max-w-none text-gray-700 overflow-y-auto flex-1 custom-scrollbar"
                                            style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
                                        >
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentEntry.card.answer}</ReactMarkdown>
                                        </div>
                                        <div className="border-t border-gray-100 pt-2 mt-2 flex items-center justify-between flex-shrink-0">
                                            <p className="text-[11px] text-gray-500 font-medium leading-snug line-clamp-2 flex-1 pr-2" title={currentEntry.card.question}>
                                                Q: {currentEntry.card.question}
                                            </p>
                                            {hasMultiplePages && currentEntry.card.pageIndex && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary-50 text-secondary-700 border border-secondary-100 shrink-0">
                                                    Page {currentEntry.card.pageIndex}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Footer actions ───────────────────────────────── */}
                        <div className="px-5 py-4 border-t border-gray-100">
                            {!isFlipped ? (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleFlip}
                                        className="flex-1 py-2.5 bg-secondary-500 hover:bg-secondary-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Flip Card ↩
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSkip}
                                        title="Skip this card"
                                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                        Skip
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleStruggling}
                                        className="flex-1 py-2.5 bg-accent-50 hover:bg-accent-100 border border-accent-200 text-accent-700 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        Struggling
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSkip}
                                        className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                        Skip
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleGotIt}
                                        className="flex-1 py-2.5 bg-success-50 hover:bg-success-100 border border-success-200 text-success-700 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                        Got it
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
