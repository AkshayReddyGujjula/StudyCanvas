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

            // Find the nearest ancestor with data-nodeid
            const target = event.target as Element
            const nodeEl = target.closest('[data-nodeid]')
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
            const range = selection!.getRangeAt(0)
            const rect = range.getBoundingClientRect()

            onSelection({ selectedText: text, sourceNodeId, rect })
        }

        document.addEventListener('mouseup', handleMouseUp)
        return () => document.removeEventListener('mouseup', handleMouseUp)
    }, [onSelection])
}
