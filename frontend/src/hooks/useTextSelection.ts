import { useEffect } from 'react'

export interface SelectionResult {
    selectedText: string
    sourceNodeId: string
    rect: DOMRect
    mousePos: { x: number; y: number }
}

type SetterFn = (result: SelectionResult | null) => void

export function useTextSelection(onSelection: SetterFn) {
    useEffect(() => {
        const handleMouseUp = (event: MouseEvent) => {
            // Do not process or clear selection if clicking on the popup itself
            const target = event.target as Element | null
            if (target?.closest('[data-popup="ask-gemini"]') || target?.closest('[data-popup="question-modal"]')) {
                return
            }

            const selection = window.getSelection()
            const text = selection?.toString().trim() ?? ''
            console.log('[useTextSelection] Text length:', text.length, 'Text:', text.substring(0, 20))

            if (text.length < 3) {
                onSelection(null)
                return
            }

            const range = selection!.getRangeAt(0)
            let nodeEl: Element | null = null

            if (range.commonAncestorContainer) {
                const container = range.commonAncestorContainer
                const element = container.nodeType === Node.ELEMENT_NODE
                    ? (container as Element)
                    : container.parentElement
                nodeEl = element?.closest('[data-nodeid]') ?? null
            }

            console.log('[useTextSelection] Resolving nodeEl:', !!nodeEl)

            if (!nodeEl) {
                onSelection(null)
                return
            }

            const sourceNodeId = nodeEl.getAttribute('data-nodeid')
            console.log('[useTextSelection] sourceNodeId:', sourceNodeId)
            if (!sourceNodeId) {
                onSelection(null)
                return
            }

            const rect = range.getBoundingClientRect()
            console.log('[useTextSelection] selection rect:', rect)
            // Mouse release position is the most reliable anchor — it is always
            // in viewport coordinates and unaffected by ReactFlow transforms.
            const mousePos = { x: event.clientX, y: event.clientY }

            onSelection({ selectedText: text, sourceNodeId, rect, mousePos })
        }

        document.addEventListener('mouseup', handleMouseUp)
        return () => document.removeEventListener('mouseup', handleMouseUp)
    }, [onSelection])
}
