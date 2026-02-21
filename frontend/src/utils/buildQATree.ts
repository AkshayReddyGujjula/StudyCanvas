import type { Node, Edge } from '@xyflow/react'
import type { AnswerNodeData, ChatMessage } from '../types'

export interface QANode {
    id: string
    question: string
    highlightedText: string
    answer: string
    chatHistory: ChatMessage[]
    status: string
    children: QANode[]
}

/**
 * Walks the React Flow nodes/edges and builds a tree of Q&A entries.
 *
 * - Root nodes = answerNodes whose direct parent is a contentNode (or orphaned)
 * - Child nodes = answerNodes whose direct parent is another answerNode (branch questions)
 * - chatHistory on each node = in-node follow-up turns (user/model pairs)
 */
export function buildQATree(nodes: Node[], edges: Edge[]): QANode[] {
    const answerNodes = nodes.filter((n) => n.type === 'answerNode')

    // Map each node id → its parent node id (source of an incoming edge)
    const parentMap = new Map<string, string>()
    for (const edge of edges) {
        parentMap.set(edge.target, edge.source)
    }

    const contentNodeIds = new Set(
        nodes.filter((n) => n.type === 'contentNode').map((n) => n.id)
    )
    const answerNodeIds = new Set(answerNodes.map((n) => n.id))

    // Root: parent is a contentNode or has no parent at all
    const rootAnswerNodes = answerNodes.filter((n) => {
        const parentId = parentMap.get(n.id)
        return !parentId || contentNodeIds.has(parentId)
    })

    // Build children map: parentAnswerNodeId → [childAnswerNodeIds]
    const childrenMap = new Map<string, string[]>()
    for (const n of answerNodes) {
        const parentId = parentMap.get(n.id)
        if (parentId && answerNodeIds.has(parentId)) {
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, [])
            childrenMap.get(parentId)!.push(n.id)
        }
    }

    const nodeMap = new Map(answerNodes.map((n) => [n.id, n]))

    function buildNode(nodeId: string): QANode {
        const node = nodeMap.get(nodeId)!
        const data = node.data as unknown as AnswerNodeData
        const childIds = childrenMap.get(nodeId) ?? []

        return {
            id: nodeId,
            question: data.question ?? '',
            highlightedText: data.highlighted_text ?? '',
            answer: data.answer ?? '',
            chatHistory: data.chatHistory ?? [],
            status: data.status ?? 'unread',
            children: childIds.map(buildNode),
        }
    }

    return rootAnswerNodes.map((n) => buildNode(n.id))
}
