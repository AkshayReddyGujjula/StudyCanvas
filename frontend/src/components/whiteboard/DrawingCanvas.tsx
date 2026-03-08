import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../../store/canvasStore'
import type { DrawingStroke, StrokePoint } from '../../types'

/**
 * DrawingCanvas — HTML5 Canvas overlay that renders pen / highlighter strokes
 * and handles drawing / erasing / lasso-select input.  Sits below ReactFlow nodes
 * (z-index 1) so strokes appear behind cards but above the dot-grid background.
 *
 * Strokes can optionally be "attached" to a React Flow node. Attached strokes
 * store points relative to the node's top-left corner in flow coordinates.
 * When the node moves, the strokes move with it automatically because the
 * node's current position is added as an offset during rendering.
 */

// ── Point-in-polygon (ray casting) ──────────────────────────────────────────
function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false
    const n = polygon.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y
        const xj = polygon[j].x, yj = polygon[j].y
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside
        }
    }
    return inside
}

type LassoPhase = 'idle' | 'drawing' | 'selected' | 'dragging'

export default function DrawingCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const tempCanvasRef = useRef<HTMLCanvasElement>(null) // for live drawing + lasso overlay
    const isDrawingRef = useRef(false)
    const currentStrokeRef = useRef<StrokePoint[]>([])
    const rafRef = useRef<number>(0)
    const lastEraserPosRef = useRef<{ x: number; y: number } | null>(null)

    // ── Lasso select state ────────────────────────────────────────────────────
    const lassoPhaseRef = useRef<LassoPhase>('idle')
    const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([])
    const selectedIdsRef = useRef<Set<string>>(new Set())
    const dragStartFlowRef = useRef<{ x: number; y: number } | null>(null)
    const dragDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
    const selectionBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
    // Track cursor style reactively for lasso tool
    const [lassoCursor, setLassoCursor] = useState<string>('crosshair')

    const { getViewport, screenToFlowPosition } = useReactFlow()

    const activeTool = useCanvasStore((s) => s.activeTool)
    const toolSettings = useCanvasStore((s) => s.toolSettings)
    const drawingStrokes = useCanvasStore((s) => s.drawingStrokes)
    const currentPage = useCanvasStore((s) => s.currentPage)
    const addStroke = useCanvasStore((s) => s.addStroke)
    const removeStrokes = useCanvasStore((s) => s.removeStrokes)
    const areaEraseAt = useCanvasStore((s) => s.areaEraseAt)
    const moveStrokes = useCanvasStore((s) => s.moveStrokes)

    const isDrawingTool = activeTool === 'pen1' || activeTool === 'pen2' || activeTool === 'highlighter'
    const isEraserTool = activeTool === 'eraser'
    const isLassoTool = activeTool === 'lasso'

    // Filter strokes for current page
    const pageStrokes = useMemo(
        () => drawingStrokes.filter((s) => s.pageIndex === currentPage),
        [drawingStrokes, currentPage]
    )

    // ── Helper: get the current transform for a node-attached stroke ───────
    const getStrokeTransform = useCallback((stroke: DrawingStroke): { ox: number; oy: number } => {
        if (!stroke.nodeId) return { ox: 0, oy: 0 }
        const nodes = useCanvasStore.getState().nodes
        const node = nodes.find((n) => n.id === stroke.nodeId)
        if (node) {
            return { ox: node.position.x, oy: node.position.y }
        }
        return { ox: stroke.nodeOffset?.x ?? 0, oy: stroke.nodeOffset?.y ?? 0 }
    }, [])

    // ── Draw a single stroke onto a canvas context ──────────────────────────
    const drawStroke = useCallback((
        ctx: CanvasRenderingContext2D,
        stroke: DrawingStroke,
        vp: { x: number; y: number; zoom: number },
        transform: { ox: number; oy: number } = { ox: 0, oy: 0 },
    ) => {
        if (stroke.points.length < 2) return
        const { ox, oy } = transform

        const txX = (px: number) => (px + ox) * vp.zoom + vp.x
        const txY = (py: number) => (py + oy) * vp.zoom + vp.y

        ctx.save()
        ctx.globalAlpha = stroke.opacity
        if (stroke.tool === 'highlighter') {
            ctx.globalCompositeOperation = 'multiply'
        }
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width * vp.zoom
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.beginPath()
        const p0 = stroke.points[0]
        ctx.moveTo(txX(p0.x), txY(p0.y))

        if (stroke.points.length === 2) {
            const p1 = stroke.points[1]
            ctx.lineTo(txX(p1.x), txY(p1.y))
        } else {
            for (let i = 1; i < stroke.points.length - 1; i++) {
                const p1 = stroke.points[i]
                const p2 = stroke.points[i + 1]
                ctx.quadraticCurveTo(
                    txX(p1.x), txY(p1.y),
                    txX((p1.x + p2.x) / 2), txY((p1.y + p2.y) / 2)
                )
            }
            const last = stroke.points[stroke.points.length - 1]
            ctx.lineTo(txX(last.x), txY(last.y))
        }
        ctx.stroke()
        ctx.restore()
    }, [])

    // ── Full redraw of all page strokes ──────────────────────────────────────
    // Supports drag-offset for selected strokes during lasso dragging.
    const redrawAll = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const vp = getViewport()
        const isDragging = lassoPhaseRef.current === 'dragging'
        const { dx, dy } = dragDeltaRef.current

        for (const stroke of pageStrokes) {
            const transform = getStrokeTransform(stroke)
            if (isDragging && selectedIdsRef.current.has(stroke.id)) {
                // Draw at drag-offset position (global coords + delta)
                drawStroke(ctx, stroke, vp, { ox: transform.ox + dx, oy: transform.oy + dy })
            } else {
                drawStroke(ctx, stroke, vp, transform)
            }
        }
    }, [pageStrokes, getViewport, drawStroke, getStrokeTransform])

    // ── Resize canvases to match container ──────────────────────────────────
    useEffect(() => {
        const resize = () => {
            const canvas = canvasRef.current
            const temp = tempCanvasRef.current
            if (!canvas || !temp) return

            const parent = canvas.parentElement
            if (!parent) return

            const dpr = window.devicePixelRatio || 1
            const w = parent.clientWidth
            const h = parent.clientHeight

            canvas.width = w * dpr
            canvas.height = h * dpr
            canvas.style.width = `${w}px`
            canvas.style.height = `${h}px`
            canvas.getContext('2d')?.scale(dpr, dpr)

            temp.width = w * dpr
            temp.height = h * dpr
            temp.style.width = `${w}px`
            temp.style.height = `${h}px`
            temp.getContext('2d')?.scale(dpr, dpr)

            redrawAll()
        }

        resize()
        const observer = new ResizeObserver(resize)
        const parent = canvasRef.current?.parentElement
        if (parent) observer.observe(parent)
        window.addEventListener('resize', resize)

        return () => {
            observer.disconnect()
            window.removeEventListener('resize', resize)
        }
    }, [redrawAll])

    // ── Redraw when strokes or viewport change ──────────────────────────────
    useEffect(() => {
        redrawAll()
    }, [redrawAll])

    // ── Lasso overlay drawing helpers ────────────────────────────────────────
    const drawLassoOverlay = useCallback(() => {
        const temp = tempCanvasRef.current
        if (!temp) return
        const ctx = temp.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, temp.width, temp.height)

        const points = lassoPointsRef.current
        if (points.length < 2) return

        const vp = getViewport()
        const toSx = (fx: number) => fx * vp.zoom + vp.x
        const toSy = (fy: number) => fy * vp.zoom + vp.y

        ctx.save()
        ctx.strokeStyle = '#3B82F6'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 3])
        ctx.fillStyle = 'rgba(59, 130, 246, 0.06)'
        ctx.beginPath()
        ctx.moveTo(toSx(points[0].x), toSy(points[0].y))
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(toSx(points[i].x), toSy(points[i].y))
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
    }, [getViewport])

    const drawSelectionOverlay = useCallback(() => {
        const temp = tempCanvasRef.current
        if (!temp || !selectionBoundsRef.current) return
        const ctx = temp.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, temp.width, temp.height)

        const vp = getViewport()
        const { minX, minY, maxX, maxY } = selectionBoundsRef.current
        const { dx, dy } = dragDeltaRef.current

        const sx = (minX + dx) * vp.zoom + vp.x
        const sy = (minY + dy) * vp.zoom + vp.y
        const sw = (maxX - minX) * vp.zoom
        const sh = (maxY - minY) * vp.zoom

        ctx.save()
        ctx.fillStyle = 'rgba(59, 130, 246, 0.06)'
        ctx.fillRect(sx, sy, sw, sh)
        ctx.strokeStyle = '#3B82F6'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 3])
        ctx.strokeRect(sx, sy, sw, sh)
        // Corner handles
        const hs = 6
        ctx.fillStyle = '#3B82F6'
        ctx.setLineDash([])
        for (const [cx, cy] of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]] as [number, number][]) {
            ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
        }
        ctx.restore()
    }, [getViewport])

    // ── Draw the current in-progress stroke on the temp canvas ──────────────
    const drawTempStroke = useCallback(() => {
        const temp = tempCanvasRef.current
        if (!temp) return
        const ctx = temp.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, temp.width, temp.height)

        const points = currentStrokeRef.current
        if (points.length < 2) return

        const vp = getViewport()
        const tool = activeTool as 'pen1' | 'pen2' | 'highlighter'
        const settings = tool === 'highlighter' ? toolSettings.highlighter : toolSettings[tool]
        const opacity = tool === 'highlighter' ? toolSettings.highlighter.opacity : 1

        const tempStroke: DrawingStroke = {
            id: 'temp',
            points,
            color: settings.color,
            width: settings.width,
            opacity,
            tool,
            pageIndex: currentPage,
            timestamp: 0,
        }
        drawStroke(ctx, tempStroke, vp)
    }, [getViewport, activeTool, toolSettings, currentPage, drawStroke])

    // ── Lasso helpers (read from store directly to avoid stale closures) ─────
    const selectStrokesInLasso = useCallback((lassoPath: Array<{ x: number; y: number }>): DrawingStroke[] => {
        const { drawingStrokes: allStrokes, currentPage: page, nodes } = useCanvasStore.getState()
        return allStrokes.filter((stroke) => {
            if (stroke.pageIndex !== page) return false
            const node = stroke.nodeId ? nodes.find((n) => n.id === stroke.nodeId) : null
            const ox = node?.position.x ?? stroke.nodeOffset?.x ?? 0
            const oy = node?.position.y ?? stroke.nodeOffset?.y ?? 0
            return stroke.points.some((p) => pointInPolygon(p.x + ox, p.y + oy, lassoPath))
        })
    }, [])

    const computeSelectionBounds = useCallback(() => {
        const ids = selectedIdsRef.current
        if (ids.size === 0) { selectionBoundsRef.current = null; return }
        const { drawingStrokes: allStrokes, currentPage: page, nodes } = useCanvasStore.getState()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const stroke of allStrokes) {
            if (stroke.pageIndex !== page || !ids.has(stroke.id)) continue
            const node = stroke.nodeId ? nodes.find((n) => n.id === stroke.nodeId) : null
            const ox = node?.position.x ?? stroke.nodeOffset?.x ?? 0
            const oy = node?.position.y ?? stroke.nodeOffset?.y ?? 0
            for (const p of stroke.points) {
                minX = Math.min(minX, p.x + ox); minY = Math.min(minY, p.y + oy)
                maxX = Math.max(maxX, p.x + ox); maxY = Math.max(maxY, p.y + oy)
            }
        }
        const pad = 12
        selectionBoundsRef.current = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
    }, [])

    // ── Subscribe to viewport changes AND node position changes for live redraw
    useEffect(() => {
        let animFrame = 0
        const onViewportChange = () => {
            cancelAnimationFrame(animFrame)
            animFrame = requestAnimationFrame(() => {
                redrawAll()
                if (isDrawingRef.current && currentStrokeRef.current.length > 1) {
                    drawTempStroke()
                }
                // Redraw lasso/selection overlays on viewport change
                const phase = lassoPhaseRef.current
                if (phase === 'drawing') drawLassoOverlay()
                else if (phase === 'selected' || phase === 'dragging') drawSelectionOverlay()
            })
        }

        const attachedNodeIds = new Set<string>()
        for (const s of pageStrokes) {
            if (s.nodeId) attachedNodeIds.add(s.nodeId)
        }

        const getPositionKey = () => {
            if (attachedNodeIds.size === 0) return ''
            const nodes = useCanvasStore.getState().nodes
            const parts: string[] = []
            for (const id of attachedNodeIds) {
                const n = nodes.find((nd) => nd.id === id)
                if (n) parts.push(`${id}:${n.position.x},${n.position.y}`)
            }
            return parts.join('|')
        }

        let lastVp = getViewport()
        let lastNodePos = getPositionKey()
        let rafId = 0

        const pollTick = () => {
            const nowVp = getViewport()
            const vpChanged = nowVp.x !== lastVp.x || nowVp.y !== lastVp.y || nowVp.zoom !== lastVp.zoom
            const nowNodePos = attachedNodeIds.size > 0 ? getPositionKey() : ''
            const posChanged = nowNodePos !== lastNodePos

            if (vpChanged || posChanged) {
                lastVp = nowVp
                lastNodePos = nowNodePos
                onViewportChange()
            }

            rafId = requestAnimationFrame(pollTick)
        }

        rafId = requestAnimationFrame(pollTick)

        return () => {
            cancelAnimationFrame(animFrame)
            cancelAnimationFrame(rafId)
        }
    }, [getViewport, redrawAll, pageStrokes, drawLassoOverlay, drawSelectionOverlay, drawTempStroke])

    // ── Hit-test: check if a point (in flow coords) is near any stroke ──────
    const hitTestStrokes = useCallback((flowX: number, flowY: number, radius: number): DrawingStroke[] => {
        const hits: DrawingStroke[] = []
        const r2 = radius * radius

        for (const stroke of pageStrokes) {
            const { ox, oy } = getStrokeTransform(stroke)
            for (const p of stroke.points) {
                const gx = p.x + ox
                const gy = p.y + oy
                const dx = gx - flowX
                const dy = gy - flowY
                if (dx * dx + dy * dy <= r2) {
                    hits.push(stroke)
                    break
                }
            }
        }
        return hits
    }, [pageStrokes, getStrokeTransform])

    // ── Helper: find which node (if any) a flow-coordinate point is inside ──
    const findNodeAtPoint = useCallback((flowX: number, flowY: number): { id: string; x: number; y: number } | null => {
        const nodes = useCanvasStore.getState().nodes
        let bestNode: { id: string; x: number; y: number; area: number } | null = null

        for (const node of nodes) {
            if (node.type !== 'contentNode' && node.type !== 'answerNode') continue

            const nx = node.position.x
            const ny = node.position.y
            const nw = (node.measured?.width ?? (node.style as Record<string, number>)?.width) || 0
            const nh = (node.measured?.height ?? (node.style as Record<string, number>)?.height) || 0

            if (nw === 0 || nh === 0) continue
            if (flowX >= nx && flowX <= nx + nw && flowY >= ny && flowY <= ny + nh) {
                const area = nw * nh
                if (!bestNode || area < bestNode.area) {
                    bestNode = { id: node.id, x: nx, y: ny, area }
                }
            }
        }

        if (!bestNode) return null
        return { id: bestNode.id, x: bestNode.x, y: bestNode.y }
    }, [])

    // ── Clear lasso state and temp canvas ────────────────────────────────────
    // NOTE: does NOT call setState — safe to call from effects and event handlers alike.
    const clearLassoState = useCallback(() => {
        selectedIdsRef.current = new Set()
        selectionBoundsRef.current = null
        lassoPhaseRef.current = 'idle'
        lassoPointsRef.current = []
        dragDeltaRef.current = { dx: 0, dy: 0 }
        dragStartFlowRef.current = null
        const temp = tempCanvasRef.current
        const ctx = temp?.getContext('2d')
        if (ctx && temp) ctx.clearRect(0, 0, temp.width, temp.height)
        // Reset cursor imperatively so no setState is needed
        if (temp) temp.style.cursor = 'crosshair'
    }, [])

    // ── Clear lasso when switching away from lasso tool ───────────────────
    // Cursor resets automatically: effectiveCapture becomes false when isLassoTool is false,
    // so the canvas falls back to 'default'. On re-entering lasso, the first pointerDown
    // sets lassoCursor to 'crosshair' via its event handler.
    useEffect(() => {
        if (!isLassoTool) {
            clearLassoState()
        }
    }, [isLassoTool, clearLassoState])

    // ── Delete/Backspace/Escape handler for lasso selection ─────────────────
    useEffect(() => {
        if (!isLassoTool) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.size > 0) {
                e.preventDefault()
                removeStrokes([...selectedIdsRef.current])
                clearLassoState()
            } else if (e.key === 'Escape') {
                clearLassoState()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isLassoTool, removeStrokes, clearLassoState])

    // ── Pointer handlers ────────────────────────────────────────────────────
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!isDrawingTool && !isEraserTool && !isLassoTool) return
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()

        const temp = tempCanvasRef.current
        if (!temp) return

        temp.setPointerCapture(e.pointerId)
        isDrawingRef.current = true

        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })

        if (isDrawingTool) {
            currentStrokeRef.current = [{ x: flowPos.x, y: flowPos.y, pressure: e.pressure }]
        } else if (isEraserTool) {
            const eraserWidth = toolSettings.eraser.width
            if (toolSettings.eraser.mode === 'stroke') {
                const hits = hitTestStrokes(flowPos.x, flowPos.y, eraserWidth / 2)
                if (hits.length > 0) removeStrokes(hits.map((h) => h.id))
            } else {
                areaEraseAt(flowPos.x, flowPos.y, eraserWidth / 2, currentPage)
            }
            lastEraserPosRef.current = { x: flowPos.x, y: flowPos.y }
        } else if (isLassoTool) {
            const phase = lassoPhaseRef.current
            // If there's an existing selection and user clicks inside the bounding box → start drag
            if (phase === 'selected' && selectionBoundsRef.current) {
                const b = selectionBoundsRef.current
                if (flowPos.x >= b.minX && flowPos.x <= b.maxX && flowPos.y >= b.minY && flowPos.y <= b.maxY) {
                    lassoPhaseRef.current = 'dragging'
                    dragStartFlowRef.current = { x: flowPos.x, y: flowPos.y }
                    dragDeltaRef.current = { dx: 0, dy: 0 }
                    setLassoCursor('grabbing')
                    return
                }
            }
            // Otherwise start a new lasso
            lassoPhaseRef.current = 'drawing'
            lassoPointsRef.current = [{ x: flowPos.x, y: flowPos.y }]
            selectedIdsRef.current = new Set()
            selectionBoundsRef.current = null
            dragDeltaRef.current = { dx: 0, dy: 0 }
            setLassoCursor('crosshair')
            const ctx = temp.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, temp.width, temp.height)
        }
    }, [isDrawingTool, isEraserTool, isLassoTool, screenToFlowPosition, toolSettings, hitTestStrokes, removeStrokes, areaEraseAt, currentPage])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDrawingRef.current) return
        e.preventDefault()
        e.stopPropagation()

        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })

        if (isDrawingTool) {
            currentStrokeRef.current.push({ x: flowPos.x, y: flowPos.y, pressure: e.pressure })
            cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(drawTempStroke)
        } else if (isEraserTool) {
            const eraserWidth = toolSettings.eraser.width
            if (toolSettings.eraser.mode === 'stroke') {
                const hits = hitTestStrokes(flowPos.x, flowPos.y, eraserWidth / 2)
                if (hits.length > 0) removeStrokes(hits.map((h) => h.id))
            } else {
                areaEraseAt(flowPos.x, flowPos.y, eraserWidth / 2, currentPage)
            }
            lastEraserPosRef.current = { x: flowPos.x, y: flowPos.y }
        } else if (isLassoTool) {
            if (lassoPhaseRef.current === 'drawing') {
                lassoPointsRef.current.push({ x: flowPos.x, y: flowPos.y })
                cancelAnimationFrame(rafRef.current)
                rafRef.current = requestAnimationFrame(drawLassoOverlay)
            } else if (lassoPhaseRef.current === 'dragging' && dragStartFlowRef.current) {
                dragDeltaRef.current = {
                    dx: flowPos.x - dragStartFlowRef.current.x,
                    dy: flowPos.y - dragStartFlowRef.current.y,
                }
                cancelAnimationFrame(rafRef.current)
                rafRef.current = requestAnimationFrame(() => {
                    redrawAll()
                    drawSelectionOverlay()
                })
            }
        }
    }, [isDrawingTool, isEraserTool, isLassoTool, screenToFlowPosition, toolSettings, hitTestStrokes, removeStrokes, areaEraseAt, currentPage, drawTempStroke, drawLassoOverlay, drawSelectionOverlay, redrawAll])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDrawingRef.current) return
        e.preventDefault()

        const temp = tempCanvasRef.current
        if (temp) {
            try { temp.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
        }

        isDrawingRef.current = false
        lastEraserPosRef.current = null

        if (isDrawingTool && currentStrokeRef.current.length >= 2) {
            const tool = activeTool as 'pen1' | 'pen2' | 'highlighter'
            const settings = tool === 'highlighter' ? toolSettings.highlighter : toolSettings[tool]
            const opacity = tool === 'highlighter' ? toolSettings.highlighter.opacity : 1

            const firstPt = currentStrokeRef.current[0]
            const targetNode = findNodeAtPoint(firstPt.x, firstPt.y)

            let strokePoints = [...currentStrokeRef.current]
            let nodeId: string | undefined
            let nodeOffset: { x: number; y: number } | undefined

            if (targetNode) {
                nodeId = targetNode.id
                nodeOffset = { x: targetNode.x, y: targetNode.y }
                strokePoints = strokePoints.map((p) => ({
                    x: p.x - targetNode.x,
                    y: p.y - targetNode.y,
                    pressure: p.pressure,
                }))
            }

            const newStroke: DrawingStroke = {
                id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                points: strokePoints,
                color: settings.color,
                width: settings.width,
                opacity,
                tool,
                pageIndex: currentPage,
                timestamp: Date.now(),
                nodeId,
                nodeOffset,
            }
            addStroke(newStroke)
            useCanvasStore.getState().persistToLocalStorage()
        }

        if (isLassoTool) {
            if (lassoPhaseRef.current === 'drawing') {
                const path = [...lassoPointsRef.current]
                lassoPointsRef.current = []

                const selected = selectStrokesInLasso(path)
                selectedIdsRef.current = new Set(selected.map((s) => s.id))

                if (selected.length > 0) {
                    lassoPhaseRef.current = 'selected'
                    computeSelectionBounds()
                    drawSelectionOverlay()
                    setLassoCursor('move')
                } else {
                    lassoPhaseRef.current = 'idle'
                    const ctx = temp?.getContext('2d')
                    if (ctx && temp) ctx.clearRect(0, 0, temp.width, temp.height)
                    setLassoCursor('crosshair')
                }
            } else if (lassoPhaseRef.current === 'dragging') {
                const { dx, dy } = dragDeltaRef.current
                if (dx !== 0 || dy !== 0) {
                    moveStrokes([...selectedIdsRef.current], dx, dy)
                    // Update bounds by delta so overlay stays aligned
                    if (selectionBoundsRef.current) {
                        selectionBoundsRef.current = {
                            minX: selectionBoundsRef.current.minX + dx,
                            minY: selectionBoundsRef.current.minY + dy,
                            maxX: selectionBoundsRef.current.maxX + dx,
                            maxY: selectionBoundsRef.current.maxY + dy,
                        }
                    }
                    dragDeltaRef.current = { dx: 0, dy: 0 }
                    useCanvasStore.getState().persistToLocalStorage()
                }
                lassoPhaseRef.current = 'selected'
                setLassoCursor('move')
                drawSelectionOverlay()
            }
            return
        }

        currentStrokeRef.current = []
        if (temp) {
            const ctx = temp.getContext('2d')
            ctx?.clearRect(0, 0, temp.width, temp.height)
        }
    }, [isDrawingTool, isLassoTool, activeTool, toolSettings, currentPage, addStroke, findNodeAtPoint, selectStrokesInLasso, computeSelectionBounds, moveStrokes, drawSelectionOverlay])

    // ── Cursor rendering ────────────────────────────────────────────────────
    const cursorStyle = useMemo(() => {
        if (isLassoTool) return lassoCursor
        if (isEraserTool) {
            const size = Math.max(toolSettings.eraser.width, 8)
            const svg = [
                `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>`,
                `<circle cx='${size / 2}' cy='${size / 2}' r='${size / 2 - 1}' fill='rgba(255,255,255,0.3)' stroke='%23555' stroke-width='1.5' stroke-dasharray='3,2'/>`,
                `</svg>`,
            ].join('')
            return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${size / 2} ${size / 2}, auto`
        }
        if (isDrawingTool) {
            const tool = activeTool as 'pen1' | 'pen2' | 'highlighter'
            const settings = tool === 'highlighter' ? toolSettings.highlighter : toolSettings[tool]
            const color = settings.color
            const dotSize = Math.max(6, Math.min(settings.width, 32))
            const r = dotSize / 2
            const hexColor = color.replace('#', '%23')
            const opacity = tool === 'highlighter' ? toolSettings.highlighter.opacity : 1
            const svg = [
                `<svg xmlns='http://www.w3.org/2000/svg' width='${dotSize}' height='${dotSize}' viewBox='0 0 ${dotSize} ${dotSize}'>`,
                `<circle cx='${r}' cy='${r}' r='${r - 0.5}' fill='${hexColor}' fill-opacity='${opacity}' stroke='%23ffffff' stroke-width='1'/>`,
                `</svg>`,
            ].join('')
            return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${r} ${r}, crosshair`
        }
        return 'default'
    }, [isEraserTool, isDrawingTool, isLassoTool, toolSettings, activeTool, lassoCursor])

    const [isHoveringControl, setIsHoveringControl] = useState(false)
    const shouldCapture = isDrawingTool || isEraserTool || isLassoTool

    // ── Dynamic Cursor / Hover Detection ────────────────────────────────────
    useEffect(() => {
        const temp = tempCanvasRef.current
        // When shouldCapture is false, effectiveCapture = false regardless of isHoveringControl,
        // so no setState needed — just bail out.
        if (!temp || !shouldCapture) return

        const handleMouseMove = (e: MouseEvent) => {
            if (isDrawingRef.current) return

            const wasNone = temp.style.pointerEvents === 'none'
            if (!wasNone) temp.style.pointerEvents = 'none'

            const elements = document.elementsFromPoint(e.clientX, e.clientY)

            const isControl = elements.some(el => {
                if (el === temp || el === canvasRef.current) return false
                return el.closest('button, input, textarea, select, [role="button"], .react-flow__controls, .react-flow__minimap, .slider, input[type="range"]') !== null
            })

            if (!wasNone) temp.style.pointerEvents = 'all'

            setIsHoveringControl(curr => {
                if (curr !== isControl) return isControl
                return curr
            })
        }

        window.addEventListener('mousemove', handleMouseMove, true)
        return () => window.removeEventListener('mousemove', handleMouseMove, true)
    }, [shouldCapture])

    const effectiveCapture = shouldCapture && !isHoveringControl

    return (
        <>
            {/* Main stroke canvas */}
            <canvas
                ref={canvasRef}
                className="drawing-canvas-main"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 1,
                    pointerEvents: 'none',
                }}
            />
            {/* Temp canvas for live drawing / lasso overlay + event capture layer */}
            <canvas
                ref={tempCanvasRef}
                className="drawing-canvas-temp"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: effectiveCapture ? 5 : 1,
                    pointerEvents: effectiveCapture ? 'all' : 'none',
                    cursor: effectiveCapture ? cursorStyle : 'default',
                    touchAction: 'none',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />
        </>
    )
}
