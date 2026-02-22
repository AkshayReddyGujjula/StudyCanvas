import { useMemo, useCallback, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { ContentNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'

// Custom schema: extends defaultSchema to allow <mark> elements with className and data-highlight-id
// rehype-sanitize must come AFTER rehype-raw in the plugin array (spec rule 5)
const customSchema: SanitizeOptions = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
    attributes: {
        ...defaultSchema.attributes,
        mark: ['className', 'dataHighlightId'],
    },
}

// Extend ContentNodeData with optional callback
interface ExtendedContentNodeData extends ContentNodeData {
    onTestMePage?: () => void
}

// Identify code block ranges to protect from highlight injection
function getCodeBlockRanges(content: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = []

    // Triple backtick fences
    const fenceRegex = /```[\s\S]*?```/g
    let match
    while ((match = fenceRegex.exec(content)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length })
    }

    // Single inline backticks (after triple backtick ranges are excluded)
    const inlineRegex = /`[^`\n]+`/g
    while ((match = inlineRegex.exec(content)) !== null) {
        const inFence = ranges.some((r) => match!.index >= r.start && match!.index < r.end)
        if (!inFence) {
            ranges.push({ start: match.index, end: match.index + match[0].length })
        }
    }

    return ranges
}

function replaceOutsideCodeBlocks(
    content: string,
    regex: RegExp,
    highlight: { id: string; text: string },
    ranges: Array<{ start: number; end: number }>
): string {
    return content.replace(regex, (match, offset) => {
        const inProtectedRange = ranges.some((r) => offset >= r.start && offset < r.end)
        if (inProtectedRange) return match
        // Use `match` (the actual text from the markdown source) so any soft
        // newlines inside the matched span are preserved in the output.
        return `<mark class="bg-yellow-200 cursor-pointer" data-highlight-id="${highlight.id}">${match}</mark>`
    })
}

type ContentNodeProps = NodeProps & { data: ExtendedContentNodeData }

export default function ContentNode({ id, data }: ContentNodeProps) {
    const { setCenter } = useReactFlow()
    const highlights = useCanvasStore((s) => s.highlights)
    const nodes = useCanvasStore((s) => s.nodes)
    // true = full-page (no scroll), false = compact scrollable view
    const [isExpanded, setIsExpanded] = useState(true)

    const processedMarkdown = useMemo(() => {
        let content = data.markdown_content

        // Sort highlights longest-first to avoid partial matches
        const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length)

        for (const highlight of sortedHighlights) {
            // Recompute protected ranges on every pass so already-injected <mark> tags
            // and code blocks cannot be corrupted by subsequent replacements.
            const codeBlockRanges = getCodeBlockRanges(content)
            const markTagRanges: Array<{ start: number; end: number }> = []
            const markTagRegex = /<mark[\s\S]*?<\/mark>/g
            let m: RegExpExecArray | null
            while ((m = markTagRegex.exec(content)) !== null) {
                markTagRanges.push({ start: m.index, end: m.index + m[0].length })
            }
            const protectedRanges = [...codeBlockRanges, ...markTagRanges]

            // Escape regex special chars, then replace spaces with a flexible
            // whitespace pattern so that a space in the selected text can match
            // a newline (soft wrap) in the raw markdown source.
            const escaped = highlight.text
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/ +/g, '[ \\t\\r\\n]+')
            const regex = new RegExp(escaped, 'g')
            content = replaceOutsideCodeBlocks(content, regex, highlight, protectedRanges)
        }

        return content
    }, [data.markdown_content, highlights])

    const handleMarkdownClick = useCallback(
        (event: React.MouseEvent) => {
            const target = event.target as Element
            const markEl = target.closest('mark')
            if (!markEl) return

            const highlightId = markEl.getAttribute('data-highlight-id')
            if (!highlightId) return

            const highlight = highlights.find((h) => h.id === highlightId)
            if (!highlight) return

            const targetNode = nodes.find((n) => n.id === highlight.nodeId)
            if (!targetNode) return

            setCenter(
                targetNode.position.x + 180,
                targetNode.position.y + 100,
                { duration: 600 }
            )
        },
        [highlights, nodes, setCenter]
    )

    return (
        <div
            data-nodeid={id}
            className="bg-white rounded-lg shadow-lg border border-gray-200"
            style={{ width: 700 }}
        >
            {/* Header bar — draggable, no nodrag class */}
            <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 rounded-t-lg cursor-grab">
                <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l-3-3m0 0l3-3m-3 3h12M3 6v12" />
                </svg>
                <span className="text-white font-medium text-sm truncate flex-1">
                    {data.filename} — {data.page_count} page{data.page_count !== 1 ? 's' : ''}
                </span>
                <button
                    title={isExpanded ? 'Compact view (scrollable)' : 'Full-page view'}
                    onClick={(e) => { e.stopPropagation(); setIsExpanded((v) => !v) }}
                    className="nodrag flex-shrink-0 p-1 rounded hover:bg-indigo-500 transition-colors text-white/80 hover:text-white"
                >
                    {isExpanded ? (
                        // Collapse / minimise icon
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    ) : (
                        // Expand icon
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Markdown content — full-page or compact scrollable depending on toggle */}
            <div
                className={`nodrag nopan${isExpanded ? '' : ' overflow-y-auto'}`}
                style={{ cursor: 'text', userSelect: 'text', ...(isExpanded ? {} : { maxHeight: '80vh' }) }}
                onClick={handleMarkdownClick}
                onWheelCapture={isExpanded ? undefined : (e) => e.stopPropagation()}
            >
                <div className="prose prose-base max-w-none p-4">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                    >
                        {processedMarkdown}
                    </ReactMarkdown>
                </div>
            </div>

            {/* "Test me on this page" pill button */}
            {data.onTestMePage && (
                <div className="nodrag px-4 py-2 border-t border-gray-100 flex justify-center bg-gray-50 rounded-b-lg">
                    <button
                        onClick={(e) => { e.stopPropagation(); data.onTestMePage!() }}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-xs font-semibold rounded-full shadow-sm transition-colors select-none"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Test me on this page
                    </button>
                </div>
            )}

            {/* 10 source handles per side, evenly spaced */}
            {Array.from({ length: 10 }, (_, i) => (
                <Handle
                    key={`right-${i}`}
                    type="source"
                    position={Position.Right}
                    id={`right-${i}`}
                    style={{
                        background: '#6366f1',
                        width: 8,
                        height: 8,
                        border: '2px solid white',
                        borderRadius: '50%',
                        top: `${(i + 0.5) * 10}%`,
                    }}
                />
            ))}
            {Array.from({ length: 10 }, (_, i) => (
                <Handle
                    key={`left-${i}`}
                    type="source"
                    position={Position.Left}
                    id={`left-${i}`}
                    style={{
                        background: '#6366f1',
                        width: 8,
                        height: 8,
                        border: '2px solid white',
                        borderRadius: '50%',
                        top: `${(i + 0.5) * 10}%`,
                    }}
                />
            ))}
        </div>
    )
}
