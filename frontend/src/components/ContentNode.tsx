import { useMemo, useCallback } from 'react'
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
        return `<mark class="bg-yellow-200 cursor-pointer" data-highlight-id="${highlight.id}">${highlight.text}</mark>`
    })
}

type ContentNodeProps = NodeProps & { data: ContentNodeData }

export default function ContentNode({ id, data }: ContentNodeProps) {
    const { setCenter } = useReactFlow()
    const highlights = useCanvasStore((s) => s.highlights)
    const nodes = useCanvasStore((s) => s.nodes)

    const processedMarkdown = useMemo(() => {
        let content = data.markdown_content

        // Step 1: identify code block ranges to protect
        const codeBlockRanges = getCodeBlockRanges(content)

        // Step 2: sort highlights longest-first to avoid partial matches
        const sortedHighlights = [...highlights].sort((a, b) => b.text.length - a.text.length)

        // Step 3: replace only occurrences outside code block ranges
        for (const highlight of sortedHighlights) {
            const escaped = highlight.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(escaped, 'g')
            content = replaceOutsideCodeBlocks(content, regex, highlight, codeBlockRanges)
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
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l-3-3m0 0l3-3m-3 3h12M3 6v12" />
                </svg>
                <span className="text-white font-medium text-sm truncate">
                    {data.filename} — {data.page_count} page{data.page_count !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Scrollable Markdown content — nodrag and nopan prevent canvas interaction */}
            <div
                className="nodrag nopan overflow-y-auto"
                style={{ maxHeight: '80vh' }}
                onClick={handleMarkdownClick}
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

            {/* Connection handles — source and target on both sides */}
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                style={{ background: '#6366f1' }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="right-target"
                style={{ background: '#6366f1', top: '60%' }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left"
                style={{ background: '#6366f1' }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="left-target"
                style={{ background: '#6366f1', top: '60%' }}
            />
        </div>
    )
}
