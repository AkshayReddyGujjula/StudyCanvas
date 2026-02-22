import type { Node, Edge } from '@xyflow/react'

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
                y: last.position.y + lastHeight + 1,
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
                y: last.position.y + lastHeight + 1,
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
                    finalY = nY + nHeight + 1
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
            currentY += (sibling.measured?.height ?? 200) + 1
        }
    }

    return updatedNodes
}

/**
 * Resolves vertical overlaps between any AnswerNodes that overlap horizontally.
 * Pushes nodes down to maintain a minimum spacing of 40px.
 */
export function resolveOverlaps(nodes: Node[]): Node[] {
    const sortedOriginal = [...nodes].sort((a, b) => a.position.y - b.position.y)
    const updatedNodes = sortedOriginal.map(n => ({ ...n, position: { ...n.position } }))

    let shifted = false
    let iterations = 0
    let didAnyShift = false

    do {
        shifted = false
        iterations++
        updatedNodes.sort((a, b) => a.position.y - b.position.y)

        for (let i = 0; i < updatedNodes.length; i++) {
            const above = updatedNodes[i]
            if (above.type === 'contentNode') continue

            const aLeft = above.position.x
            const aWidth = typeof above.style?.width === 'number' ? above.style.width : (above.measured?.width ?? 360)
            const aRight = aLeft + (aWidth as number)
            const aBottom = above.position.y + (above.measured?.height ?? 200)

            for (let j = i + 1; j < updatedNodes.length; j++) {
                const below = updatedNodes[j]
                if (below.type === 'contentNode') continue

                const bLeft = below.position.x
                const bWidth = typeof below.style?.width === 'number' ? below.style.width : (below.measured?.width ?? 360)
                const bRight = bLeft + (bWidth as number)
                const bTop = below.position.y

                const overlapX = aLeft < bRight && aRight > bLeft

                if (overlapX && bTop < aBottom + 1) {
                    below.position.y = aBottom + 1
                    shifted = true
                    didAnyShift = true
                }
            }
        }
    } while (shifted && iterations < 100)

    if (!didAnyShift) return nodes

    return nodes.map(n => {
        const updated = updatedNodes.find(u => u.id === n.id)
        if (updated && updated.position.y !== n.position.y) {
            return { ...n, position: { ...updated.position } }
        }
        return n
    })
}

/**
 * Re-routes all edges connected to a dragged node so the arrow takes the
 * shortest path between source and target based on their current positions.
 *
 * ContentNode has 10 handles per side (right-0..right-9 / left-0..left-9).
 * AnswerNode has single handles: right, left, top, bottom.
 */
export function rerouteEdgeHandles(
    draggedNodeId: string,
    nodes: Node[],
    edges: Edge[],
): Edge[] {
    return edges.map((edge) => {
        const isSource = edge.source === draggedNodeId
        const isTarget = edge.target === draggedNodeId
        if (!isSource && !isTarget) return edge

        const sourceNode = nodes.find((n) => n.id === edge.source)
        const targetNode = nodes.find((n) => n.id === edge.target)
        if (!sourceNode || !targetNode) return edge

        const sourceWidth =
            typeof sourceNode.style?.width === 'number' ? sourceNode.style.width : 700
        const targetWidth =
            typeof targetNode.style?.width === 'number' ? targetNode.style.width : 360

        const sourceCenterX = sourceNode.position.x + (sourceWidth as number) / 2
        const targetCenterX = targetNode.position.x + (targetWidth as number) / 2

        const targetIsRight = targetCenterX >= sourceCenterX

        let sourceHandle: string
        let targetHandle: string

        if (sourceNode.type === 'contentNode') {
            // ContentNode: pick the vertical bucket closest to the target node's centre Y
            const sourceHeight = sourceNode.measured?.height ?? 400
            const targetCenterY =
                targetNode.position.y + (targetNode.measured?.height ?? 200) / 2
            const relY = (targetCenterY - sourceNode.position.y) / sourceHeight
            const bucketIdx = Math.min(Math.max(Math.round(relY * 9), 0), 9)

            if (targetIsRight) {
                sourceHandle = `right-${bucketIdx}`
                targetHandle = 'left'
            } else {
                sourceHandle = `left-${bucketIdx}`
                targetHandle = 'right'
            }
        } else {
            // AnswerNode → AnswerNode
            if (targetIsRight) {
                sourceHandle = 'right'
                targetHandle = 'left'
            } else {
                sourceHandle = 'left'
                targetHandle = 'right'
            }
        }

        return {
            ...edge,
            sourceHandle,
            targetHandle,
            // Keep arrow style in sync with side
            style: { ...edge.style },
        }
    })
}

/**
 * Snaps a leaf answerNode (one with no children) to the nearest valid column
 * position next to the content node after a drag-stop event.
 *
 * Rules:
 * - Determines the target column (left or right of PDF) based on the dropped X.
 * - Snaps X to the canonical column X for that side.
 * - Finds the best Y slot in that column by Euclidean distance to neighbouring
 *   nodes, inserting the node above or below its nearest neighbour.
 *
 * Returns the updated nodes array with the snapped position applied.
 */
