import { memo, useMemo } from 'react'
import { useNodes } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { useCanvasStore } from '../../store/canvasStore'
import type { DrawingStroke } from '../../types'

// Must match the dimensions used by ReactFlow's MiniMap default (and our CSS positioning)
const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 150
const MINIMAP_BOTTOM = 8
const MINIMAP_RIGHT = 8

interface Bounds {
    x: number
    y: number
    w: number
    h: number
}

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
    if (!a) return b
    if (!b) return a
    const minX = Math.min(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxX = Math.max(a.x + a.w, b.x + b.w)
    const maxY = Math.max(a.y + a.h, b.y + b.h)
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function computeNodeBounds(nodes: Node[]): Bounds | null {
    if (nodes.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
        const x = node.position.x
        const y = node.position.y
        const w = node.measured?.width ?? 200
        const h = node.measured?.height ?? 100
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x + w > maxX) maxX = x + w
        if (y + h > maxY) maxY = y + h
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function computeStrokeBounds(strokes: DrawingStroke[], nodes: Node[]): Bounds | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasPoints = false
    for (const stroke of strokes) {
        let ox = 0, oy = 0
        if (stroke.nodeId) {
            const n = nodes.find(nd => nd.id === stroke.nodeId)
            if (n) { ox = n.position.x; oy = n.position.y }
        }
        for (const pt of stroke.points) {
            const gx = pt.x + ox
            const gy = pt.y + oy
            if (gx < minX) minX = gx
            if (gy < minY) minY = gy
            if (gx > maxX) maxX = gx
            if (gy > maxY) maxY = gy
            hasPoints = true
        }
    }
    if (!hasPoints) return null
    return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) }
}

function strokeToSvgPath(stroke: DrawingStroke, ox: number, oy: number): string {
    const pts = stroke.points
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x + ox} ${pts[0].y + oy}`
    for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x + ox} ${pts[i].y + oy}`
    }
    return d
}

function MinimapStrokeOverlay() {
    const nodes = useNodes()
    const drawingStrokes = useCanvasStore(s => s.drawingStrokes)
    const currentPage = useCanvasStore(s => s.currentPage)

    const pageStrokes = useMemo(
        () => drawingStrokes.filter(s => s.pageIndex === currentPage),
        [drawingStrokes, currentPage]
    )

    const result = useMemo(() => {
        if (pageStrokes.length === 0) return null

        // Compute bounds matching what MiniMap uses internally
        const nodeBounds = computeNodeBounds(nodes)
        const strokeBounds = computeStrokeBounds(pageStrokes, nodes)
        const combined = unionBounds(nodeBounds, strokeBounds)
        if (!combined) return null

        // Add padding (~7% of the larger dimension, minimum 50 units)
        const padding = Math.max(Math.max(combined.w, combined.h) * 0.07, 50)
        const viewBox = `${combined.x - padding} ${combined.y - padding} ${combined.w + padding * 2} ${combined.h + padding * 2}`

        // Build SVG path data for each stroke
        const paths = pageStrokes.flatMap(stroke => {
            let ox = 0, oy = 0
            if (stroke.nodeId) {
                const n = nodes.find(nd => nd.id === stroke.nodeId)
                if (n) { ox = n.position.x; oy = n.position.y }
            }
            const d = strokeToSvgPath(stroke, ox, oy)
            if (!d) return []
            return [{ id: stroke.id, d, color: stroke.color, width: stroke.width, opacity: stroke.opacity }]
        })

        if (paths.length === 0) return null
        return { viewBox, paths }
    }, [nodes, pageStrokes])

    if (!result) return null

    return (
        <svg
            style={{
                position: 'fixed',
                bottom: MINIMAP_BOTTOM,
                right: MINIMAP_RIGHT,
                width: MINIMAP_WIDTH,
                height: MINIMAP_HEIGHT,
                pointerEvents: 'none',
                zIndex: 31, // just above minimap (z-index: 30)
                overflow: 'hidden',
                borderRadius: 12,
            }}
            viewBox={result.viewBox}
            preserveAspectRatio="xMidYMid meet"
        >
            {result.paths.map(p => (
                <path
                    key={p.id}
                    d={p.d}
                    stroke={p.color}
                    strokeWidth={p.width}
                    opacity={p.opacity}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
        </svg>
    )
}

export default memo(MinimapStrokeOverlay)
