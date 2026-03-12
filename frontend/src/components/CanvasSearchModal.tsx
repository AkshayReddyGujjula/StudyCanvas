import { useState, useEffect, useRef, useCallback, memo } from 'react'
import type { Node } from '@xyflow/react'
import type {
    AnswerNodeData,
    QuizQuestionNodeData,
    FlashcardNodeData,
    CustomPromptNodeData,
    StickyNoteNodeData,
    SummaryNodeData,
    TranscriptionNodeData,
    CodeEditorNodeData,
    TextNodeData,
    ImageNodeData,
} from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
    kind: 'node' | 'pdf'
    /** 1-based page number */
    pageIndex: number
    /** HTML snippet with <mark> around the match */
    snippet: string
    /** node-only */
    nodeId?: string
    nodeType?: string
    fieldLabel?: string
    /** pdf-only: exact matched string (used for text layer highlighting) */
    matchText?: string
}

interface Props {
    nodes: Node[]
    pageMarkdowns: string[]
    currentPage: number
    onNavigateToNode: (nodeId: string, pageIndex: number) => void
    onNavigateToPdfText: (pageIndex: number, matchText: string) => void
    onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_RESULTS = 50
const CONTEXT_CHARS = 45

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Build an HTML snippet (safe) with the match wrapped in <mark>. */
function buildSnippet(text: string, matchStart: number, matchLength: number): string {
    const start = Math.max(0, matchStart - CONTEXT_CHARS)
    const end = Math.min(text.length, matchStart + matchLength + CONTEXT_CHARS)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < text.length ? '…' : ''
    const before = escapeHtml(text.slice(start, matchStart))
    const match = escapeHtml(text.slice(matchStart, matchStart + matchLength))
    const after = escapeHtml(text.slice(matchStart + matchLength, end))
    return `${prefix}${before}<mark class="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">${match}</mark>${after}${suffix}`
}

/** Strip markdown headings/bold/italic for cleaner snippet display. */
function stripMarkdown(s: string): string {
    return s
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
}

/** Human-readable label and Tailwind badge classes for each node type. */
function nodeTypeMeta(nodeType: string): { label: string; badgeCls: string } {
    switch (nodeType) {
        case 'answerNode':       return { label: 'Answer',       badgeCls: 'bg-blue-100 text-blue-700' }
        case 'quizQuestionNode': return { label: 'Quiz',         badgeCls: 'bg-yellow-100 text-yellow-700' }
        case 'flashcardNode':    return { label: 'Flashcard',    badgeCls: 'bg-purple-100 text-purple-700' }
        case 'customPromptNode': return { label: 'Prompt',       badgeCls: 'bg-indigo-100 text-indigo-700' }
        case 'stickyNoteNode':   return { label: 'Sticky Note',  badgeCls: 'bg-amber-100 text-amber-700' }
        case 'summaryNode':      return { label: 'Summary',      badgeCls: 'bg-teal-100 text-teal-700' }
        case 'transcriptionNode':return { label: 'Transcription',badgeCls: 'bg-cyan-100 text-cyan-700' }
        case 'codeEditorNode':   return { label: 'Code',         badgeCls: 'bg-slate-100 text-slate-700' }
        case 'textNode':         return { label: 'Text',         badgeCls: 'bg-gray-100 text-gray-600' }
        case 'imageNode':        return { label: 'Image',        badgeCls: 'bg-pink-100 text-pink-700' }
        default:                 return { label: nodeType,        badgeCls: 'bg-gray-100 text-gray-500' }
    }
}

// ─── Search engine ────────────────────────────────────────────────────────────

type FieldEntry = { text: string; label: string }

function getNodeFields(node: Node): FieldEntry[] {
    const d = node.data as Record<string, unknown>
    switch (node.type) {
        case 'answerNode': {
            const nd = d as unknown as AnswerNodeData
            const entries: FieldEntry[] = []
            if (nd.question)          entries.push({ text: nd.question,          label: 'Question' })
            if (nd.highlighted_text)  entries.push({ text: nd.highlighted_text,  label: 'Context' })
            if (nd.answer)            entries.push({ text: nd.answer,            label: 'Answer' })
            if (nd.chatHistory) {
                nd.chatHistory.forEach(m => {
                    if (m.content) entries.push({ text: m.content, label: 'Chat' })
                })
            }
            return entries
        }
        case 'quizQuestionNode': {
            const nd = d as unknown as QuizQuestionNodeData
            const entries: FieldEntry[] = []
            if (nd.question)    entries.push({ text: nd.question,    label: 'Question' })
            if (nd.userAnswer)  entries.push({ text: nd.userAnswer,  label: 'Answer' })
            if (nd.feedback)    entries.push({ text: nd.feedback,    label: 'Feedback' })
            if (nd.chatHistory) {
                nd.chatHistory.forEach(m => {
                    if (m.content) entries.push({ text: m.content, label: 'Chat' })
                })
            }
            return entries
        }
        case 'flashcardNode': {
            const nd = d as unknown as FlashcardNodeData
            const entries: FieldEntry[] = []
            if (nd.question) entries.push({ text: nd.question, label: 'Front' })
            if (nd.answer)   entries.push({ text: nd.answer,   label: 'Back' })
            return entries
        }
        case 'customPromptNode': {
            const nd = d as unknown as CustomPromptNodeData
            if (!nd.chatHistory) return []
            return nd.chatHistory
                .filter(m => m.content)
                .map(m => ({ text: m.content, label: m.role === 'user' ? 'You' : 'AI' }))
        }
        case 'stickyNoteNode': {
            const nd = d as unknown as StickyNoteNodeData
            return nd.content ? [{ text: nd.content, label: 'Note' }] : []
        }
        case 'summaryNode': {
            const nd = d as unknown as SummaryNodeData
            return nd.summary ? [{ text: nd.summary, label: 'Summary' }] : []
        }
        case 'transcriptionNode': {
            const nd = d as unknown as TranscriptionNodeData
            return nd.text ? [{ text: nd.text, label: 'Transcription' }] : []
        }
        case 'codeEditorNode': {
            const nd = d as unknown as CodeEditorNodeData
            const entries: FieldEntry[] = []
            if (nd.title) entries.push({ text: nd.title, label: 'Title' })
            if (nd.code)  entries.push({ text: nd.code,  label: 'Code' })
            return entries
        }
        case 'textNode': {
            const nd = d as unknown as TextNodeData
            return nd.text ? [{ text: nd.text, label: 'Text' }] : []
        }
        case 'imageNode': {
            const nd = d as unknown as ImageNodeData
            return nd.imageName ? [{ text: nd.imageName, label: 'Image' }] : []
        }
        default:
            return []
    }
}

function getNodePage(node: Node): number {
    const d = node.data as Record<string, unknown>
    return typeof d.pageIndex === 'number' ? d.pageIndex : 1
}

function buildSearchResults(
    query: string,
    nodes: Node[],
    pageMarkdowns: string[],
    currentPage: number
): SearchResult[] {
    const lower = query.toLowerCase().trim()
    if (lower.length < 2) return []

    const results: SearchResult[] = []

    // ── PDF text search ──────────────────────────────────────────────────────
    for (let i = 0; i < pageMarkdowns.length; i++) {
        if (results.length >= MAX_RESULTS) break
        const raw = pageMarkdowns[i]
        // Strip the leading "## Page N\n" header before searching
        const cleaned = stripMarkdown(raw.replace(/^##\s+Page\s+\d+\s*\n?/i, ''))
        const lowerCleaned = cleaned.toLowerCase()
        let idx = lowerCleaned.indexOf(lower)
        while (idx !== -1 && results.length < MAX_RESULTS) {
            const matchText = cleaned.slice(idx, idx + lower.length)
            results.push({
                kind: 'pdf',
                pageIndex: i + 1,
                snippet: buildSnippet(cleaned, idx, lower.length),
                matchText,
            })
            idx = lowerCleaned.indexOf(lower, idx + 1)
        }
    }

    // ── Node search ──────────────────────────────────────────────────────────
    for (const node of nodes) {
        if (node.type === 'contentNode') continue   // PDF node — covered above
        if (node.type === 'timerNode') continue     // no meaningful text
        if (node.type === 'calculatorNode') continue
        if (node.type === 'voiceNoteNode') continue
        if (results.length >= MAX_RESULTS) break

        const pageIndex = getNodePage(node)
        const fields = getNodeFields(node)
        for (const { text, label } of fields) {
            if (results.length >= MAX_RESULTS) break
            const lowerText = text.toLowerCase()
            let idx = lowerText.indexOf(lower)
            while (idx !== -1 && results.length < MAX_RESULTS) {
                results.push({
                    kind: 'node',
                    pageIndex,
                    snippet: buildSnippet(text, idx, lower.length),
                    nodeId: node.id,
                    nodeType: node.type,
                    fieldLabel: label,
                })
                idx = lowerText.indexOf(lower, idx + 1)
            }
        }
    }

    // Sort: current page first, then ascending page order
    results.sort((a, b) => {
        const aOnCurrent = a.pageIndex === currentPage ? 0 : 1
        const bOnCurrent = b.pageIndex === currentPage ? 0 : 1
        if (aOnCurrent !== bOnCurrent) return aOnCurrent - bOnCurrent
        return a.pageIndex - b.pageIndex
    })

    return results
}

// ─── Component ────────────────────────────────────────────────────────────────

function CanvasSearchModal({
    nodes,
    pageMarkdowns,
    currentPage,
    onNavigateToNode,
    onNavigateToPdfText,
    onClose,
}: Props) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Auto-focus on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Global Escape closes the modal (works even when input loses focus)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    // Debounced search
    useEffect(() => {
        const id = setTimeout(() => {
            setResults(buildSearchResults(query, nodes, pageMarkdowns, currentPage))
            setActiveIndex(0)
        }, 250)
        return () => clearTimeout(id)
    }, [query, nodes, pageMarkdowns, currentPage])

    // Scroll active item into view
    useEffect(() => {
        const item = listRef.current?.children[activeIndex] as HTMLElement | undefined
        item?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    const handleSelect = useCallback((result: SearchResult) => {
        if (result.kind === 'pdf') {
            onNavigateToPdfText(result.pageIndex, result.matchText ?? query)
        } else if (result.nodeId) {
            onNavigateToNode(result.nodeId, result.pageIndex)
        }
    }, [onNavigateToPdfText, onNavigateToNode, query])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(i => Math.min(i + 1, results.length - 1))
            return
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(i => Math.max(i - 1, 0))
            return
        }
        if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault()
            handleSelect(results[activeIndex])
        }
    }, [results, activeIndex, handleSelect, onClose])

