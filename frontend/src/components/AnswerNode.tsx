import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize'
import type { AnswerNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'

const customSchema: SanitizeOptions = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
    attributes: {
        ...defaultSchema.attributes,
        mark: ['className', 'dataHighlightId'],
    },
}

const STATUS_BORDER_CLASSES: Record<string, string> = {
    loading: 'border-gray-400 animate-pulse',
    unread: 'border-blue-500',
    understood: 'border-green-500',
    struggling: 'border-red-500',
}

type AnswerNodeProps = NodeProps & { data: AnswerNodeData }

export default function AnswerNode({ id, data }: AnswerNodeProps) {
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const borderClass = STATUS_BORDER_CLASSES[data.status] || 'border-blue-500'

    const handleStatusClick = (clickedStatus: 'understood' | 'struggling') => {
        const newStatus = data.status === clickedStatus ? 'unread' : clickedStatus
        updateNodeData(id, { status: newStatus })
        persistToLocalStorage() // lifecycle event (c)
    }

    return (
        <div
            data-nodeid={id}
            className={`bg-white rounded-lg shadow-lg border-l-4 ${borderClass} border border-gray-200`}
            style={{ width: 360 }}
        >
            {/* Yellow quote block */}
            <div className="mx-3 mt-3 px-3 py-2 bg-yellow-50 border-l-4 border-yellow-400 rounded text-xs text-gray-600 italic line-clamp-3">
                &ldquo;{data.highlighted_text.slice(0, 200)}{data.highlighted_text.length > 200 ? '...' : ''}&rdquo;
            </div>

            {/* Bold question */}
            <div className="px-3 pt-2 pb-1">
                <p className="text-sm font-semibold text-gray-800">{data.question}</p>
            </div>

            {/* Response area — three phases */}
            <div className="px-3 pb-2 nodrag nopan">
                {data.isLoading && data.isStreaming && !data.answer ? (
                    /* Phase 1: Skeleton */
                    <div className="space-y-2 mt-1">
                        <div className="h-3 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-5/6" />
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-4/6" />
                    </div>
                ) : data.isStreaming ? (
                    /* Phase 2: Streaming pre */
                    <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-gray-700 mt-1 overflow-auto max-h-96">
                        {data.answer}
                    </pre>
                ) : (
                    /* Phase 3: Full Markdown */
                    <div className="prose prose-sm max-w-none mt-1">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema] as [typeof rehypeSanitize, SanitizeOptions]]}
                        >
                            {data.answer}
                        </ReactMarkdown>
                    </div>
                )}
            </div>

            {/* Status buttons — only visible when not streaming */}
            {!data.isStreaming && (
                <div className="px-3 pb-3 flex gap-2">
                    <button
                        onClick={() => handleStatusClick('understood')}
                        className={`flex-1 text-xs py-1.5 rounded border transition-colors ${data.status === 'understood'
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-green-400 hover:text-green-600'
                            }`}
                    >
                        ✓ Got it
                    </button>
                    <button
                        onClick={() => handleStatusClick('struggling')}
                        className={`flex-1 text-xs py-1.5 rounded border transition-colors ${data.status === 'struggling'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-red-400 hover:text-red-600'
                            }`}
                    >
                        ✗ Struggling
                    </button>
                </div>
            )}

            {/* Handles */}
            <Handle type="source" position={Position.Right} id="right" style={{ background: '#6366f1' }} />
            <Handle type="target" position={Position.Left} id="left" style={{ background: '#6366f1' }} />
            <Handle type="source" position={Position.Top} id="top" style={{ background: '#6366f1' }} />
            <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#6366f1' }} />
            <Handle type="target" position={Position.Right} id="right-target" style={{ background: '#6366f1', top: '60%' }} />
        </div>
    )
}
