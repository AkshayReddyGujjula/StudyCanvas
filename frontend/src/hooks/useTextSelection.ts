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
            const selection = window.getSelection()
            const text = selection?.toString().trim() ?? ''

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

            if (!nodeEl) {
                onSelection(null)
                return
            }

            const sourceNodeId = nodeEl.getAttribute('data-nodeid')
            if (!sourceNodeId) {
                onSelection(null)
                return
            }

            const rect = range.getBoundingClientRect()
            // Mouse release position is the most reliable anchor — it is always
            // in viewport coordinates and unaffected by ReactFlow transforms.
            const mousePos = { x: event.clientX, y: event.clientY }

            onSelection({ selectedText: text, sourceNodeId, rect, mousePos })
        }

        document.addEventListener('mouseup', handleMouseUp)
        return () => document.removeEventListener('mouseup', handleMouseUp)
    }, [onSelection])
}