export function snapLeafNodeToColumn(
    draggedNodeId: string,
    nodes: Node[],
    contentNodeId: string,
): Node[] {
    const draggedNode = nodes.find((n) => n.id === draggedNodeId)
    const contentNode = nodes.find((n) => n.id === contentNodeId)
    if (!draggedNode || !contentNode) return nodes

    const contentX = contentNode.position.x
    const contentWidth = typeof contentNode.style?.width === 'number' ? contentNode.style.width : 700
    const GAP = 80
    const NODE_W = 360

    // Determine target side
    const contentCenterX = contentX + (contentWidth as number) / 2
    const isRight = draggedNode.position.x >= contentCenterX

    const columnX = isRight
        ? contentX + (contentWidth as number) + GAP   // right column
        : contentX - NODE_W - GAP                     // left column

    // All nodes in the target column, excluding the dragged node
    const columnNodes = nodes
        .filter(
            (n) =>
                n.id !== draggedNodeId &&
                n.id !== contentNodeId &&
                (isRight ? n.position.x >= contentCenterX : n.position.x < contentCenterX),
        )
        .sort((a, b) => a.position.y - b.position.y)

    let snappedY: number

    if (columnNodes.length === 0) {
        // Only node in column — align with the content node's top
        snappedY = contentNode.position.y
    } else {
        // Find the nearest node in the column by vertical distance
        const dragCenterY = draggedNode.position.y + (draggedNode.measured?.height ?? 200) / 2
        let nearestIdx = 0
        let nearestDist = Infinity
        for (let i = 0; i < columnNodes.length; i++) {
            const cn = columnNodes[i]
            const cnCenterY = cn.position.y + (cn.measured?.height ?? 200) / 2
            const dist = Math.abs(dragCenterY - cnCenterY)
            if (dist < nearestDist) {
                nearestDist = dist
                nearestIdx = i
            }
        }

        const nearest = columnNodes[nearestIdx]
        const nearestH = nearest.measured?.height ?? 200
        const nearestCenterY = nearest.position.y + nearestH / 2

        if (dragCenterY < nearestCenterY) {
            // Place above nearest
            const above = nearestIdx > 0 ? columnNodes[nearestIdx - 1] : null
            if (above) {
                const aboveBottom = above.position.y + (above.measured?.height ?? 200)
                snappedY = aboveBottom + GAP / 2
            } else {
                const draggedH = draggedNode.measured?.height ?? 200
                snappedY = nearest.position.y - draggedH - GAP / 2
            }
        } else {
            // Place below nearest
            snappedY = nearest.position.y + nearestH + GAP / 2
        }
    }

    return nodes.map((n) =>
        n.id === draggedNodeId
            ? { ...n, position: { x: columnX, y: snappedY } }
            : n,
    )
}

/**
 * Calculates x/y positions for a row of quiz question nodes placed below the ContentNode.
 * Nodes are centred horizontally on the ContentNode and spaced 380px apart.
 * Pushes the row down until it is clear of every existing node (no overlaps).
 */
export function getQuizNodePositions(
    contentNodeX: number,
    contentNodeY: number,
    contentNodeHeight: number,
    contentNodeWidth: number,
    count: number,
    existingNodes: Node[] = []
): Array<{ x: number; y: number }> {
    const nodeWidth = 360
    const horizontalGap = 380
    const verticalGap = 1
    const estimatedQuizHeight = 260  // conservative estimate for an unanswered quiz card
    const padding = 1                // minimum gap around each quiz node

    const totalWidth = count * nodeWidth + (count - 1) * (horizontalGap - nodeWidth)
    const startX = contentNodeX + contentNodeWidth / 2 - totalWidth / 2
    const endX = startX + totalWidth

    // Start directly below the content node
    let y = contentNodeY + contentNodeHeight + verticalGap

    // Iteratively push the row down until no existing node overlaps with any quiz slot
    let shifted = true
    while (shifted) {
        shifted = false
        for (const node of existingNodes) {
            if (node.type === 'contentNode') continue

            const nLeft = node.position.x
            const nWidth =
                typeof node.style?.width === 'number'
                    ? node.style.width
                    : (node.measured?.width ?? 360)
            const nRight = nLeft + (nWidth as number)
            const nTop = node.position.y
            const nBottom = nTop + (node.measured?.height ?? 200)

            // Does this node share horizontal space with any part of the quiz row?
            const overlapX = startX - padding < nRight && endX + padding > nLeft
            // Would the quiz row overlap vertically with this node?
            const overlapY = y < nBottom + padding && y + estimatedQuizHeight > nTop - padding

            if (overlapX && overlapY) {
                y = nBottom + 1
                shifted = true
                break
            }
        }
    }

    return Array.from({ length: count }, (_, i) => ({
        x: startX + i * horizontalGap,
        y,
    }))
}

/**
 * Checks if a proposed position for a node overlaps with any other nodes.
 * Used during drag to prevent overlapping.
 */
export function isOverlapping(
    nodeId: string,
    proposedPosition: { x: number, y: number },
    nodes: Node[]
): boolean {
    const targetNode = nodes.find(n => n.id === nodeId)
    if (!targetNode) return false

    const aLeft = proposedPosition.x
    const aWidth = typeof targetNode.style?.width === 'number'
        ? targetNode.style.width
        : (targetNode.measured?.width ?? 360)
    const aRight = aLeft + (aWidth as number)

    const aTop = proposedPosition.y
    const aHeight = targetNode.measured?.height ?? 200
    const aBottom = aTop + aHeight

    // Minimum spacing
    const padding = 1

    for (const other of nodes) {
        if (other.id === nodeId) continue

        const bLeft = other.position.x
        const bWidth = typeof other.style?.width === 'number'
            ? other.style.width
            : (other.measured?.width ?? 360)
        const bRight = bLeft + (bWidth as number)

        const bTop = other.position.y
        const bHeight = other.measured?.height ?? 200
        const bBottom = bTop + bHeight

        // Check intersection with padding
        const overlapX = aLeft < bRight + padding && aRight + padding > bLeft
        const overlapY = aTop < bBottom + padding && aBottom + padding > bTop

        if (overlapX && overlapY) {
            return true
        }
    }

    return false
}
