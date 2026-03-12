import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FlashcardNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { extractPageImageBase64 } from '../utils/pdfImageExtractor'
import { fetchPageTitle } from '../api/studyApi'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number | undefined): string {
    if (!ms) return 'Never'
    const diff = Date.now() - ms
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return 'Just now'
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardEntry {
    nodeId: string
    data: FlashcardNodeData
    lastFlipped: number | undefined
}

interface PageGroup {
    pageIndex: number
    label: string
    cards: CardEntry[]
    lastRevised: number | undefined
    understoodCount: number
    strugglingCount: number
}

interface AllFlashcardsModalProps {
    onClose: () => void
    onStartRevision: (cards: FlashcardNodeData[], nodeIds: string[]) => void
}

// ── SingleFlashcardPopup ──────────────────────────────────────────────────────

interface SingleFlashcardPopupProps {
    nodeId: string
    onClose: () => void
}

function SingleFlashcardPopup({ nodeId, onClose }: SingleFlashcardPopupProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const recordFlashcardFlip = useCanvasStore((s) => s.recordFlashcardFlip)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    // Read live data from store so status changes reflect immediately
    const liveData = useCanvasStore((s) => {
        const node = s.nodes.find((n) => n.id === nodeId)
        return node ? (node.data as unknown as FlashcardNodeData) : null
    })

    const [isFlipped, setIsFlipped] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    // If the node was deleted while the popup is open, close it
    if (!liveData) return null
    const data = liveData

    const handleFlip = useCallback(() => {
        setIsFlipped((f) => !f)
        recordFlashcardFlip(nodeId)
        persistToLocalStorage()
    }, [nodeId, recordFlashcardFlip, persistToLocalStorage])

    const handleStatus = (clicked: 'understood' | 'struggling') => {
        const newStatus = data.status === clicked ? 'unread' : clicked
        updateNodeData(nodeId, { status: newStatus })
        persistToLocalStorage()
    }

    const handleDelete = () => {
        if (!confirmDelete) { setConfirmDelete(true); return }
        setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
        persistToLocalStorage()
        onClose()
    }

    const statusBorderClass =
        data.status === 'understood' ? 'border-t-success-500' :
        data.status === 'struggling' ? 'border-t-accent-500' :
        'border-t-secondary-500'

    const headerBg =
        data.status === 'understood' ? '#E8F5EC' :
        data.status === 'struggling' ? '#FCEEEE' :
        '#E6F4FA'

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
            <div
                className={`bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 border-t-4 ${statusBorderClass} overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: headerBg }}>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-secondary-700 uppercase tracking-wider">Flashcard</span>
                        {/* Understood */}
                        <button
                            type="button"
                            onClick={() => handleStatus('understood')}
                            title="Got it"
                            className={`p-1 rounded-full transition-all border ${data.status === 'understood'
                                ? 'bg-success-500 text-white border-success-500'
                                : 'bg-white text-neutral-500 border-gray-200 hover:border-success-300 hover:text-success-600'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                        {/* Struggling */}
                        <button
                            type="button"
                            onClick={() => handleStatus('struggling')}
                            title="Struggling"
                            className={`p-1 rounded-full transition-all border ${data.status === 'struggling'
                                ? 'bg-accent-500 text-white border-accent-500'
                                : 'bg-white text-neutral-500 border-gray-200 hover:border-accent-300 hover:text-accent-600'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Delete */}
                        {confirmDelete ? (
                            <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                                <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
                                <button type="button" title="Confirm delete" onClick={handleDelete} className="p-1 text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                                <button type="button" title="Cancel delete" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={handleDelete} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        )}
                        {/* Close */}
                        <button type="button" title="Close" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Card flip body */}
                <div
                    className="flashcard-scene px-4 pt-3 pb-4 cursor-pointer"
                    style={{ height: 230 }}
                    onClick={handleFlip}
                >
                    <div className={`flashcard-inner${isFlipped ? ' is-flipped' : ''}`} style={{ height: '100%' }}>
                        {/* Front */}
                        <div className="flashcard-face nodrag nopan custom-scrollbar">
                            <div className="flex flex-col items-center justify-center text-center h-full px-3 py-3">
                                <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-2">Question</p>
                                <p className="text-sm font-bold text-gray-800 leading-snug overflow-y-auto w-full custom-scrollbar" style={{ maxHeight: 130 }}>{data.question}</p>
                                <p className="mt-2 text-[10px] text-gray-400 italic">Click to reveal answer ↩</p>
                            </div>
                        </div>
                        {/* Back */}
                        <div className="flashcard-face flashcard-face-back nodrag nopan custom-scrollbar">
                            <div className="flex flex-col h-full px-2 py-3">
                                <p className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-1.5 flex-shrink-0">Answer</p>
                                <div className="prose prose-sm max-w-none text-gray-700 overflow-y-auto flex-1 custom-scrollbar" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.answer}</ReactMarkdown>
                                </div>
                                <div className="border-t border-gray-100 pt-1.5 mt-1.5 flex-shrink-0">
                                    <p className="text-[11px] text-gray-700 font-medium leading-snug line-clamp-2" title={data.question}>Q: {data.question}</p>
                                    <p className="text-[10px] text-gray-400 italic mt-0.5">Click to flip back ↩</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SortMode = 'default' | 'lastRevised' | 'struggling'

/**
 * Apply the active sort/filter mode to a card list.
 * - 'default'     → original order
 * - 'lastRevised' → never-revised first, then oldest-revised first (longest since revision at top)
 * - 'struggling'  → EXCLUSIVE FILTER: only struggling cards (not just re-ordered)
 */
function applySort(cards: CardEntry[], mode: SortMode): CardEntry[] {
    if (mode === 'default') return cards
    if (mode === 'lastRevised') {
        return [...cards].sort((a, b) => {
            // undefined (never revised) treated as 0 → comes first (longest since revision)
            const aTime = a.lastFlipped ?? 0
            const bTime = b.lastFlipped ?? 0
            return aTime - bTime
        })
    }
    if (mode === 'struggling') {
        // Exclusive filter — only show/revise struggling cards
        return cards.filter((c) => c.data.status === 'struggling')
    }
    return cards
}

// ── AllFlashcardsModal ────────────────────────────────────────────────────────

export default function AllFlashcardsModal({ onClose, onStartRevision }: AllFlashcardsModalProps) {
    const nodes = useCanvasStore((s) => s.nodes)
    const flashcardLastFlipped = useCanvasStore((s) => s.flashcardLastFlipped)
    const pdfArrayBuffer = useCanvasStore((s) => s.pdfArrayBuffer)
    const pageMarkdowns = useCanvasStore((s) => s.pageMarkdowns)
    // Persistent title cache from canvasStore (survives modal re-opens)
    const storedPageTitles = useCanvasStore((s) => s.pageTitles)
    const setPageTitle = useCanvasStore((s) => s.setPageTitle)

    const [searchQuery, setSearchQuery] = useState('')
    const [sortMode, setSortMode] = useState<SortMode>('default')
    const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set())
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    // Local loading state: tracks which pages are currently being fetched (null = loading)
    const [loadingTitles, setLoadingTitles] = useState<Set<number>>(new Set())
    const fetchingPagesRef = useRef<Set<number>>(new Set())

    // ── Native scroll stop (prevents canvas from zooming/panning behind modal) ──
    const backdropRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = backdropRef.current
        if (!el) return
        const stopWheel = (e: WheelEvent) => e.stopPropagation()
        el.addEventListener('wheel', stopWheel, { capture: true, passive: false })
        return () => el.removeEventListener('wheel', stopWheel, { capture: true })
    }, [])

    // ── Derive page groups from all non-loading flashcard nodes ───────────────
    const pageGroups = useMemo((): PageGroup[] => {
        const grouped = new Map<number, PageGroup>()
        for (const node of nodes) {
            if (node.type !== 'flashcardNode') continue
            const d = node.data as unknown as FlashcardNodeData
            if (d.isLoading) continue
            const pi = d.pageIndex ?? 0
            if (!grouped.has(pi)) {
                grouped.set(pi, {
                    pageIndex: pi,
                    label: pi === 0 ? 'Unpaged' : `Page ${pi}`,
                    cards: [],
                    lastRevised: undefined,
                    understoodCount: 0,
                    strugglingCount: 0,
                })
            }
            const group = grouped.get(pi)!
            const lf = flashcardLastFlipped[node.id]
            group.cards.push({ nodeId: node.id, data: d, lastFlipped: lf })
            if (lf !== undefined) {
                group.lastRevised = group.lastRevised === undefined ? lf : Math.max(group.lastRevised, lf)
            }
            if (d.status === 'understood') group.understoodCount++
            if (d.status === 'struggling') group.strugglingCount++
        }
        return [...grouped.values()].sort((a, b) => {
            if (a.pageIndex === 0) return 1
            if (b.pageIndex === 0) return -1
            return a.pageIndex - b.pageIndex
        })
    }, [nodes, flashcardLastFlipped])

    const totalCards = useMemo(() => pageGroups.reduce((s, pg) => s + pg.cards.length, 0), [pageGroups])

    // ── Fetch AI page titles (only for pages not already in the persistent store) ──
    useEffect(() => {
        const pagesToFetch = pageGroups.filter(
            (pg) =>
                pg.pageIndex > 0 &&
                storedPageTitles[pg.pageIndex] === undefined &&   // not yet in persistent cache
                !fetchingPagesRef.current.has(pg.pageIndex)       // not already in-flight
        )
        if (pagesToFetch.length === 0) return

        pagesToFetch.forEach((pg) => {
            fetchingPagesRef.current.add(pg.pageIndex)
            setLoadingTitles((prev) => new Set(prev).add(pg.pageIndex))

            const doFetch = async () => {
                const text = pageMarkdowns[pg.pageIndex - 1] ?? ''
                if (!text.trim()) {
                    setPageTitle(pg.pageIndex, '')
                    setLoadingTitles((prev) => { const s = new Set(prev); s.delete(pg.pageIndex); return s })
                    return
                }
                let imageBase64: string | undefined
                if (pdfArrayBuffer) {
                    imageBase64 = (await extractPageImageBase64(pdfArrayBuffer, pg.pageIndex - 1, 96)) ?? undefined
                }
                try {
                    const title = await fetchPageTitle(text.slice(0, 4000), imageBase64)
                    setPageTitle(pg.pageIndex, title)  // persisted in canvasStore
                } catch {
                    setPageTitle(pg.pageIndex, '')
                } finally {
                    setLoadingTitles((prev) => { const s = new Set(prev); s.delete(pg.pageIndex); return s })
                }
            }
            doFetch()
        })
    }, [pageGroups, pageMarkdowns, pdfArrayBuffer, storedPageTitles, setPageTitle])

    // ── Search filter ─────────────────────────────────────────────────────────
    const filteredGroups = useMemo((): PageGroup[] => {
        const q = searchQuery.trim().toLowerCase()
        if (!q) return pageGroups
        return pageGroups.map((pg) => ({
            ...pg,
            cards: pg.cards.filter(
                (c) =>
                    c.data.question.toLowerCase().includes(q) ||
                    c.data.answer.toLowerCase().includes(q)
            ),
        })).filter((pg) => pg.cards.length > 0)
    }, [pageGroups, searchQuery])

    // allMatchingCards: cards that pass search (before sort/filter mode)
    const allMatchingCards = useMemo(() => filteredGroups.flatMap((pg) => pg.cards), [filteredGroups])

    // sortedAllMatchingCards: after applying sort/filter mode
    const sortedAllMatchingCards = useMemo(() => applySort(allMatchingCards, sortMode), [allMatchingCards, sortMode])

    // sortedVisibleGroups: filtered groups with sort/filter applied to each group's card list
    // Groups that become empty after applying 'struggling' filter are removed
    const sortedVisibleGroups = useMemo(() => {
        return filteredGroups
            .map((pg) => ({ ...pg, cards: applySort(pg.cards, sortMode) }))
            .filter((pg) => pg.cards.length > 0)
    }, [filteredGroups, sortMode])

    const isSearchActive = searchQuery.trim().length > 0

    const togglePage = (pageIndex: number) => {
        setExpandedPages((prev) => {
            const next = new Set(prev)
            if (next.has(pageIndex)) next.delete(pageIndex)
            else next.add(pageIndex)
            return next
        })
    }

    const effectiveExpanded = useMemo(() => {
        if (!isSearchActive && sortMode === 'default') return expandedPages
        // Auto-expand all groups when search is active or a sort/filter is applied
        return new Set(sortedVisibleGroups.map((pg) => pg.pageIndex))
    }, [isSearchActive, sortMode, sortedVisibleGroups, expandedPages])

    // handleRevisePage uses pg.cards which are already sorted/filtered from sortedVisibleGroups
    const handleRevisePage = useCallback((pg: PageGroup) => {
        onStartRevision(pg.cards.map((c) => c.data), pg.cards.map((c) => c.nodeId))
    }, [onStartRevision])

    const handleReviseAll = useCallback(() => {
        onStartRevision(sortedAllMatchingCards.map((c) => c.data), sortedAllMatchingCards.map((c) => c.nodeId))
    }, [sortedAllMatchingCards, onStartRevision])

    const reviseAllLabel = useMemo(() => {
        const n = sortedAllMatchingCards.length
        if (isSearchActive) return `Revise ${n} found`
        if (sortMode === 'struggling') return `Revise ${n} struggling`
        return `Revise all ${n}`
    }, [isSearchActive, sortMode, sortedAllMatchingCards.length])

    return (
        <>
            <div ref={backdropRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
                <div
                    className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col"
                    style={{ maxHeight: '88vh' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Header ─────────────────────────────────────────────── */}
                    <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-secondary-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="5" width="20" height="14" rx="2" />
                                    <line x1="2" y1="10" x2="22" y2="10" />
                                </svg>
                                <h2 className="text-base font-bold text-gray-800">All Flashcards</h2>
                                {totalCards > 0 && (
                                    <span className="text-xs text-gray-400 font-medium">{totalCards} total</span>
                                )}
                            </div>
                            <button type="button" title="Close" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Search + Revise row */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search questions and answers…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary-300 focus:border-transparent placeholder-gray-400"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        title="Clear search"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleReviseAll}
                                disabled={sortedAllMatchingCards.length === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary-500 hover:bg-secondary-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap disabled:cursor-not-allowed"
                            >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {reviseAllLabel}
                            </button>
                        </div>

                        {/* Sort / Filter row */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Filter:</span>
                            <button
                                type="button"
                                onClick={() => setSortMode('default')}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    sortMode === 'default'
                                        ? 'bg-secondary-500 text-white border-secondary-500'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-secondary-300 hover:text-secondary-600'
                                }`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setSortMode('lastRevised')}
                                title="Sort by longest time since last revision — never-revised cards appear first"
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    sortMode === 'lastRevised'
                                        ? 'bg-secondary-500 text-white border-secondary-500'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-secondary-300 hover:text-secondary-600'
                                }`}
                            >
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /><polyline points="12 6 12 12 16 14" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                Least Revised
                            </button>
                            <button
                                type="button"
                                onClick={() => setSortMode('struggling')}
                                title="Show only struggling cards"
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                    sortMode === 'struggling'
                                        ? 'bg-accent-500 text-white border-accent-500'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-accent-300 hover:text-accent-600'
                                }`}
                            >
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                Struggling Only
                            </button>
                            {sortMode !== 'default' && (
                                <span className="ml-auto text-[10px] text-secondary-600 font-medium italic">
                                    {sortMode === 'struggling' ? 'Showing struggling only' : 'Sorted by revision age'}
                                </span>
                            )}
                        </div>

                        {/* Search result hint */}
                        {isSearchActive && allMatchingCards.length === 0 && (
                            <p className="mt-2 text-xs text-gray-400">No cards match your search.</p>
                        )}
                        {isSearchActive && allMatchingCards.length > 0 && (
                            <p className="mt-2 text-xs text-gray-400">
                                {allMatchingCards.length} card{allMatchingCards.length !== 1 ? 's' : ''} across {filteredGroups.length} page{filteredGroups.length !== 1 ? 's' : ''} match &ldquo;{searchQuery.trim()}&rdquo;
                            </p>
                        )}
                    </div>

                    {/* ── Page list ─────────────────────────────────────────── */}
                    <div className="overflow-y-auto custom-scrollbar flex-1 px-4 py-3 space-y-2">
                        {totalCards === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.5} />
                                    <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.5} />
                                </svg>
                                <p className="text-sm font-medium">No flashcards yet.</p>
                                <p className="text-xs mt-1 text-center max-w-xs">Use the Flash Cards menu to generate cards from a page, or add custom ones from the toolbar.</p>
                            </div>
                        ) : sortedVisibleGroups.length === 0 && sortMode === 'struggling' ? (
                            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
                                <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mb-3">
                                    <svg className="w-6 h-6 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <p className="text-sm font-medium text-gray-600">No struggling cards!</p>
                                <p className="text-xs mt-1 text-gray-400">All cards are marked as understood or unreviewed.</p>
                                <button type="button" onClick={() => setSortMode('default')} className="mt-3 text-xs text-secondary-500 hover:underline font-medium">Show all cards</button>
                            </div>
                        ) : (
                            sortedVisibleGroups.map((pg) => {
                                const isExpanded = effectiveExpanded.has(pg.pageIndex)
                                const storedTitle = pg.pageIndex > 0 ? storedPageTitles[pg.pageIndex] : undefined
                                const isLoadingTitle = loadingTitles.has(pg.pageIndex)
                                return (
                                    <div key={pg.pageIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                                        {/* Page row header */}
                                        <div className="flex items-center px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                                            {/* Expand toggle — flex-col so title gets its own full-width row */}
                                            <button
                                                type="button"
                                                onClick={() => togglePage(pg.pageIndex)}
                                                className="flex items-center flex-1 min-w-0 text-left gap-2"
                                            >
                                                <svg
                                                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                <span className="text-sm font-semibold text-gray-700 shrink-0">{pg.label}</span>
                                                <span className="text-xs text-gray-400 shrink-0">{pg.cards.length} card{pg.cards.length !== 1 ? 's' : ''}</span>
                                                <span className="flex items-center gap-1 text-xs text-success-600 font-medium shrink-0">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                                                    {pg.understoodCount}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-accent-600 font-medium shrink-0">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                    {pg.strugglingCount}
                                                </span>
                                                {/* Title — fills remaining space between counts and time */}
                                                <span className="flex-1 min-w-0 flex items-center">
                                                    {pg.pageIndex > 0 && isLoadingTitle && !storedTitle ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 italic">
                                                            <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                                            Generating title…
                                                        </span>
                                                    ) : pg.pageIndex > 0 && storedTitle ? (
                                                        <span
                                                            className="text-[11px] text-secondary-700 font-medium bg-secondary-50 border border-secondary-100 rounded px-2 py-0.5 truncate max-w-full"
                                                            title={storedTitle}
                                                        >
                                                            {storedTitle}
                                                        </span>
                                                    ) : null}
                                                </span>
                                                <span className="text-xs text-gray-400 shrink-0">
                                                    {formatRelativeTime(pg.lastRevised)}
                                                </span>
                                            </button>

                                            {/* Revise button */}
                                            <button
                                                type="button"
                                                onClick={() => handleRevisePage(pg)}
                                                className="flex items-center gap-1 px-2.5 py-1 bg-secondary-500 hover:bg-secondary-600 text-white text-xs font-medium rounded-md transition-colors shrink-0 ml-2"
                                            >
                                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Revise
                                            </button>
                                        </div>

                                        {/* Expanded card list */}
                                        {isExpanded && (
                                            <div className="divide-y divide-gray-100">
                                                {pg.cards.map((c) => {
                                                    const statusDot =
                                                        c.data.status === 'understood' ? 'bg-success-500' :
                                                        c.data.status === 'struggling' ? 'bg-accent-500' :
                                                        'bg-gray-300'
                                                    return (
                                                        <button
                                                            key={c.nodeId}
                                                            type="button"
                                                            title={c.data.question || 'Open flashcard'}
                                                            onClick={() => setSelectedNodeId(c.nodeId)}
                                                            className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors group"
                                                        >
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                                                            <span className="text-sm text-gray-700 truncate flex-1 group-hover:text-secondary-700 transition-colors">
                                                                {c.data.question || <em className="text-gray-400">No question</em>}
                                                            </span>
                                                            <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-secondary-400 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}

                        {/* No search results */}
                        {totalCards > 0 && isSearchActive && sortedVisibleGroups.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                <svg className="w-8 h-8 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8" strokeWidth={1.5} /><path d="m21 21-4.35-4.35" strokeLinecap="round" strokeWidth={1.5} />
                                </svg>
                                <p className="text-sm font-medium">No cards match your search.</p>
                                <button type="button" onClick={() => setSearchQuery('')} className="mt-1 text-xs text-secondary-500 hover:underline">Clear search</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Single card popup */}
            {selectedNodeId && (
                <SingleFlashcardPopup
                    nodeId={selectedNodeId}
                    onClose={() => setSelectedNodeId(null)}
                />
            )}
        </>
    )
}
