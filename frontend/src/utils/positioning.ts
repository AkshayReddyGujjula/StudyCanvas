import type { Node } from '@xyflow/react'

/**
 * Calculates the position and edge handle configuration for a new child node.
 * No external layout library — manual positioning per MVP section 4.8.
 */
export function getNewNodePosition(
    parentNodeId: string,
    allNodes: Node[],
    contentNodeId: string
): { x: number; y: number; sourceHandle: string; targetHandle: string } {
    const parent = allNodes.find((n) => n.id === parentNodeId)
    if (!parent) {
        return { x: 900, y: 100, sourceHandle: 'right', targetHandle: 'left' }
    }

    const parentX = parent.position.x
    const parentY = parent.position.y

    if (parentNodeId === contentNodeId) {
        // Spawning from the Content Node
        // Use a simpler approach: count existing nodes to the right of content node
        // that were spawned from contentNode
        const contentNode = allNodes.find((n) => n.id === contentNodeId)!
        const contentX = contentNode.position.x
        const contentY = contentNode.position.y

        // Find all answer nodes whose X is to the right of content node
        const rightSideNodes = allNodes.filter(
            (n) => n.id !== contentNodeId && n.position.x > contentX + 100
        )

        // Find all answer nodes to the left of content node
        const leftSideNodes = allNodes.filter(
            (n) => n.id !== contentNodeId && n.position.x < contentX - 100
        )

        if (rightSideNodes.length < 4) {
            // Place on the right side
            if (rightSideNodes.length === 0) {
                return {
                    x: contentX + 700 + 80,
                    y: contentY,
                    sourceHandle: 'right',
                    targetHandle: 'left',
                }
            }
            const sortedRight = [...rightSideNodes].sort((a, b) => a.position.y - b.position.y)
            const last = sortedRight[sortedRight.length - 1]
            const lastHeight = (last.measured?.height ?? 200)
            return {
                x: contentX + 700 + 80,
                y: last.position.y + lastHeight + 40,
                sourceHandle: 'right',
                targetHandle: 'left',
            }
        } else {
            // Place on the left side
            if (leftSideNodes.length === 0) {
                return {
                    x: contentX - 360 - 80,
                    y: contentY,
                    sourceHandle: 'left',
                    targetHandle: 'right',
                }
            }
            const sortedLeft = [...leftSideNodes].sort((a, b) => a.position.y - b.position.y)
            const last = sortedLeft[sortedLeft.length - 1]
            const lastHeight = (last.measured?.height ?? 200)
            return {
                x: contentX - 360 - 80,
                y: last.position.y + lastHeight + 40,
                sourceHandle: 'left',
                targetHandle: 'right',
            }
        }
    } else {
        // Spawning from an Answer Node
        const baseX = parentX + 360 + 80
        const baseY = parentY

        // Check for overlap with existing nodes
        let finalY = baseY
        let shifted = true
        while (shifted) {
            shifted = false
            for (const n of allNodes) {
                if (n.id === parentNodeId) continue
                const nHeight = n.measured?.height ?? 200
                const nWidth = typeof n.style?.width === 'number' ? n.style.width : 360
                const nX = n.position.x
                const nY = n.position.y

                // Check bounding box overlap
                const overlapX = baseX < nX + nWidth && baseX + 360 > nX
                const overlapY = finalY < nY + nHeight && finalY + 200 > nY

                if (overlapX && overlapY) {
                    finalY = nY + nHeight + 40
                    shifted = true
                    break
                }
            }
        }

        return { x: baseX, y: finalY, sourceHandle: 'right', targetHandle: 'left' }
    }
}

/**
 * Re-runs the Y-position calculation for sibling nodes after streaming completes.
 * Called after any node transitions isStreaming → false.
 * Updates sibling positions to use actual measured heights.
 */
export function recalculateSiblingPositions(
    nodes: Node[],
    _nodeId: string,
    side: 'left' | 'right',
    contentNodeId: string
): Node[] {
    const contentNode = nodes.find((n) => n.id === contentNodeId)
    if (!contentNode) return nodes

    const contentX = contentNode.position.x

    let siblings: Node[]
    if (side === 'right') {
        siblings = nodes
            .filter((n) => n.id !== contentNodeId && n.position.x > contentX + 100)
            .sort((a, b) => a.position.y - b.position.y)
    } else {
        siblings = nodes
            .filter((n) => n.id !== contentNodeId && n.position.x < contentX - 100)
            .sort((a, b) => a.position.y - b.position.y)
    }

    if (siblings.length === 0) return nodes

    const updatedNodes = [...nodes]
    let currentY = contentNode.position.y

    for (const sibling of siblings) {
        const idx = updatedNodes.findIndex((n) => n.id === sibling.id)
        if (idx !== -1) {
            updatedNodes[idx] = {
                ...updatedNodes[idx],
                position: { ...updatedNodes[idx].position, y: currentY },
            }
            currentY += (sibling.measured?.height ?? 200) + 40
        }
    }

    return updatedNodes
}