    const isEmpty = query.trim().length >= 2 && results.length === 0

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[9998] bg-black/10"
                onMouseDown={onClose}
            />

            {/* Modal */}
            <div
                className="fixed top-[18%] left-1/2 -translate-x-1/2 z-[9999] w-[600px] max-w-[92vw] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                onMouseDown={e => e.stopPropagation()}
            >
                {/* Search input row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <svg
                        className="w-4 h-4 text-gray-400 flex-shrink-0"
                        fill="none" stroke="currentColor" strokeWidth={2}
                        viewBox="0 0 24 24"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search canvas — nodes, PDF, notes…"
                        className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
                            tabIndex={-1}
                        >
                            ✕
                        </button>
                    )}
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 text-[10px] text-gray-400 font-mono flex-shrink-0">
                        ESC
                    </kbd>
                </div>

                {/* Results list */}
                {query.trim().length >= 2 && (
                    <div
                        ref={listRef}
                        className="max-h-80 overflow-y-auto divide-y divide-gray-50"
                    >
                        {isEmpty ? (
                            <div className="px-4 py-6 text-sm text-gray-400 text-center">
                                No results found for &quot;{query}&quot;
                            </div>
                        ) : (
                            results.map((result, idx) => {
                                const isActive = idx === activeIndex
                                const isPdf = result.kind === 'pdf'
                                const meta = isPdf
                                    ? { label: 'PDF', badgeCls: 'bg-blue-100 text-blue-700' }
                                    : nodeTypeMeta(result.nodeType ?? '')

                                return (
                                    <button
                                        key={idx}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        onClick={() => handleSelect(result)}
                                        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                    >
                                        {/* Page badge */}
                                        <span className="flex-shrink-0 mt-0.5 text-[11px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 leading-tight whitespace-nowrap">
                                            Pg {result.pageIndex}
                                        </span>

                                        {/* Type badge */}
                                        <span className={`flex-shrink-0 mt-0.5 text-[11px] font-medium rounded px-1.5 py-0.5 leading-tight whitespace-nowrap ${meta.badgeCls}`}>
                                            {meta.label}
                                            {result.fieldLabel && (
                                                <span className="opacity-60 ml-1">· {result.fieldLabel}</span>
                                            )}
                                        </span>

                                        {/* Snippet */}
                                        <span
                                            className="flex-1 text-xs text-gray-600 line-clamp-2 leading-relaxed"
                                            // snippet is already HTML-escaped; only <mark> is injected
                                            // eslint-disable-next-line react/no-danger
                                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                                        />

                                        {/* Arrow indicator */}
                                        <svg
                                            className={`w-3.5 h-3.5 flex-shrink-0 mt-1 transition-opacity ${isActive ? 'opacity-100 text-blue-500' : 'opacity-0'}`}
                                            fill="none" stroke="currentColor" strokeWidth={2}
                                            viewBox="0 0 24 24"
                                        >
                                            <path d="M9 18l6-6-6-6" />
                                        </svg>
                                    </button>
                                )
                            })
                        )}

                        {results.length === MAX_RESULTS && (
                            <div className="px-4 py-2 text-[11px] text-gray-400 text-center bg-gray-50">
                                Showing first {MAX_RESULTS} results — refine your search for more
                            </div>
                        )}
                    </div>
                )}

                {/* Hint when query is empty */}
                {query.trim().length < 2 && (
                    <div className="px-4 py-3 text-xs text-gray-400">
                        Search across all nodes, PDF text, notes and code on this canvas
                    </div>
                )}
            </div>
        </>
    )
}

export default memo(CanvasSearchModal)
