import type { Node } from '@xyflow/react'
import type { ProgressCounts } from '../types'

/** Node types that carry a user-settable status (understood / struggling / unread) */
export const STATUS_NODE_TYPES = new Set([
    'answerNode',
    'flashcardNode',
    'quizQuestionNode',
    'customPromptNode',
    'summaryNode',
    'codeEditorNode',
])

/** Compute progress counts from a list of React Flow nodes */
export function computeProgressCounts(nodes: Node[]): ProgressCounts {
    const statusNodes = nodes.filter(n => STATUS_NODE_TYPES.has(n.type ?? ''))
    return {
        understood: statusNodes.filter(n => (n.data as Record<string, unknown>).status === 'understood').length,
        struggling: statusNodes.filter(n => (n.data as Record<string, unknown>).status === 'struggling').length,
        total: statusNodes.length,
    }
}
