import { useState, useMemo } from 'react'
import type { QuizHistoryEntry } from '../types'

interface QuizHistoryModalProps {
    entries: QuizHistoryEntry[]
    onClose: () => void
    onRetake: (entry: QuizHistoryEntry) => void
}

type SortField = 'date' | 'score' | 'page'

export default function QuizHistoryModal({ entries, onClose, onRetake }: QuizHistoryModalProps) {
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState<SortField>('date')
    const [sortAsc, setSortAsc] = useState(false) // newest first by default

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? entries.filter(e => e.title.toLowerCase().includes(q)) : entries
    }, [entries, search])

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            let diff = 0
            if (sortBy === 'date') {
                diff = new Date(a.dateCompleted).getTime() - new Date(b.dateCompleted).getTime()
            } else if (sortBy === 'score') {
                const aPct = a.totalQuestions > 0 ? a.score / a.totalQuestions : 0
                const bPct = b.totalQuestions > 0 ? b.score / b.totalQuestions : 0
                diff = aPct - bPct
            } else if (sortBy === 'page') {
                diff = (a.pageIndex ?? 0) - (b.pageIndex ?? 0)
            }
            return sortAsc ? diff : -diff
        })
    }, [filtered, sortBy, sortAsc])

    const handleSortClick = (field: SortField) => {
        if (sortBy === field) {
            setSortAsc(a => !a)
        } else {
            setSortBy(field)
            setSortAsc(false)
        }
    }

    const scoreColorClass = (entry: QuizHistoryEntry): string => {
        const pct = entry.totalQuestions > 0 ? (entry.score / entry.totalQuestions) * 100 : 0
        if (pct >= 80) return 'text-green-600'
        if (pct >= 50) return 'text-amber-600'
        return 'text-red-500'
    }

    const scoreBarClass = (entry: QuizHistoryEntry): string => {
        const pct = entry.totalQuestions > 0 ? (entry.score / entry.totalQuestions) * 100 : 0
        if (pct >= 80) return 'bg-green-500'
        if (pct >= 50) return 'bg-amber-500'
        return 'bg-red-500'
    }

    const formatDate = (iso: string): string => {
        const d = new Date(iso)
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    }

    const formatTime = (iso: string): string => {
        const d = new Date(iso)
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-10 px-4 pb-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        <h2 className="text-lg font-bold text-gray-800">Quiz History</h2>
                        <span className="text-xs text-gray-400 font-medium">
                            ({entries.length} session{entries.length !== 1 ? 's' : ''})
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close quiz history"
                        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* ── Controls: search + sort ── */}
                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0 flex-wrap">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[180px]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search by title..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                    </div>

                    {/* Sort buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-gray-400 font-medium">Sort:</span>
                        {(['date', 'score', 'page'] as const).map(field => (
                            <button
                                key={field}
                                onClick={() => handleSortClick(field)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                    sortBy === field
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {field === 'date' ? 'Date' : field === 'score' ? 'Score' : 'Page'}
                                {sortBy === field && (sortAsc ? ' ↑' : ' ↓')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Entry list ── */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {sorted.length === 0 ? (
                        <div className="text-center py-16">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 text-gray-200 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <p className="text-gray-400 text-sm font-medium">
                                {search.trim()
                                    ? 'No quizzes match your search.'
                                    : 'No quiz history yet. Complete a revision quiz to see it here.'}
                            </p>
                        </div>
                    ) : (
                        sorted.map(entry => {
                            const pct = entry.totalQuestions > 0
                                ? Math.round((entry.score / entry.totalQuestions) * 100)
                                : 0
                            return (
                                <div
                                    key={entry.id}
                                    className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors group"
                                >
                                    {/* Left: meta */}
                                    <div className="flex-1 min-w-0">
                                        {/* Title row */}
                                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                            <span className="font-semibold text-gray-800 text-sm leading-tight">
                                                {entry.title}
                                            </span>
                                            {entry.isRetake && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold shrink-0">
                                                    Re-take
                                                </span>
                                            )}
                                        </div>

                                        {/* Meta row */}
                                        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 mb-2">
                                            {entry.sourceType === 'page' && entry.pageIndex != null ? (
                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">
                                                    Page {entry.pageIndex}
                                                </span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
                                                    Struggling Topics
                                                </span>
                                            )}
                                            <span>{formatDate(entry.dateCompleted)} at {formatTime(entry.dateCompleted)}</span>
                                            <span>{entry.totalQuestions} question{entry.totalQuestions !== 1 ? 's' : ''}</span>
                                        </div>

                                        {/* Score bar */}
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${scoreBarClass(entry)}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-semibold shrink-0 tabular-nums ${scoreColorClass(entry)}`}>
                                                {entry.score}/{entry.totalQuestions} ({pct}%)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right: retake button */}
                                    <button
                                        onClick={() => onRetake(entry)}
                                        className="shrink-0 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all"
                                    >
                                        Retake
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
