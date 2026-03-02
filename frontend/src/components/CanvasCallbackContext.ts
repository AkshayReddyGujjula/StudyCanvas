import { createContext, useContext } from 'react'

export interface SelectionResult {
    selectedText: string
    sourceNodeId: string
    rect: DOMRect
    mousePos: { x: number; y: number }
    autoAsk?: boolean
}

export interface CanvasCallbacks {
    /** Called when "Test Me on This Page" is clicked inside ContentNode */
    onTestMePage: () => void
    /** Called when the user manually selects text inside ContentNode */
    onManualSelection: (result: SelectionResult | null) => void
    /** Called when a student submits an answer inside QuizQuestionNode */
    onGradeAnswer: (nodeId: string, question: string, answer: string) => Promise<void>
    /** Called when an AnswerNode's collapse toggle is clicked */
    onCollapseNode: (nodeId: string) => void
}

const noop = () => {}
const noopAsync = async () => {}

export const CanvasCallbackContext = createContext<CanvasCallbacks>({
    onTestMePage: noop,
    onManualSelection: noop,
    onGradeAnswer: noopAsync,
    onCollapseNode: noop,
})

export const useCanvasCallbacks = () => useContext(CanvasCallbackContext)
