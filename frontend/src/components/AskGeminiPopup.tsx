import { useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface AskGeminiPopupProps {
    /** Bounding rect of the text selection (viewport coords, captured at mouseup). */
    rect: DOMRect
    /** data-nodeid of the PDF panel — queried fresh at render time for accurate edges. */
    nodeId: string
    /** Mouse-release position — always reliable, used as vertical anchor fallback. */
    mousePos: { x: number; y: number }
    onAsk: () => void
}

export default function AskGeminiPopup({ rect, nodeId, mousePos, onAsk }: AskGeminiPopupProps) {
    // Start off-screen until we measure; prevents a single-frame flash in the wrong spot.
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({
        position: 'fixed', top: -999, left: -999, zIndex: 9999,
    })

    useLayoutEffect(() => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const BUTTON_HEIGHT = 38   // px
        const BUTTON_WIDTH  = 152  // px
        const GAP           = 12   // gap between anchor edge and button
        const EDGE_PADDING  = 8    // min clearance from viewport edges

        const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

        // ── Fresh panel-edge query ────────────────────────────────────────────────
        // Query right now (not at mouseup) so ReactFlow zoom/pan is already settled.
        const panelEl = document.querySelector(`[data-nodeid="${nodeId}"]`)
        const panelRect = panelEl?.getBoundingClientRect()
        // Clamp to viewport — handles nodes that extend off-screen when zoomed in.
        const pdfLeft  = panelRect ? clamp(panelRect.left,  0, vw) : 0
        const pdfRight = panelRect ? clamp(panelRect.right, 0, vw) : vw

        // ── Anchor point ─────────────────────────────────────────────────────────
        // Prefer the selection rect centre; fall back to the mouse-release position
        // when the rect is outside the viewport (can happen with ReactFlow stale values).
        const rectInView =
            rect.width > 0 && rect.height > 0 &&
            rect.top > -100 && rect.top < vh + 100

        const selCx = rectInView ? rect.left + rect.width  / 2 : mousePos.x
        const selCy = rectInView ? rect.top  + rect.height / 2 : mousePos.y
        const selTop    = rectInView ? rect.top    : mousePos.y - 10
        const selBottom = rectInView ? rect.bottom : mousePos.y + 10

        const vCenter = clamp(selCy - BUTTON_HEIGHT / 2, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
        const hCenter = clamp(selCx - BUTTON_WIDTH  / 2, EDGE_PADDING, vw - BUTTON_WIDTH  - EDGE_PADDING)

        // ── Preferred placement order ────────────────────────────────────────────
        // Always try RIGHT of PDF panel first → LEFT → ABOVE → BELOW.
        // This keeps the popup out of the reading area and avoids the false
        // "closest distance" tie that let ABOVE/BELOW win over the panel sides.

        // Default: float near the mouse (last resort)
        let finalTop  = clamp(mousePos.y + GAP, EDGE_PADDING, vh - BUTTON_HEIGHT - EDGE_PADDING)
        let finalLeft = clamp(mousePos.x - BUTTON_WIDTH / 2, EDGE_PADDING, vw - BUTTON_WIDTH - EDGE_PADDING)

        // 1. RIGHT of PDF panel  ← preferred
        if (vw - pdfRight - EDGE_PADDING >= BUTTON_WIDTH + GAP) {
            finalLeft = pdfRight + GAP
            finalTop  = vCenter
        }
        // 2. LEFT of PDF panel
        else if (pdfLeft - EDGE_PADDING >= BUTTON_WIDTH + GAP) {
            finalLeft = pdfLeft - GAP - BUTTON_WIDTH
            finalTop  = vCenter
        }
        // 3. ABOVE the selection
        else if (selTop - EDGE_PADDING >= BUTTON_HEIGHT + GAP) {
            finalTop  = selTop - GAP - BUTTON_HEIGHT
            finalLeft = hCenter
        }
        // 4. BELOW the selection
        else if (vh - selBottom - EDGE_PADDING >= BUTTON_HEIGHT + GAP) {
            finalTop  = selBottom + GAP
            finalLeft = hCenter
        }

        setPopupStyle({ position: 'fixed', top: finalTop, left: finalLeft, zIndex: 9999 })
    }, [rect, nodeId, mousePos])

    return createPortal(
        <div
            data-popup="ask-gemini"
            style={popupStyle}
        >
            <button
                data-popup="ask-gemini"
                onClick={onAsk}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-lg
                   opacity-0 animate-[fadeIn_100ms_ease-in_forwards] hover:bg-indigo-700 transition-colors"
                style={{ animation: 'fadeIn 100ms ease-in forwards' }}
            >
                <span data-popup="ask-gemini">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" data-popup="ask-gemini">
                        <path d="M12 3l1.88 5.788a1 1 0 0 0 .632.632L20.3 11.3a.5.5 0 0 1 0 .95l-5.788 1.88a1 1 0 0 0-.632.632L12 20.3a.5.5 0 0 1-.95 0l-1.88-5.788a1 1 0 0 0-.632-.632L3.7 12.25a.5.5 0 0 1 0-.95l5.788-1.88a1 1 0 0 0 .632-.632z" />
                    </svg>
                </span>
                <span data-popup="ask-gemini">Ask Gemini</span>
            </button>
        </div>,
        document.body
    )
}
