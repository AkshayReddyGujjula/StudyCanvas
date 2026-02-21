import { useEffect } from 'react'

interface SelectionResult {
    selectedText: string
    sourceNodeId: string
    rect: DOMRect
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
            let nodeEl = null

            // Prefer finding the node from the selection's actual DOM nodes instead of where the mouse was released
            if (range.commonAncestorContainer) {
                const container = range.commonAncestorContainer
                const element = container.nodeType === Node.ELEMENT_NODE
                    ? (container as Element)
                    : container.parentElement
                nodeEl = element?.closest('[data-nodeid]')
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

            // Get bounding rect of the selection in viewport coordinates
            const rect = range.getBoundingClientRect()

            onSelection({ selectedText: text, sourceNodeId, rect })
        }

        document.addEventListener('mouseup', handleMouseUp)
        return () => document.removeEventListener('mouseup', handleMouseUp)
    }, [onSelection])
}
