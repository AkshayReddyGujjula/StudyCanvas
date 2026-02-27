import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../../store/canvasStore'
import type { DrawingStroke, StrokePoint } from '../../types'

/**
 * DrawingCanvas — HTML5 Canvas overlay that renders pen / highlighter strokes
 * and handles drawing / erasing input.  Sits below ReactFlow nodes (z-index 1)
 * so strokes appear behind cards but above the dot-grid background.
 *
 * Strokes can optionally be "attached" to a React Flow node. Attached strokes
 * store points relative to the node's top-left corner in flow coordinates.
 * When the node moves, the strokes move with it automatically because the
 * node's current position is added as an offset during rendering.
 */
export default function DrawingCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const tempCanvasRef = useRef<HTMLCanvasElement>(null) // for live drawing
    const isDrawingRef = useRef(false)
    const currentStrokeRef = useRef<StrokePoint[]>([])
    const rafRef = useRef<number>(0)
    const lastEraserPosRef = useRef<{ x: number; y: number } | null>(null)

    const { getViewport, screenToFlowPosition } = useReactFlow()

    const activeTool = useCanvasStore((s) => s.activeTool)
    const toolSettings = useCanvasStore((s) => s.toolSettings)
    const drawingStrokes = useCanvasStore((s) => s.drawingStrokes)
    const currentPage = useCanvasStore((s) => s.currentPage)
    const addStroke = useCanvasStore((s) => s.addStroke)
    const removeStrokes = useCanvasStore((s) => s.removeStrokes)
    const areaEraseAt = useCanvasStore((s) => s.areaEraseAt)

    const isDrawingTool = activeTool === 'pen1' || activeTool === 'pen2' || activeTool === 'highlighter'
    const isEraserTool = activeTool === 'eraser'

    // Filter strokes for current page
    const pageStrokes = useMemo(
        () => drawingStrokes.filter((s) => s.pageIndex === currentPage),
        [drawingStrokes, currentPage]
    )

    // ── Helper: get the current offset for a node-attached stroke ────────────
    // Returns the node's current position, or the stored fallback if the node
    // was deleted, or {0,0} for global strokes.
    const getStrokeOffset = useCallback((stroke: DrawingStroke): { x: number; y: number } => {
        if (!stroke.nodeId) return { x: 0, y: 0 }
        const nodes = useCanvasStore.getState().nodes
        const node = nodes.find((n) => n.id === stroke.nodeId)
        if (node) return { x: node.position.x, y: node.position.y }
        // Fallback: node was deleted, use stored offset so stroke doesn't vanish
        return stroke.nodeOffset ?? { x: 0, y: 0 }
    }, [])

    // ── Draw a single stroke onto a canvas context ──────────────────────────
    // nodeOffset is added to each point — for global strokes it's {0,0};
    // for node-attached strokes it's the node's current position.
    const drawStroke = useCallback((
        ctx: CanvasRenderingContext2D,
        stroke: DrawingStroke,
        vp: { x: number; y: number; zoom: number },
        nodeOffset: { x: number; y: number } = { x: 0, y: 0 },
    ) => {
        if (stroke.points.length < 2) return
        const ox = nodeOffset.x
        const oy = nodeOffset.y
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
        const sx = (p0.x + ox) * vp.zoom + vp.x
        const sy = (p0.y + oy) * vp.zoom + vp.y
        ctx.moveTo(sx, sy)

        if (stroke.points.length === 2) {
            const p1 = stroke.points[1]
            ctx.lineTo((p1.x + ox) * vp.zoom + vp.x, (p1.y + oy) * vp.zoom + vp.y)
        } else {
            // Quadratic Bezier smoothing
            for (let i = 1; i < stroke.points.length - 1; i++) {
                const p1 = stroke.points[i]
                const p2 = stroke.points[i + 1]
                const mx = ((p1.x + ox + p2.x + ox) / 2) * vp.zoom + vp.x
                const my = ((p1.y + oy + p2.y + oy) / 2) * vp.zoom + vp.y
                ctx.quadraticCurveTo(
                    (p1.x + ox) * vp.zoom + vp.x,
                    (p1.y + oy) * vp.zoom + vp.y,
                    mx, my
                )
            }
            // Last point
            const last = stroke.points[stroke.points.length - 1]
            ctx.lineTo((last.x + ox) * vp.zoom + vp.x, (last.y + oy) * vp.zoom + vp.y)
        }
        ctx.stroke()
        ctx.restore()
    }, [])

    // ── Full redraw of all page strokes ──────────────────────────────────────
    const redrawAll = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const vp = getViewport()

        for (const stroke of pageStrokes) {
            const offset = getStrokeOffset(stroke)
            drawStroke(ctx, stroke, vp, offset)
        }
    }, [pageStrokes, getViewport, drawStroke, getStrokeOffset])

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

    // Subscribe to viewport changes AND node position changes for live redraw.
    // Node-attached strokes need redraw when the node they're attached to moves.
    useEffect(() => {
        let animFrame = 0
        const onViewportChange = () => {
            cancelAnimationFrame(animFrame)
            animFrame = requestAnimationFrame(() => {
                redrawAll()
                // Also redraw temp canvas if actively drawing
                if (isDrawingRef.current && currentStrokeRef.current.length > 1) {
                    drawTempStroke()
                }
            })
        }

        // Collect node IDs referenced by strokes on this page
        const attachedNodeIds = new Set<string>()
        for (const s of pageStrokes) {
            if (s.nodeId) attachedNodeIds.add(s.nodeId)
        }

        // Build a position fingerprint for attached nodes
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

        // Poll viewport changes AND node position changes
        let lastVp = JSON.stringify(getViewport())
        let lastNodePos = getPositionKey()
        const pollInterval = setInterval(() => {
            const nowVp = JSON.stringify(getViewport())
            const nowNodePos = getPositionKey()
            if (nowVp !== lastVp || nowNodePos !== lastNodePos) {
                lastVp = nowVp
                lastNodePos = nowNodePos
                onViewportChange()
            }
        }, 16) // ~60fps polling

        return () => {
            cancelAnimationFrame(animFrame)
            clearInterval(pollInterval)
        }
    }, [getViewport, redrawAll, pageStrokes])

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
        // Temp stroke is always drawn in global coords (attachment computed on pointerUp)
        drawStroke(ctx, tempStroke, vp)
    }, [getViewport, activeTool, toolSettings, currentPage, drawStroke])

    // ── Hit-test: check if a point (in flow coords) is near any stroke ──────
    // For node-attached strokes, the node offset is added to each point before
    // comparing so the hit-test works in global flow coordinates.
    const hitTestStrokes = useCallback((flowX: number, flowY: number, radius: number): DrawingStroke[] => {
        const hits: DrawingStroke[] = []
        const r2 = radius * radius

        for (const stroke of pageStrokes) {
            const offset = getStrokeOffset(stroke)
            for (const p of stroke.points) {
                const dx = (p.x + offset.x) - flowX
                const dy = (p.y + offset.y) - flowY
                if (dx * dx + dy * dy <= r2) {
                    hits.push(stroke)
                    break
                }
            }
        }
        return hits
    }, [pageStrokes, getStrokeOffset])

    // ── Helper: find which node (if any) a flow-coordinate point is inside ──
    const findNodeAtPoint = useCallback((flowX: number, flowY: number): { id: string; x: number; y: number } | null => {
        const nodes = useCanvasStore.getState().nodes
        let bestNode: { id: string; x: number; y: number; area: number } | null = null

        for (const node of nodes) {
            // Only attach to content nodes and answer nodes
            if (node.type !== 'contentNode' && node.type !== 'answerNode') continue

            const nx = node.position.x
            const ny = node.position.y
            const nw = (node.measured?.width ?? (node.style as Record<string, number>)?.width) || 0
            const nh = (node.measured?.height ?? (node.style as Record<string, number>)?.height) || 0

            if (nw === 0 || nh === 0) continue
            if (flowX >= nx && flowX <= nx + nw && flowY >= ny && flowY <= ny + nh) {
                const area = nw * nh
                // Prefer the smallest (topmost/innermost) node
                if (!bestNode || area < bestNode.area) {
                    bestNode = { id: node.id, x: nx, y: ny, area }
                }
            }
        }

        return bestNode ? { id: bestNode.id, x: bestNode.x, y: bestNode.y } : null
    }, [])

    // ── Pointer handlers ────────────────────────────────────────────────────
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!isDrawingTool && !isEraserTool) return
        if (e.button !== 0) return  // Only respond to left-click
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
            // Immediately erase on down
            const eraserWidth = toolSettings.eraser.width
            if (toolSettings.eraser.mode === 'stroke') {
                const hits = hitTestStrokes(flowPos.x, flowPos.y, eraserWidth / 2)
                if (hits.length > 0) {
                    removeStrokes(hits.map((h) => h.id))
                }
            } else {
                // Area erase — clip strokes, removing only the touched points
                areaEraseAt(flowPos.x, flowPos.y, eraserWidth / 2, currentPage)
            }
            lastEraserPosRef.current = { x: flowPos.x, y: flowPos.y }
        }
    }, [isDrawingTool, isEraserTool, screenToFlowPosition, toolSettings, hitTestStrokes, removeStrokes, areaEraseAt, currentPage])

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
                if (hits.length > 0) {
                    removeStrokes(hits.map((h) => h.id))
                }
            } else {
                // Area erase — clip strokes, removing only the touched points
                areaEraseAt(flowPos.x, flowPos.y, eraserWidth / 2, currentPage)
            }
            lastEraserPosRef.current = { x: flowPos.x, y: flowPos.y }
        }
    }, [isDrawingTool, isEraserTool, screenToFlowPosition, toolSettings, hitTestStrokes, removeStrokes, areaEraseAt, currentPage, drawTempStroke])

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

            // Auto-detect: if the first point is inside a node, attach the stroke
            const firstPt = currentStrokeRef.current[0]
            const targetNode = findNodeAtPoint(firstPt.x, firstPt.y)

            let strokePoints = [...currentStrokeRef.current]
            let nodeId: string | undefined
            let nodeOffset: { x: number; y: number } | undefined

            if (targetNode) {
                // Convert points from global flow coords to node-relative coords
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
            // Persist immediately so strokes survive
            useCanvasStore.getState().persistToLocalStorage()
        }

        currentStrokeRef.current = []

        // Clear temp canvas
        if (temp) {
            const ctx = temp.getContext('2d')
            ctx?.clearRect(0, 0, temp.width, temp.height)
        }
    }, [isDrawingTool, activeTool, toolSettings, currentPage, addStroke, findNodeAtPoint])

    // ── Cursor rendering ────────────────────────────────────────────────────
    const cursorStyle = useMemo(() => {
        if (isEraserTool) {
            // Eraser: circle outline showing the eraser radius
            const size = Math.max(toolSettings.eraser.width, 8)
            const svg = [
                `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>`,
                `<circle cx='${size/2}' cy='${size/2}' r='${size/2 - 1}' fill='rgba(255,255,255,0.3)' stroke='%23555' stroke-width='1.5' stroke-dasharray='3,2'/>`,
                `</svg>`,
            ].join('')
            return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${size/2} ${size/2}, auto`
        }
        if (isDrawingTool) {
            // Pen: pen-tip icon (24x24)
            const svg = [
                `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>`,
                `<g transform='rotate(-135, 12, 12)'>`,
                `<rect x='10' y='2' width='4' height='16' rx='1' fill='%23333' />`,
                `<polygon points='10,18 12,22 14,18' fill='%23333' />`,
                `<rect x='10' y='2' width='4' height='4' rx='1' fill='%23666' />`,
                `</g>`,
                `</svg>`,
            ].join('')
            return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 21, auto`
        }
        return 'default'
    }, [isEraserTool, isDrawingTool, toolSettings.eraser.width])

    const shouldCapture = isDrawingTool || isEraserTool

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
                    pointerEvents: 'none', // Main canvas never captures events
                }}
            />
            {/* Temp canvas for live drawing + event capture layer */}
            <canvas
                ref={tempCanvasRef}
                className="drawing-canvas-temp"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: shouldCapture ? 5 : 1,
                    pointerEvents: shouldCapture ? 'all' : 'none',
                    cursor: shouldCapture ? cursorStyle : 'default',
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
