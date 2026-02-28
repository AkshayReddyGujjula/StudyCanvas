import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    ControlButton,
    MiniMap,
    BackgroundVariant,
    useReactFlow,
    applyEdgeChanges,
    ConnectionMode,
    ConnectionLineType,
    type Node,
    type Edge,
    type Connection,
    type EdgeChange,
    type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ContentNode from './ContentNode'
import AnswerNode from './AnswerNode'
import QuizQuestionNode from './QuizQuestionNode'
import FlashcardNode from './FlashcardNode'
import CustomPromptNode from './CustomPromptNode'
import ImageNode from './ImageNode'
import StickyNoteNode from './StickyNoteNode'
import TimerNode from './TimerNode'
import SummaryNode from './SummaryNode'
import LeftToolbar from './LeftToolbar'
import AskGeminiPopup from './AskGeminiPopup'
import QuestionModal from './QuestionModal'
import RevisionModal from './RevisionModal'
import ToolsModal from './ToolsModal'
import PdfUploadPopup from './PdfUploadPopup'
import { DrawingCanvas, DrawingToolbar, TextNode } from './whiteboard'
import { useTextSelection } from '../hooks/useTextSelection'
import { useCanvasStore } from '../store/canvasStore'
import { extractPageImageBase64 } from '../utils/pdfImageExtractor'
import { streamQuery, generateTitle, generatePageQuiz, gradeAnswer, generateFlashcards } from '../api/studyApi'
import { getNewNodePosition, recalculateSiblingPositions, resolveOverlaps, isOverlapping, rerouteEdgeHandles, getQuizNodePositions, getFlashcardPositions, findNonOverlappingPosition } from '../utils/positioning'
import type { AnswerNodeData, QuizQuestionNodeData, FlashcardNodeData, TextNodeData, CustomPromptNodeData, ImageNodeData, StickyNoteNodeData, TimerNodeData, SummaryNodeData } from '../types'
import { pdf } from '@react-pdf/renderer'
import { buildQATree } from '../utils/buildQATree'
import StudyNotePDF from './StudyNotePDF'
import type { StickyNoteEntry, CustomPromptEntry, ImageEntry, SummaryEntry } from './StudyNotePDF'
import { exportCurrentPage, exportAllPages, isExportInProgress, pageHasContent } from '../utils/canvasExport'

const NODE_TYPES = {
    contentNode: ContentNode,
    answerNode: AnswerNode,
    quizQuestionNode: QuizQuestionNode,
    flashcardNode: FlashcardNode,
    textNode: TextNode,
    customPromptNode: CustomPromptNode,
    imageNode: ImageNode,
    stickyNoteNode: StickyNoteNode,
    timerNode: TimerNode,
    summaryNode: SummaryNode,
}

// StudyCanvas Minimalist Colour Palette
// Primary - Deep Navy: #1E3A5F (Content Nodes)
// Secondary - Soft Teal: #2D9CDB (Answer Nodes)  
// Accent - Warm Coral: #EB5757 (Quiz/Struggling status)
// Success - Sage Green: #27AE60 (Understood status)
// Neutral - Slate: #6B7280 (Loading/Default)

interface SelectionState {
    selectedText: string
    sourceNodeId: string
    rect: DOMRect
    mousePos: { x: number; y: number }
    autoAsk?: boolean
}

interface ModalState {
    selectedText: string
    sourceNodeId: string
    preGeneratedNodeId: string
    selectionRect: DOMRect | null
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null

export default function Canvas({ onGoHome, onSave }: { onGoHome?: () => void; onSave?: () => Promise<void> }) {
    const { setCenter, getZoom, fitView, setViewport, getViewport, screenToFlowPosition } = useReactFlow()
    const [selection, setSelection] = useState<SelectionState | null>(null)
    const [modal, setModal] = useState<ModalState | null>(null)
    const [showRevision, setShowRevision] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [showRevisionMenu, setShowRevisionMenu] = useState(false)
    const [revisionSource, setRevisionSource] = useState<{ sourceType: 'struggling' | 'page'; pageIndex: number; pageContent?: string } | null>(null)
    const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false)
    const [showTools, setShowTools] = useState(false)
    const [showUploadPopup, setShowUploadPopup] = useState(false)
    const [showUploadHint, setShowUploadHint] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
    const [isDarkMode, setIsDarkMode] = useState(false)
    const [isExportingPage, setIsExportingPage] = useState(false)
    const [isExportingAll, setIsExportingAll] = useState(false)
    const [exportProgress, setExportProgress] = useState<string | null>(null)
    const exportAbortRef = useRef<AbortController | null>(null)
    const streamingNodesRef = useRef<Set<string>>(new Set())
    const containerRef = useRef<HTMLDivElement>(null)

    const nodes = useCanvasStore((s) => s.nodes)
    const edges = useCanvasStore((s) => s.edges)
    const fileData = useCanvasStore((s) => s.fileData)
    const userDetails = useCanvasStore((s) => s.userDetails)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const addHighlight = useCanvasStore((s) => s.addHighlight)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const setActiveAbortController = useCanvasStore((s) => s.setActiveAbortController)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const canvasViewport = useCanvasStore((s) => s.canvasViewport)
    const setCanvasViewport = useCanvasStore((s) => s.setCanvasViewport)

    // Whiteboard state
    const activeTool = useCanvasStore((s) => s.activeTool)
    const toolSettings = useCanvasStore((s) => s.toolSettings)
    const whiteboardUndo = useCanvasStore((s) => s.whiteboardUndo)
    const whiteboardRedo = useCanvasStore((s) => s.whiteboardRedo)
    const isCursorMode = activeTool === 'cursor'
    const isTextMode = activeTool === 'text'

    // Auto-dismiss the upload hint once a PDF is loaded
    useEffect(() => {
        if (fileData) setShowUploadHint(false)
    }, [fileData])

    // ── Debounced viewport sync to store (for persistence) ─────────────────
    const vpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleViewportChange = useCallback((vp: Viewport) => {
        if (vpTimerRef.current) clearTimeout(vpTimerRef.current)
        vpTimerRef.current = setTimeout(() => {
            setCanvasViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
        }, 300)
    }, [setCanvasViewport])

    // Flush viewport to store synchronously before any save operation
    const flushViewport = useCallback(() => {
        if (vpTimerRef.current) clearTimeout(vpTimerRef.current)
        const vp = getViewport()
        setCanvasViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
    }, [getViewport, setCanvasViewport])

    // Wrap onSave so viewport is always flushed first
    const wrappedSave = useCallback(async () => {
        if (!onSave) return
        flushViewport()
        await onSave()
    }, [onSave, flushViewport])

    const onConnect = useCallback((connection: Connection) => {
        const newEdgeId = `user-edge-${Date.now()}`
        const newEdge: Edge = {
            ...connection,
            id: newEdgeId,
            source: connection.source ?? '',
            target: connection.target ?? '',
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#1E3A5F', strokeWidth: 2 },
        }

        // Use a timeout to ensure React Flow finishes its internal connection state cleanup 
        // before we trigger a re-render by updating the edges in our store.
        setTimeout(() => {
            setEdges((prev) => [...prev.filter((e) => e.id !== newEdgeId), newEdge])
            persistToLocalStorage()
        }, 0)
    }, [setEdges, persistToLocalStorage])

    const currentPage = useCanvasStore((s) => s.currentPage)
    const pageMarkdowns = useCanvasStore((s) => s.pageMarkdowns)
    const setCurrentPage = useCanvasStore((s) => s.setCurrentPage)
    const updateQuizNodeData = useCanvasStore((s) => s.updateQuizNodeData)
    const getQuizNodesForPage = useCanvasStore((s) => s.getQuizNodesForPage)

    // Find the contentNode id
    const contentNode = nodes.find((n) => n.type === 'contentNode')
    const contentNodeId = contentNode?.id ?? ''

    // Helper function to determine verdict from feedback
    const getVerdict = (feedback: string): 'correct' | 'partial' | 'incorrect' | null => {
        const lower = feedback.toLowerCase()
        if (/\bpartially correct\b/.test(lower)) return 'partial'
        if (/\bincorrect\b|\bwrong\b|\bnot correct\b/.test(lower)) return 'incorrect'
        if (/\bcorrect\b/.test(lower)) return 'correct'
        return null
    }

    // ── Quiz callbacks (defined before visibleNodes so they can be injected) ───
    const handleGradeAnswer = useCallback(async (nodeId: string, question: string, answer: string) => {
        const targetNode = nodes.find((n) => n.id === nodeId)
        const nodePageIndex = targetNode
            ? ((targetNode.data as Record<string, unknown>).pageIndex as number ?? currentPage)
            : currentPage
        const pageContent = pageMarkdowns[nodePageIndex - 1] ?? ''

        let imageBase64: string | undefined
        const pdfBuffer = useCanvasStore.getState().pdfArrayBuffer
        if (pdfBuffer) {
            const b64 = await extractPageImageBase64(pdfBuffer, nodePageIndex - 1)
            if (b64) imageBase64 = b64
        }

        try {
            const result = await gradeAnswer(
                question,
                answer,
                pageContent,
                userDetails,
                fileData?.pdf_id,
                nodePageIndex - 1,
                imageBase64
            )
            
            // Determine verdict from feedback and set status accordingly
            const verdict = getVerdict(result.feedback)
            let newStatus: 'understood' | 'struggling' | undefined = undefined
            
            if (verdict === 'correct') {
                newStatus = 'understood'
            } else if (verdict === 'incorrect') {
                newStatus = 'struggling'
            }
            // If verdict is 'partial' or null, don't change status
            
            updateQuizNodeData(nodeId, { 
                isGrading: false, 
                feedback: result.feedback, 
                modelUsed: result.model_used,
                ...(newStatus && { status: newStatus })
            })
        } catch (err) {
            console.error('Grade answer error:', err)
            updateQuizNodeData(nodeId, { isGrading: false, feedback: 'Unable to grade your answer at this time. Please try again.' })
        }
        persistToLocalStorage()
    }, [nodes, currentPage, pageMarkdowns, userDetails, updateQuizNodeData, persistToLocalStorage])

    const handleTestMePage = useCallback(async () => {
        if (!fileData) return
        const existingQuizNodes = getQuizNodesForPage(currentPage)
        if (existingQuizNodes.length > 0) {
            const confirmed = window.confirm(
                `This page already has ${existingQuizNodes.length} quiz question${existingQuizNodes.length !== 1 ? 's' : ''}. Replace with a fresh quiz?`
            )
            if (!confirmed) return
            const existingIds = new Set(existingQuizNodes.map((n) => n.id))
            setNodes((prev) => prev.filter((n) => !existingIds.has(n.id)))
            setEdges((prev) => prev.filter((e) => !existingIds.has(e.source) && !existingIds.has(e.target)))
        }
        // Show inline toast
        setToast('Generating quiz questions for this page…')
        if (toastTimeout) clearTimeout(toastTimeout)
        toastTimeout = setTimeout(() => setToast(null), 3500)

        let questions: string[]
        try {
            const pageContent = pageMarkdowns[currentPage - 1] ?? ''
            let imageBase64: string | undefined
            const pdfBuffer = useCanvasStore.getState().pdfArrayBuffer
            if (pdfBuffer) {
                const b64 = await extractPageImageBase64(pdfBuffer, currentPage - 1)
                if (b64) imageBase64 = b64
            }

            const result = await generatePageQuiz(pageContent, fileData.pdf_id, currentPage - 1, imageBase64)
            questions = result.questions
        } catch (err: unknown) {
            console.error('Page quiz generation error:', err)
            const axErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
            let msg = 'Failed to generate quiz.'
            if (axErr?.response?.status === 422) {
                msg = axErr.response.data?.detail ?? 'Page has no readable content — try a different page.'
            } else if (axErr?.response?.status === 429) {
                msg = 'Rate limit reached — please wait a moment and try again.'
            } else if (!axErr?.response) {
                msg = 'Cannot reach backend server — is it running?'
            } else {
                msg += ' ' + (axErr.response.data?.detail ?? axErr.message ?? '')
            }
            setToast(msg)
            if (toastTimeout) clearTimeout(toastTimeout)
            toastTimeout = setTimeout(() => setToast(null), 5000)
            return
        }
        if (!questions.length) {
            setToast('No questions were generated — try again.')
            if (toastTimeout) clearTimeout(toastTimeout)
            toastTimeout = setTimeout(() => setToast(null), 3000)
            return
        }

        const cNode = nodes.find((n) => n.type === 'contentNode')
        if (!cNode) return
        // Read the actual DOM height at click-time so that a collapsed/minimised
        // ContentNode (which uses maxHeight: 80vh internally) is measured correctly.
        // cNode.measured?.height can be stale because isExpanded is local to ContentNode
        // and React Flow's ResizeObserver may not have propagated yet.
        const domEl = document.querySelector(`[data-nodeid="${cNode.id}"]`) as HTMLElement | null
        const cHeight = domEl ? domEl.offsetHeight : (cNode.measured?.height ?? 600)
        const cWidth = typeof cNode.style?.width === 'number' ? cNode.style.width : 700
        const positions = getQuizNodePositions(
            cNode.position.x, cNode.position.y, cHeight, cWidth as number, questions.length,
            nodes
        )

        const quizNodes: Node[] = questions.map((question, i) => ({
            id: `quiz-${currentPage}-${i + 1}`,
            type: 'quizQuestionNode',
            position: positions[i],
            data: {
                pageIndex: currentPage,
                questionNumber: i + 1,
                question,
                isGrading: false,
                chatHistory: [],
            } as unknown as Record<string, unknown>,
            style: { width: 360 },
        }))

        const quizEdges = quizNodes.map((qNode, i) => {
            if (i === 0) {
                return {
                    id: `edge-quiz-content-${currentPage}-1`,
                    source: contentNodeId,
                    target: qNode.id,
                    sourceHandle: 'right-9',
                    targetHandle: 'top',
                    type: 'smoothstep',
                    animated: false,
                    style: { stroke: '#2D9CDB', strokeWidth: 2 },
                }
            }
            return {
                id: `edge-quiz-${currentPage}-${i}-${i + 1}`,
                source: quizNodes[i - 1].id,
                target: qNode.id,
                sourceHandle: 'right',
                targetHandle: 'left',
                type: 'smoothstep',
                animated: false,
                style: { stroke: '#2D9CDB', strokeWidth: 2 },
            }
        })

        setNodes((prev) => [...prev, ...quizNodes])
        setEdges((prev) => [...prev, ...quizEdges])

        if (positions.length > 0) {
            const midIdx = Math.floor(positions.length / 2)
            setCenter(positions[midIdx].x + 180, positions[0].y + 120, { zoom: getZoom(), duration: 700 })
        }
        persistToLocalStorage()
        setToast(`${questions.length} quiz questions generated!`)
        if (toastTimeout) clearTimeout(toastTimeout)
        toastTimeout = setTimeout(() => setToast(null), 3000)
    }, [
        fileData, currentPage, pageMarkdowns, nodes, contentNodeId,
        getQuizNodesForPage, setNodes, setEdges, setCenter, getZoom,
        updateQuizNodeData, persistToLocalStorage,
    ])

    // Text selection hook
    const handleSelection = useCallback((result: SelectionState | null) => {
        if (result) {
            if (result.autoAsk) {
                const preGeneratedNodeId = crypto.randomUUID()
                setModal({
                    selectedText: result.selectedText,
                    sourceNodeId: result.sourceNodeId,
                    preGeneratedNodeId,
                    selectionRect: result.rect,
                })
                setSelection(null)
            } else {
                setSelection(result)
            }
        } else {
            setSelection(null)
        }
    }, [])
    useTextSelection(handleSelection)

    // ── Page-scoped visibility ──────────────────────────────────────────────────
    // Only show nodes for the current page (or pinned nodes which appear everywhere).
    // The master `nodes` / `edges` arrays still hold all pages — we just filter here.
    const visibleNodes = useMemo(() => {
        return nodes
            .filter((n) => {
                if (n.type === 'contentNode') return true
                if (n.type === 'textNode') {
                    const d = n.data as unknown as TextNodeData
                    return d.pageIndex === currentPage
                }
                if (n.type === 'quizQuestionNode') {
                    const d = n.data as unknown as QuizQuestionNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'flashcardNode') {
                    const d = n.data as unknown as FlashcardNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'customPromptNode') {
                    const d = n.data as unknown as CustomPromptNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'imageNode') {
                    const d = n.data as unknown as ImageNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'stickyNoteNode') {
                    const d = n.data as unknown as StickyNoteNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'timerNode') {
                    const d = n.data as unknown as TimerNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                if (n.type === 'summaryNode') {
                    const d = n.data as unknown as SummaryNodeData
                    return d.isPinned === true || d.pageIndex === currentPage
                }
                const d = n.data as unknown as AnswerNodeData
                return d.isPinned === true || d.pageIndex === currentPage
            })
            .map((n) => {
                if (n.type === 'contentNode') {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            onTestMePage: handleTestMePage,
                            onManualSelection: handleSelection
                        } as unknown as Record<string, unknown>,
                    }
                }
                if (n.type === 'quizQuestionNode') {
                    const d = n.data as unknown as QuizQuestionNodeData
                    const pageContent = pageMarkdowns[(d.pageIndex ?? currentPage) - 1] ?? ''
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            onGradeAnswer: handleGradeAnswer,
                            pageMarkdown: pageContent,
                        } as unknown as Record<string, unknown>,
                    }
                }
                return n
            })
    }, [nodes, currentPage, pageMarkdowns, handleTestMePage, handleGradeAnswer, handleSelection])

    const visibleNodeIds = useMemo(
        () => new Set(visibleNodes.map((n) => n.id)),
        [visibleNodes]
    )

    const visibleEdges = useMemo(() => {
        return edges.filter(
            (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        )
    }, [edges, visibleNodeIds])

    // Navigate to a given page: update the contentNode display and set currentPage.
    const goToPage = useCallback(
        (page: number) => {
            if (!pageMarkdowns.length) return
            const md = pageMarkdowns[page - 1]
            if (md && contentNodeId) {
                updateNodeData(contentNodeId, { markdown_content: md })
            }
            setCurrentPage(page)
            persistToLocalStorage()
        },
        [pageMarkdowns, contentNodeId, updateNodeData, setCurrentPage, persistToLocalStorage]
    )

    // MiniMap node color function - STATUS COLOURING (green for understood, red for struggling)
    // ContentNode: Deep Navy (#1E3A5F)
    // AnswerNode: Soft Teal (#2D9CDB)
    // QuizQuestionNode: Soft Teal (#2D9CDB) - neutral default
    // FlashcardNode: Soft Teal (#2D9CDB) - neutral default
    // Status: Understood = Green (#27AE60), Struggling = Red (#EB5757)
    const nodeColor = useCallback((node: Node) => {
        const nodeType = node.type;
        const status = (node.data as unknown as AnswerNodeData)?.status;
        
        // Priority 1: Status colours (green for understood, red for struggling)
        if (status === 'understood') {
            return '#27AE60'; // Sage Green - correct/understood
        }
        if (status === 'struggling') {
            return '#EB5757'; // Warm Coral - incorrect/struggling
        }
        
        // Priority 2: Node type colours (neutral default)
        switch (nodeType) {
            case 'contentNode':
                return '#1E3A5F'; // Deep Navy
            case 'answerNode':
                return '#2D9CDB'; // Soft Teal
            case 'quizQuestionNode':
                return '#2D9CDB'; // Soft Teal - neutral
            case 'flashcardNode':
                return '#2D9CDB'; // Soft Teal - neutral
            case 'customPromptNode':
                return '#6366F1'; // Indigo
            case 'imageNode':
                return '#9CA3AF'; // Gray
            case 'stickyNoteNode':
                return '#FBBF24'; // Amber
            case 'timerNode':
                return '#EB5757'; // Warm Coral
            case 'summaryNode':
                return '#1E3A5F'; // Deep Navy
            default:
                return '#6B7280'; // Neutral Slate
        }
    }, [])

    // ── Left Toolbar node spawning ──────────────────────────────────────────
    const getViewportCenter = useCallback(() => {
        const container = containerRef.current
        const w = container?.clientWidth ?? window.innerWidth
        const h = container?.clientHeight ?? window.innerHeight
        return screenToFlowPosition({ x: w / 2, y: h / 2 })
    }, [screenToFlowPosition])

    const handleSpawnCustomPrompt = useCallback(() => {
        const center = getViewportCenter()
        const nodeWidth = 440
        const nodeHeight = 380
        const pos = findNonOverlappingPosition(center, nodeWidth, nodeHeight, nodes)
        const nodeId = `custom-prompt-${Date.now()}`
        const newNode: Node = {
            id: nodeId,
            type: 'customPromptNode',
            position: pos,
            data: {
                chatHistory: [],
                isLoading: false,
                isStreaming: false,
                status: 'unread',
                useContext: false,
                selectedModel: 'gemini-2.5-flash',
                pageIndex: currentPage,
            } as unknown as Record<string, unknown>,
            style: { width: 350 },
        }
        setNodes((prev) => [...prev, newNode])
        persistToLocalStorage()
    }, [getViewportCenter, currentPage, nodes, setNodes, persistToLocalStorage])

    const handleSpawnImage = useCallback((dataUrl: string, fileName: string) => {
        const center = getViewportCenter()
        const nodeWidth = 300
        const nodeHeight = 300
        const pos = findNonOverlappingPosition(center, nodeWidth, nodeHeight, nodes)
        const nodeId = `image-${Date.now()}`
        const newNode: Node = {
            id: nodeId,
            type: 'imageNode',
            position: pos,
            data: {
                imageDataUrl: dataUrl,
                imageName: fileName,
                pageIndex: currentPage,
            } as unknown as Record<string, unknown>,
            style: { width: 300 },
        }
        setNodes((prev) => [...prev, newNode])
        persistToLocalStorage()
    }, [getViewportCenter, currentPage, nodes, setNodes, persistToLocalStorage])

    const handleSpawnStickyNote = useCallback(() => {
        const center = getViewportCenter()
        const nodeWidth = 260
        const nodeHeight = 200
        const pos = findNonOverlappingPosition(center, nodeWidth, nodeHeight, nodes)
        const nodeId = `sticky-${Date.now()}`
        const newNode: Node = {
            id: nodeId,
            type: 'stickyNoteNode',
            position: pos,
            data: {
                content: '',
                color: '#FFF9C4',
                pageIndex: currentPage,
            } as unknown as Record<string, unknown>,
            style: { width: 220 },
        }
        setNodes((prev) => [...prev, newNode])
        persistToLocalStorage()
    }, [getViewportCenter, currentPage, nodes, setNodes, persistToLocalStorage])

    const handleSpawnTimer = useCallback(() => {
        const center = getViewportCenter()
        const nodeWidth = 240
        const nodeHeight = 280
        const pos = findNonOverlappingPosition(center, nodeWidth, nodeHeight, nodes)
        const nodeId = `timer-${Date.now()}`
        const newNode: Node = {
            id: nodeId,
            type: 'timerNode',
            position: pos,
            data: {
                mode: 'pomodoro',
                duration: 25 * 60,
                remaining: 25 * 60,
                isRunning: false,
                sessionsCompleted: 0,
                pageIndex: currentPage,
            } as unknown as Record<string, unknown>,
            style: { width: 240 },
        }
        setNodes((prev) => [...prev, newNode])
        persistToLocalStorage()
    }, [getViewportCenter, currentPage, nodes, setNodes, persistToLocalStorage])

    const handleSpawnSummary = useCallback(async () => {
        const center = getViewportCenter()
        const nodeWidth = 350
        const nodeHeight = 350
        const pos = findNonOverlappingPosition(center, nodeWidth, nodeHeight, nodes)
        const nodeId = `summary-${Date.now()}`
        const newNode: Node = {
            id: nodeId,
            type: 'summaryNode',
            position: pos,
            data: {
                summary: '',
                isLoading: true,
                isStreaming: false,
                status: 'loading',
                sourcePage: currentPage,
                pageIndex: currentPage,
            } as unknown as Record<string, unknown>,
            style: { width: 350 },
        }
        setNodes((prev) => [...prev, newNode])
        persistToLocalStorage()

        // Auto-stream summary — read pageMarkdowns from store at call time
        // to avoid stale closure issues where the context might be empty
        const controller = new AbortController()
        try {
            const storeState = useCanvasStore.getState()
            let pageContent = storeState.pageMarkdowns[currentPage - 1] ?? ''
            // Fallback: if page-specific markdown is empty, use raw_text from fileData
            if (!pageContent.trim() && storeState.fileData?.raw_text) {
                pageContent = storeState.fileData.raw_text
            }

            const prompt = `Please provide a concise summary of this page's content. Focus on the key concepts, definitions, and important points. Use bullet points for clarity.`

            const response = await streamQuery(
                {
                    question: prompt,
                    highlighted_text: pageContent,
                    raw_text: pageContent,
                    parent_response: null,
                    user_details: userDetails ?? undefined,
                    preferred_model: 'gemini-2.5-flash-lite',
                },
                controller.signal,
            )

            const modelUsed = response.headers.get('X-Model-Used') || 'gemini-2.5-flash-lite'
            updateNodeData(nodeId, { isStreaming: true, isLoading: false, modelUsed })

            if (!response.body) throw new Error('No response body')

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let accumulated = ''

            while (true) {
                const { value, done } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                accumulated += chunk
                updateNodeData(nodeId, { summary: accumulated })
            }

            updateNodeData(nodeId, {
                summary: accumulated,
                isStreaming: false,
                status: accumulated ? 'unread' : 'struggling',
                modelUsed,
            })
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Summary generation error:', err)
                updateNodeData(nodeId, {
                    summary: 'Failed to generate summary. Click regenerate to try again.',
                    isLoading: false,
                    isStreaming: false,
                    status: 'struggling',
                })
            }
        }
        persistToLocalStorage()
    }, [getViewportCenter, currentPage, pageMarkdowns, fileData, userDetails, nodes, setNodes, updateNodeData, persistToLocalStorage])

    // Dismiss popup on mousedown outside
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as Element
            if (!target.closest('[data-popup="ask-gemini"]')) {
                setSelection(null)
            }
        }
        document.addEventListener('mousedown', handleMouseDown)
        return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [])

    // F key shortcut — fit view (only when not typing in input/textarea)
    // Ctrl+Shift+S / Cmd+Shift+S — snipping tool (globally registered so it
    // works in both PDF view and markdown view without needing PDFViewer mounted).
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (document.activeElement as HTMLElement)?.tagName
            if (e.key === 'F' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
                fitView({ duration: 400 })
            }
            // Ctrl+S (no Shift) — save canvas
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
                e.preventDefault()
                if (onSave) {
                    wrappedSave().then(() => {
                        setToast('Saved!')
                        if (toastTimeout) clearTimeout(toastTimeout)
                        toastTimeout = setTimeout(() => setToast(null), 2500)
                    }).catch(() => {
                        setToast('Save failed.')
                        if (toastTimeout) clearTimeout(toastTimeout)
                        toastTimeout = setTimeout(() => setToast(null), 3500)
                    })
                }
                return
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
                // Always prevent the browser "Save As" dialog.
                e.preventDefault()
                const state = useCanvasStore.getState()
                if (!state.pdfArrayBuffer) {
                    // PDF not loaded or not in PDF view — try loading it first
                    if (state.fileData) {
                        state.loadPdfFromStorage().then(() => {
                            const fresh = useCanvasStore.getState()
                            if (fresh.pdfArrayBuffer) {
                                fresh.setIsSnippingMode(true)
                            } else {
                                setToast('Switch to PDF View mode to use the snipping tool')
                                if (toastTimeout) clearTimeout(toastTimeout)
                                toastTimeout = setTimeout(() => setToast(null), 3000)
                            }
                        })
                    } else {
                        setToast('Upload a PDF first to use the snipping tool')
                        if (toastTimeout) clearTimeout(toastTimeout)
                        toastTimeout = setTimeout(() => setToast(null), 3000)
                    }
                    return
                }
                // Toggle snipping mode — the PDFViewer overlay responds to this store flag.
                state.setIsSnippingMode(!state.isSnippingMode)
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [fitView, onSave, wrappedSave])

    // Safety net: always remove rf-connecting on mouseup so stale text-selection
    // suppression can't get stuck if onConnectEnd doesn't fire (e.g. drag released
    // outside the window or over an invalid target).
    useEffect(() => {
        const cleanup = () => document.body.classList.remove('rf-connecting')
        document.addEventListener('mouseup', cleanup)
        return () => document.removeEventListener('mouseup', cleanup)
    }, [])

    // Boost 2-finger trackpad zoom sensitivity.
    // We bypass D3-zoom entirely for pinch gestures (ctrlKey:true wheel events) and
    // drive zoom directly through ReactFlow's setViewport API so the multiplier is
    // guaranteed to be applied.  2-finger pan (ctrlKey:false) is also boosted.
    const MIN_ZOOM = 0.1
    const MAX_ZOOM = 4
    const ZOOM_SPEED = 0.015   // per deltaY unit — raise to taste
    const PAN_SPEED = 3       // multiplier for 2-finger pan
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        const handleWheel = (e: WheelEvent) => {
            // Only intercept trackpad-style wheel events (not plain mouse scroll on content).
            // Panning inside a node's scrollable area should not move the canvas, so ignore
            // events that originate inside a .nodrag container.
            if ((e.target as Element).closest('.nodrag')) return

            e.preventDefault()
            e.stopImmediatePropagation()

            const vp = getViewport()

            if (e.ctrlKey) {
                // ── Pinch-to-zoom ─────────────────────────────────────────────
                const delta = -e.deltaY * ZOOM_SPEED
                const newZoom = Math.min(Math.max(vp.zoom * Math.exp(delta), MIN_ZOOM), MAX_ZOOM)
                const ratio = newZoom / vp.zoom

                // Zoom toward the cursor position
                const rect = el.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top

                setViewport({
                    zoom: newZoom,
                    x: mouseX - (mouseX - vp.x) * ratio,
                    y: mouseY - (mouseY - vp.y) * ratio,
                })
            } else {
                // ── 2-finger pan ──────────────────────────────────────────────
                setViewport({
                    zoom: vp.zoom,
                    x: vp.x - e.deltaX * PAN_SPEED,
                    y: vp.y - e.deltaY * PAN_SPEED,
                })
            }
        }

        el.addEventListener('wheel', handleWheel, { passive: false, capture: true })
        return () => el.removeEventListener('wheel', handleWheel, { capture: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setViewport, getViewport])

    // Show toast helper
    const showToast = useCallback((msg: string) => {
        setToast(msg)
        if (toastTimeout) clearTimeout(toastTimeout)
        toastTimeout = setTimeout(() => setToast(null), 3000)
    }, [])

    // When popup is clicked — generate preGeneratedNodeId and open modal
    const handleAsk = useCallback(() => {
        if (!selection) return
        const preGeneratedNodeId = crypto.randomUUID()
        setModal({
            selectedText: selection.selectedText,
            sourceNodeId: selection.sourceNodeId,
            preGeneratedNodeId,
            selectionRect: selection.rect,
        })
        setSelection(null)
    }, [selection])

    // When modal is submitted — create node, edge, and start streaming
    const handleModalSubmit = useCallback(
        async (question: string) => {
            if (!modal || !fileData) return
            const { selectedText, sourceNodeId, preGeneratedNodeId } = modal
            setModal(null)

            // Add highlight entry
            const highlightId = crypto.randomUUID()
            addHighlight({ id: highlightId, text: selectedText, nodeId: preGeneratedNodeId })

            // Calculate new node position — only consider visible nodes to
            // avoid stacking on top of answer nodes from other pages.
            // Compute the relative Y and X positions of the highlighted text within the
            // content node so the answer node spawns on the correct side and vertical level.
            let selectionRelativeY: number | undefined
            let selectionRelativeX: number | undefined
            if (sourceNodeId === contentNodeId && modal.selectionRect) {
                const contentEl = document.querySelector(`[data-nodeid="${contentNodeId}"]`)
                if (contentEl) {
                    const contentRect = contentEl.getBoundingClientRect()
                    const selCenterY = modal.selectionRect.top + modal.selectionRect.height / 2
                    selectionRelativeY = (selCenterY - contentRect.top) / contentRect.height
                    selectionRelativeY = Math.max(0, Math.min(1, selectionRelativeY))
                    // Use the LEFT edge of the selection rect (first word position)
                    // to determine which side of the PDF the text starts on.
                    selectionRelativeX = (modal.selectionRect.left - contentRect.left) / contentRect.width
                    selectionRelativeX = Math.max(0, Math.min(1, selectionRelativeX))
                }
            }

            const { x, y, sourceHandle: side, targetHandle } = getNewNodePosition(
                sourceNodeId,
                visibleNodes,
                contentNodeId,
                selectionRelativeY,
                selectionRelativeX
            )

            // Pick the handle on the ContentNode closest to the highlighted text
            let sourceHandle = side
            if (sourceNodeId === contentNodeId && modal.selectionRect) {
                const contentEl = document.querySelector(`[data-nodeid="${contentNodeId}"]`)
                if (contentEl) {
                    const contentRect = contentEl.getBoundingClientRect()
                    const selCenterY = modal.selectionRect.top + modal.selectionRect.height / 2
                    const relativeY = (selCenterY - contentRect.top) / contentRect.height
                    const idx = Math.min(Math.max(Math.round(relativeY * 9), 0), 9)
                    sourceHandle = `${side}-${idx}`
                }
            }

            // Create the Answer Node — tagged with the current page so it only
            // appears when the user is on this page (unless pinned later).
            const newNode: Node = {
                id: preGeneratedNodeId,
                type: 'answerNode',
                position: { x, y },
                data: {
                    question,
                    highlighted_text: selectedText,
                    answer: '',
                    isLoading: true,
                    isStreaming: true,
                    status: 'loading',
                    parentResponseText: undefined,
                    pageIndex: currentPage,
                } satisfies AnswerNodeData as unknown as Record<string, unknown>,
                style: { width: 360 },
            }

            // Create the edge
            const newEdge = {
                id: `edge-${sourceNodeId}-${preGeneratedNodeId}`,
                source: sourceNodeId,
                target: preGeneratedNodeId,
                sourceHandle,
                targetHandle,
                type: 'smoothstep',
                animated: true,
                style: { strokeDasharray: '5,5', stroke: '#1E3A5F', strokeWidth: 2 },
            }

            setNodes((prev) => [...prev, newNode])
            setEdges((prev) => [...prev, newEdge])

            // Pan to new node
            setCenter(x + 180, y + 100, { zoom: getZoom(), duration: 600 })

            // Create AbortController and start streaming
            const controller = new AbortController()
            setActiveAbortController(controller)
            streamingNodesRef.current.add(preGeneratedNodeId)

            // Get parent response if branching from AnswerNode
            const parentNode = nodes.find((n) => n.id === sourceNodeId)
            const parentResponse =
                parentNode?.type === 'answerNode'
                    ? ((parentNode.data as unknown as AnswerNodeData).answer ?? null)
                    : null

            try {
                const response = await streamQuery(
                    {
                        question,
                        highlighted_text: selectedText,
                        raw_text: fileData.raw_text,
                        parent_response: parentResponse,
                        user_details: userDetails,
                    },
                    controller.signal
                )

                // Capture which model was used from the response header
                const modelUsed = response.headers.get('X-Model-Used') || undefined

                if (!response.body) throw new Error('No response body')

                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let fullText = ''

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    const chunk = decoder.decode(value, { stream: true })
                    fullText += chunk
                    updateNodeData(preGeneratedNodeId, {
                        answer: fullText,
                        isLoading: false,
                        isStreaming: true,
                        modelUsed,
                    })
                }

                // Stream complete — Phase 3
                updateNodeData(preGeneratedNodeId, {
                    isStreaming: false,
                    status: 'unread',
                    modelUsed,
                })

                // Update edge to solid
                setEdges((prev) =>
                    prev.map((e) =>
                        e.id === `edge-${sourceNodeId}-${preGeneratedNodeId}`
                            ? {
                                ...e,
                                animated: false,
                                style: { stroke: '#1E3A5F', strokeWidth: 2 },
                            }
                            : e
                    )
                )
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('Stream error:', err)
                    updateNodeData(preGeneratedNodeId, {
                        answer: 'An error occurred while generating the response.',
                        isLoading: false,
                        isStreaming: false,
                        status: 'unread',
                    })
                }
            } finally {
                streamingNodesRef.current.delete(preGeneratedNodeId)
                setActiveAbortController(null)
                persistToLocalStorage() // lifecycle event (b)
            }
        },
        [
            modal,
            fileData,
            userDetails,
            nodes,
            visibleNodes,
            currentPage,
            contentNodeId,
            addHighlight,
            setNodes,
            setEdges,
            setCenter,
            getZoom,
            setActiveAbortController,
            updateNodeData,
            persistToLocalStorage,
        ]
    )

    // When the ContentNode grows (PDF expanded), push overlapping nodes down.
    const prevContentHeightRef = useRef<number>(0)
    useEffect(() => {
        if (!contentNode || !contentNodeId) return
        const newHeight = contentNode.measured?.height ?? 0
        const prevHeight = prevContentHeightRef.current
        prevContentHeightRef.current = newHeight

        // Only act when the content node has grown
        if (newHeight <= prevHeight || newHeight === 0) return

        const cLeft = contentNode.position.x
        const cRight = cLeft + (typeof contentNode.style?.width === 'number' ? contentNode.style.width as number : (contentNode.measured?.width ?? 700))
        const cTop = contentNode.position.y
        const cBottom = cTop + newHeight

        // Find visible non-content nodes whose bounding box overlaps the content node
        const overlapping = visibleNodes.filter((n) => {
            if (n.type === 'contentNode') return false
            const nLeft = n.position.x
            const nWidth = typeof n.style?.width === 'number' ? n.style.width : (n.measured?.width ?? 360)
            const nRight = nLeft + (nWidth as number)
            const nTop = n.position.y
            const nBottom = nTop + (n.measured?.height ?? 200)
            const overlapX = nLeft < cRight && nRight > cLeft
            const overlapY = nTop < cBottom && nBottom > cTop
            return overlapX && overlapY
        })

        if (overlapping.length === 0) return

        // Push each overlapping node down to clear the content node, then cascade
        const withPushed = visibleNodes.map((n) => {
            if (!overlapping.find((o) => o.id === n.id)) return n
            return { ...n, position: { ...n.position, y: cBottom + 1 } }
        })
        const resolved = resolveOverlaps(withPushed)

        setNodes((prev) =>
            prev.map((n) => {
                const r = resolved.find((rn) => rn.id === n.id)
                return r && r.position.y !== n.position.y ? { ...n, position: r.position } : n
            })
        )
    }, [contentNode?.measured?.height]) // eslint-disable-line react-hooks/exhaustive-deps

    // Post-stream correction: re-run Y-position calc after streaming completes
    useEffect(() => {
        const streamingNode = visibleNodes.find((n) => {
            const d = n.data as unknown as AnswerNodeData
            return d?.isStreaming === false && streamingNodesRef.current.has(n.id)
        })
        if (!streamingNode || !contentNodeId) return

        const side =
            streamingNode.position.x > (contentNode?.position.x ?? 0) ? 'right' : 'left'
        // Run positional correction only over visible nodes so per-page siblings
        // don't interfere with each other, then merge the deltas back into the
        // master nodes array.
        const corrected = recalculateSiblingPositions(visibleNodes, streamingNode.id, side, contentNodeId)
        setNodes((prev) =>
            prev.map((n) => {
                const c = corrected.find((cn) => cn.id === n.id)
                return c ? { ...n, position: c.position, measured: c.measured } : n
            })
        )
    }, [nodes, contentNodeId, contentNode, visibleNodes, setNodes])

    // Re-route connected edge handles after a drag so arrows take the shortest path
    const handleNodeDragStop = useCallback(
        (_evt: React.MouseEvent, draggedNode: Node) => {
            if (draggedNode.type === 'answerNode') {
                // Merge the final dragged position into the node list so the
                // reroute calculation uses the up-to-date position even if the
                // Zustand store is one render behind.
                const freshNodes = nodes.map((n) =>
                    n.id === draggedNode.id
                        ? { ...n, position: draggedNode.position, measured: draggedNode.measured ?? n.measured }
                        : n
                )
                setEdges((prevEdges) =>
                    rerouteEdgeHandles(draggedNode.id, freshNodes, prevEdges)
                )
            }
            persistToLocalStorage()
        },
        [nodes, setEdges, persistToLocalStorage],
    )

    // ── Whiteboard: pane click handler for text tool ────────────────────────────
    const handlePaneClick = useCallback(
        (event: React.MouseEvent) => {
            if (activeTool !== 'text') return

            // Don't place text if clicking on a popup / modal overlay
            const target = event.target as HTMLElement
            if (target.closest('.react-flow__node') || target.closest('[data-popup]') || target.closest('[role="dialog"]')) return

            const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })

            // Check overlap with existing visible nodes
            const PADDING = 10
            const newW = 200
            const newH = 40
            const overlaps = visibleNodes.some((n) => {
                const nw = n.measured?.width ?? 300
                const nh = n.measured?.height ?? 200
                return (
                    flowPos.x < n.position.x + nw + PADDING &&
                    flowPos.x + newW > n.position.x - PADDING &&
                    flowPos.y < n.position.y + nh + PADDING &&
                    flowPos.y + newH > n.position.y - PADDING
                )
            })
            if (overlaps) return

            const newId = `text-${Date.now()}`
            const textData: TextNodeData = {
                text: '',
                fontSize: toolSettings.text.fontSize,
                color: toolSettings.text.color,
                pageIndex: currentPage,
            }
            const newNode: Node = {
                id: newId,
                type: 'textNode',
                position: flowPos,
                data: textData as unknown as Record<string, unknown>,
            }
            setNodes((prev) => [...prev, newNode])

            // Push undo action
            useCanvasStore.getState().whiteboardUndoStack.push({ type: 'addText', nodeId: newId })
            useCanvasStore.setState({ whiteboardRedoStack: [] })

            // Switch back to cursor mode after placing text
            useCanvasStore.getState().setActiveTool('cursor')

            persistToLocalStorage()
        },
        [activeTool, screenToFlowPosition, visibleNodes, toolSettings, currentPage, setNodes, persistToLocalStorage],
    )

    // ── Whiteboard: undo/redo keyboard shortcuts ────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't intercept if typing in an input / textarea
            const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
            if (tag === 'input' || tag === 'textarea') return

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                whiteboardUndo()
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault()
                whiteboardRedo()
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault()
                whiteboardRedo()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [whiteboardUndo, whiteboardRedo])

    // Revision mode
    const handleRevisionMode = useCallback((sourceType: 'struggling' | 'page' = 'struggling') => {
        setShowRevisionMenu(false)
        if (sourceType === 'struggling') {
            const strugglingNodes = nodes.filter(
                (n) => n.type === 'answerNode' && (n.data as unknown as AnswerNodeData).status === 'struggling'
            )
            if (strugglingNodes.length === 0) {
                showToast("Mark some nodes as 'Struggling' first to generate a targeted quiz.")
                return
            }
        }
        setRevisionSource({ sourceType, pageIndex: currentPage, pageContent: pageMarkdowns[currentPage - 1] })
        setShowRevision(true)
    }, [nodes, showToast, currentPage, pageMarkdowns])

    // Create flashcards from struggling nodes
    const handleCreateFlashCards = useCallback(async (sourceType: 'struggling' | 'page' = 'struggling') => {
        setShowRevisionMenu(false)
        if (!fileData) return

        let payload: any[] = []
        let pageContent: string | undefined = undefined;
        let pIndex: number | undefined = undefined;

        if (sourceType === 'struggling') {
            const strugglingNodes = nodes.filter(
                (n) => n.type === 'answerNode' && (n.data as unknown as AnswerNodeData).status === 'struggling'
            )
            if (strugglingNodes.length === 0) {
                showToast("Mark some nodes as 'Struggling' first to create flashcards.")
                return
            }
            if (toastTimeout) clearTimeout(toastTimeout)
            showToast('Generating flashcards from your struggling topics…')

            payload = strugglingNodes.map((n) => {
                const d = n.data as unknown as AnswerNodeData
                return {
                    highlighted_text: d.highlighted_text,
                    question: d.question,
                    answer: d.answer,
                    page_index: d.pageIndex ? d.pageIndex - 1 : undefined
                }
            })
        } else {
            pageContent = pageMarkdowns[currentPage - 1]
            pIndex = currentPage - 1
            if (toastTimeout) clearTimeout(toastTimeout)
            showToast('Generating flashcards for the current page…')
        }

        setIsGeneratingFlashcards(true)

        const currentFlashcards = nodes
            .filter((n) => n.type === 'flashcardNode')
            .map((n) => (n.data as unknown as FlashcardNodeData).question)

        let cards: { question: string; answer: string }[]
        let flashcardModelUsed: string | undefined
        try {
            let imageBase64: string | undefined
            // Always send the page image so Gemini can read handwritten/visual content
            if (sourceType === 'page' && pIndex !== undefined) {
                const pdfBuffer = useCanvasStore.getState().pdfArrayBuffer
                if (pdfBuffer) {
                    const b64 = await extractPageImageBase64(pdfBuffer, pIndex)
                    if (b64) imageBase64 = b64
                }
            }

            const fcResult = await generateFlashcards(
                payload,
                fileData.raw_text,
                fileData.pdf_id,
                sourceType,
                pIndex,
                pageContent,
                currentFlashcards.length > 0 ? currentFlashcards : undefined,
                imageBase64
            )
            cards = fcResult.flashcards
            flashcardModelUsed = fcResult.model_used
            console.log('FLASHCARD API RETURNED:', cards)
        } catch (err: unknown) {
            console.error('Flashcard generation error:', err)
            const axErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string }
            let msg = 'Failed to generate flashcards.'
            if (axErr?.response?.status === 422) {
                msg = axErr.response.data?.detail ?? 'Page has no readable content — try a different page.'
            } else if (axErr?.response?.status === 429) {
                msg = 'Rate limit reached — please wait a moment and try again.'
            } else if (!axErr?.response) {
                msg = 'Cannot reach backend server — is it running?'
            } else {
                msg += ' ' + (axErr.response.data?.detail ?? axErr.message ?? '')
            }
            showToast(msg)
            setIsGeneratingFlashcards(false)
            return
        }

        if (!cards.length) {
            showToast('No flashcards were generated — try again.')
            setIsGeneratingFlashcards(false)
            return
        }

        // Place flashcard row ABOVE the content node, avoiding overlaps
        const cNode = nodes.find((n) => n.type === 'contentNode')
        const contentX = cNode ? cNode.position.x : 0
        const contentY = cNode ? cNode.position.y : 0
        const contentW = cNode && typeof cNode.style?.width === 'number' ? cNode.style.width as number : 700
        const cardWidth = 380
        const gap = 40

        // Only consider visible nodes for overlap avoidance
        const currentVisibleNodes = nodes.filter((n) => {
            if (n.type === 'contentNode') return true
            const d = n.data as unknown as AnswerNodeData
            return d.isPinned === true || d.pageIndex === currentPage
        })

        const flashcardPositions = getFlashcardPositions(
            contentX,
            contentY,
            contentW,
            cards.length,
            cardWidth,
            gap,
            currentVisibleNodes
        )

        const cardNodeIds: string[] = []
        const flashcardNodes: Node[] = cards.map((card, i) => {
            const nodeId = `flashcard-${currentPage}-${Date.now()}-${i}`
            cardNodeIds.push(nodeId)
            return {
                id: nodeId,
                type: 'flashcardNode',
                position: flashcardPositions[i] ?? { x: contentX + i * (cardWidth + gap), y: contentY - 300 },
                data: {
                    question: card.question,
                    answer: card.answer,
                    isFlipped: false,
                    status: 'unread',
                    isMinimized: false,
                    isPinned: false,
                    pageIndex: currentPage,
                    isLoading: false,
                    modelUsed: flashcardModelUsed,
                } as unknown as Record<string, unknown>,
                style: { width: cardWidth },
            }
        })

        // Chain edges between consecutive flashcards (no edge to contentNode)
        const chainEdges = cardNodeIds
            .slice(0, -1)
            .map((srcId, i) => ({
                id: `edge-fc-${currentPage}-${i}-${i + 1}-${Date.now()}`,
                source: srcId,
                target: cardNodeIds[i + 1],
                sourceHandle: 'right',
                targetHandle: 'left',
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#2D9CDB', strokeWidth: 2 },
            }))

        setNodes((prev) => [...prev, ...flashcardNodes])
        setEdges((prev) => [...prev, ...chainEdges])
        persistToLocalStorage()
        setIsGeneratingFlashcards(false)

        if (flashcardNodes.length > 0) {
            const mid = flashcardNodes[Math.floor(flashcardNodes.length / 2)]
            setCenter(mid.position.x + cardWidth / 2, mid.position.y + 100, { zoom: getZoom(), duration: 700 })
        }
        showToast(`${cards.length} flashcards created!`)
    }, [nodes, fileData, currentPage, setNodes, setEdges, persistToLocalStorage, setCenter, getZoom, showToast])

    // Download Q&A as a PDF (text-based export — legacy)
    const handleDownloadPDF = useCallback(async () => {
        setShowMenu(false)
        setShowRevisionMenu(false)
        const { qaTree, pageQuizzes } = buildQATree(nodes, edges)

        // Extract sticky notes
        const stickyNotes: StickyNoteEntry[] = nodes
            .filter((n) => n.type === 'stickyNoteNode')
            .map((n) => {
                const d = n.data as unknown as StickyNoteNodeData
                return { content: d.content ?? '', color: d.color ?? '#FFF9C4', pageIndex: d.pageIndex }
            })
            .filter((n) => n.content.trim().length > 0)

        // Extract custom prompts with chat history
        const customPrompts: CustomPromptEntry[] = nodes
            .filter((n) => n.type === 'customPromptNode')
            .map((n) => {
                const d = n.data as unknown as CustomPromptNodeData
                return { chatHistory: d.chatHistory ?? [], pageIndex: d.pageIndex }
            })
            .filter((p) => p.chatHistory.length > 0)

        // Extract uploaded images
        const imageEntries: ImageEntry[] = nodes
            .filter((n) => n.type === 'imageNode')
            .map((n) => {
                const d = n.data as unknown as ImageNodeData
                return { imageDataUrl: d.imageDataUrl, imageName: d.imageName ?? 'Image', pageIndex: d.pageIndex }
            })
            .filter((img) => !!img.imageDataUrl)

        // Extract summaries
        const summaryEntries: SummaryEntry[] = nodes
            .filter((n) => n.type === 'summaryNode')
            .map((n) => {
                const d = n.data as unknown as SummaryNodeData
                return { summary: d.summary ?? '', sourcePage: d.sourcePage ?? 1 }
            })
            .filter((s) => s.summary.trim().length > 0)

        const hasContent = qaTree.length > 0 || pageQuizzes.length > 0 ||
            stickyNotes.length > 0 || customPrompts.length > 0 ||
            imageEntries.length > 0 || summaryEntries.length > 0

        if (!hasContent) {
            showToast('Nothing to export — add some content first!')
            return
        }

        setIsGeneratingPDF(true)

        const now = new Date()
        const exportDate = now.toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        // Fetch a Gemini-generated title — send clean markdown_content, not raw_text
        let docTitle = 'Study Notes'
        if (fileData?.markdown_content) {
            try {
                const fetched = await generateTitle(fileData.markdown_content)
                if (fetched && fetched.trim().length > 0) {
                    docTitle = fetched.trim()
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err)
                console.warn('generate-title failed:', msg)
                showToast(`Title generation failed: ${msg}. Using default title.`)
                // Wait a beat so the toast is readable before the PDF downloads
                await new Promise((r) => setTimeout(r, 1500))
            }
        }

        try {
            const blob = await pdf(
                <StudyNotePDF
                    qaTree={qaTree}
                    pageQuizzes={pageQuizzes}
                    stickyNotes={stickyNotes}
                    customPrompts={customPrompts}
                    images={imageEntries}
                    summaries={summaryEntries}
                    filename={fileData?.filename ?? 'Document'}
                    exportDate={exportDate}
                    totalQuestions={qaTree.length}
                    title={docTitle}
                />
            ).toBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            // Use original filename (stripped of extension) + StudyCanvas suffix
            const originalName = fileData?.filename?.replace(/\.[^/.]+$/, '') ?? 'Notes'
            a.download = `${originalName}-StudyCanvas.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('PDF generation error:', err)
            showToast('Failed to generate PDF — please try again.')
        } finally {
            setIsGeneratingPDF(false)
        }
    }, [nodes, edges, fileData, showToast])

    // ── Visual export: Save this page as a screenshot PDF ──────────────────
    const handleExportCurrentPage = useCallback(async () => {
        setShowMenu(false)
        setShowRevisionMenu(false)

        if (isExportInProgress()) {
            showToast('An export is already in progress.')
            return
        }
        if (!containerRef.current) {
            showToast('Canvas not ready — please try again.')
            return
        }
        if (!pageHasContent(currentPage)) {
            showToast('This page has no annotations to export.')
            return
        }

        setIsExportingPage(true)
        setExportProgress('Preparing…')
        const abortController = new AbortController()
        exportAbortRef.current = abortController

        try {
            const originalName = fileData?.filename?.replace(/\.[^/.]+$/, '') ?? 'Notes'
            await exportCurrentPage({
                containerEl: containerRef.current,
                filenameBase: originalName,
                onProgress: (msg) => setExportProgress(msg),
                signal: abortController.signal,
                fitView,
                getViewport,
                setViewport,
            })
            showToast('Page exported successfully!')
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                showToast('Export cancelled.')
            } else {
                const msg = err instanceof Error ? err.message : String(err)
                console.error('Page export error:', err)
                showToast(`Export failed: ${msg}`)
            }
        } finally {
            setIsExportingPage(false)
            setExportProgress(null)
            exportAbortRef.current = null
        }
    }, [currentPage, fileData, showToast, fitView, getViewport, setViewport])

    // ── Visual export: Save all annotated pages as a multi-page PDF ────────
    const handleExportAllPages = useCallback(async () => {
        setShowMenu(false)
        setShowRevisionMenu(false)

        if (isExportInProgress()) {
            showToast('An export is already in progress.')
            return
        }
        if (!containerRef.current) {
            showToast('Canvas not ready — please try again.')
            return
        }

        const totalPages = pageMarkdowns.length || 1

        // Quick check: any annotated pages?
        let hasAny = false
        for (let p = 1; p <= totalPages; p++) {
            if (pageHasContent(p)) { hasAny = true; break }
        }
        if (!hasAny) {
            showToast('No pages have annotations to export.')
            return
        }

        setIsExportingAll(true)
        setExportProgress('Preparing…')
        const abortController = new AbortController()
        exportAbortRef.current = abortController

        try {
            const originalName = fileData?.filename?.replace(/\.[^/.]+$/, '') ?? 'Notes'
            await exportAllPages({
                containerEl: containerRef.current,
                filenameBase: originalName,
                onProgress: (msg) => setExportProgress(msg),
                signal: abortController.signal,
                goToPage,
                totalPages,
                currentPage,
                fitView,
                getViewport,
                setViewport,
            })
            showToast('All pages exported successfully!')
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                showToast('Export cancelled.')
            } else {
                const msg = err instanceof Error ? err.message : String(err)
                console.error('All-pages export error:', err)
                showToast(`Export failed: ${msg}`)
            }
        } finally {
            setIsExportingAll(false)
            setExportProgress(null)
            exportAbortRef.current = null
        }
    }, [pageMarkdowns.length, currentPage, fileData, goToPage, showToast, fitView, getViewport, setViewport])

    // Cancel an in-progress visual export
    const handleCancelExport = useCallback(() => {
        exportAbortRef.current?.abort()
    }, [])

    return (
        <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} className={isDarkMode ? 'dark-mode' : ''}>
            {/* Whiteboard drawing overlay */}
            <DrawingCanvas />

            <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={NODE_TYPES}
                defaultViewport={canvasViewport ?? { x: 0, y: 0, zoom: 1 }}
                onViewportChange={handleViewportChange}
                onNodesChange={(changes) => {
                    // Handle text node removal (via Backspace / Delete deleteKeyCode)
                    const removeIds = changes
                        .filter((c): c is Extract<typeof c, { type: 'remove' }> => c.type === 'remove')
                        .filter((c) => c.id.startsWith('text-'))
                        .map((c) => c.id)
                    if (removeIds.length > 0) {
                        removeIds.forEach((id) => {
                            const node = nodes.find((n) => n.id === id)
                            if (node) {
                                useCanvasStore.getState().whiteboardUndoStack.push({
                                    type: 'removeText',
                                    nodeId: id,
                                    nodeSnapshot: { ...node, data: { ...node.data } } as unknown as Record<string, unknown>,
                                })
                                useCanvasStore.setState({ whiteboardRedoStack: [] })
                            }
                        })
                        setNodes((prev) => prev.filter((n) => !removeIds.includes(n.id)))
                        persistToLocalStorage()
                        return
                    }

                    // Handle selection changes so text nodes can be selected/deselected
                    const selectChanges = changes.filter((c) => c.type === 'select')
                    if (selectChanges.length > 0) {
                        setNodes((prev) => {
                            let next = [...prev]
                            for (const change of selectChanges) {
                                if (change.type === 'select') {
                                    const idx = next.findIndex((n) => n.id === change.id)
                                    if (idx !== -1) {
                                        next[idx] = { ...next[idx], selected: change.selected }
                                    }
                                }
                            }
                            return next
                        })
                    }

                    // Apply position/selection changes without overriding our state
                    setNodes((prev) => {
                        let next = [...prev]
                        let dimensionsChanged = false
                        // Only check overlap against nodes that are currently visible
                        // (same page or pinned) to avoid false positives from other pages.
                        const currentlyVisible = prev.filter((n) => {
                            if (n.type === 'contentNode') return true
                            const d = n.data as unknown as AnswerNodeData
                            return d.isPinned === true || d.pageIndex === currentPage
                        })
                        for (const change of changes) {
                            if (change.type === 'position' && change.position) {
                                const idx = next.findIndex((n) => n.id === change.id)
                                if (idx !== -1) {
                                    // Check if the proposed position overlaps with any visible nodes
                                    if (!isOverlapping(change.id, change.position, currentlyVisible)) {
                                        next[idx] = { ...next[idx], position: change.position }
                                    }
                                }
                            }
                            if (change.type === 'dimensions' && change.dimensions) {
                                const idx = next.findIndex((n) => n.id === change.id)
                                if (idx !== -1) {
                                    next[idx] = { ...next[idx], measured: change.dimensions }
                                    dimensionsChanged = true
                                }
                            }
                        }

                        if (dimensionsChanged) {
                            const expandingIds = next
                                .filter((n) => (n.data as unknown as AnswerNodeData)?.isExpanding)
                                .map((n) => n.id)

                            if (expandingIds.length > 0) {
                                next = resolveOverlaps(next)
                                next = next.map((n) => {
                                    if (expandingIds.includes(n.id)) {
                                        return {
                                            ...n,
                                            data: { ...n.data, isExpanding: false } as unknown as Record<string, unknown>
                                        }
                                    }
                                    return n
                                })
                            }
                        }

                        return next
                    })
                }}
                onEdgesChange={(changes: EdgeChange[]) => {
                    // Only allow removal of user-created edges (prefixed with 'user-edge-')
                    const filtered = changes.filter((c) =>
                        c.type !== 'remove' || (c.id ?? '').startsWith('user-edge-')
                    )
                    if (filtered.length > 0) {
                        setEdges((prev) => applyEdgeChanges(filtered, prev))
                    }
                }}
                onConnect={onConnect}
                onConnectStart={() => document.body.classList.add('rf-connecting')}
                onConnectEnd={() => document.body.classList.remove('rf-connecting')}
                connectionMode={ConnectionMode.Loose}
                connectionLineType={ConnectionLineType.SmoothStep}
                connectionLineStyle={{ stroke: '#1E3A5F', strokeWidth: 2 }}
                fitView={false}
                zoomOnScroll={false}
                panOnScroll={false}
                panOnDrag={isCursorMode}
                nodesDraggable={isCursorMode}
                nodesConnectable={isCursorMode}
                elementsSelectable={isCursorMode || isTextMode}
                edgesFocusable={isCursorMode}
                deleteKeyCode={isCursorMode ? ['Backspace', 'Delete'] : null}
                onNodeDragStop={handleNodeDragStop}
                onPaneClick={handlePaneClick}
                onEdgeDoubleClick={(evt, edge) => {
                    evt.stopPropagation()
                    setEdges((prev) => prev.filter((e) => e.id !== edge.id))
                    persistToLocalStorage()
                }}
            >
                <Background variant={BackgroundVariant.Dots} />
                <Controls position="bottom-left">
                    <ControlButton
                        onClick={() => setIsDarkMode((d) => !d)}
                        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {isDarkMode ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.166 17.834a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 6.166a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                                <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                            </svg>
                        )}
                    </ControlButton>
                </Controls>
                <MiniMap nodeColor={nodeColor} position="bottom-right" />
            </ReactFlow>

            {/* Whiteboard toolbar */}
            <DrawingToolbar />

            {/* Left toolbar — custom nodes */}
            <LeftToolbar
                onCustomPrompt={handleSpawnCustomPrompt}
                onAddImage={handleSpawnImage}
                onStickyNote={handleSpawnStickyNote}
                onTimer={handleSpawnTimer}
                onSummary={handleSpawnSummary}
            />

            {/* Ask Gemini popup */}
            {selection && (
                <AskGeminiPopup rect={selection.rect} nodeId={selection.sourceNodeId} mousePos={selection.mousePos} onAsk={handleAsk} />
            )}

            {/* Question modal */}
            {modal && (
                <QuestionModal
                    selectedText={modal.selectedText}
                    sourceNodeId={modal.sourceNodeId}
                    preGeneratedNodeId={modal.preGeneratedNodeId}
                    onSubmit={handleModalSubmit}
                    onCancel={() => setModal(null)}
                />
            )}

            {/* Revision mode modal */}
            {showRevision && fileData && revisionSource && (
                <RevisionModal
                    nodes={nodes}
                    rawText={fileData.raw_text}
                    pdfId={fileData.pdf_id}
                    onClose={() => setShowRevision(false)}
                    sourceType={revisionSource.sourceType}
                    pageIndex={revisionSource.pageIndex - 1}
                    pageContent={revisionSource.pageContent}
                />
            )}

            {/* Tools modal */}
            {showTools && (
                <ToolsModal onClose={() => setShowTools(false)} />
            )}

            {/* Upload PDF popup */}
            {showUploadPopup && (
                <PdfUploadPopup
                    onClose={() => setShowUploadPopup(false)}
                    onUploaded={() => { /* popup closes itself; node is already created */ }}
                />
            )}

            {/* Top Left Menu */}
            <div className="fixed top-4 left-4 z-40">
                <button
                    onClick={() => { setShowMenu(!showMenu); setShowRevisionMenu(false) }}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    Menu
                </button>
                {showMenu && (
                    <div className="absolute top-full left-0 mt-2 flex flex-col gap-1 w-48 bg-white border border-gray-200 shadow-lg rounded-lg p-2">
                        {onGoHome && onSave && (
                            <button
                                onClick={async () => {
                                    setShowMenu(false)
                                    setIsSaving(true)
                                    try {
                                        await wrappedSave()
                                        setToast('Saved!')
                                        if (toastTimeout) clearTimeout(toastTimeout)
                                        toastTimeout = setTimeout(() => { setToast(null); onGoHome() }, 800)
                                    } catch {
                                        setToast('Save failed.')
                                        if (toastTimeout) clearTimeout(toastTimeout)
                                        toastTimeout = setTimeout(() => setToast(null), 3500)
                                    } finally {
                                        setIsSaving(false)
                                    }
                                }}
                                disabled={isSaving}
                                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors disabled:opacity-50"
                            >
                                <span className="flex items-center gap-1.5">
                                    {isSaving ? (
                                        <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                            <polyline points="9 22 9 12 15 12 15 22" />
                                        </svg>
                                    )}
                                    {isSaving ? 'Saving…' : 'Save & Home'}
                                </span>
                            </button>
                        )}
                        {!fileData && (
                            <button
                                onClick={() => { setShowMenu(false); setShowUploadPopup(true); }}
                                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                            >
                                <span className="flex items-center gap-1.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="12" y1="18" x2="12" y2="12" />
                                        <line x1="9" y1="15" x2="15" y2="15" />
                                    </svg>
                                    Upload PDF
                                </span>
                            </button>
                        )}
                        {onSave && (
                            <button
                                onClick={async () => {
                                    setShowMenu(false)
                                    setIsSaving(true)
                                    try {
                                        await wrappedSave()
                                        setToast('Saved!')
                                        if (toastTimeout) clearTimeout(toastTimeout)
                                        toastTimeout = setTimeout(() => setToast(null), 2500)
                                    } catch {
                                        setToast('Save failed.')
                                        if (toastTimeout) clearTimeout(toastTimeout)
                                        toastTimeout = setTimeout(() => setToast(null), 3500)
                                    } finally {
                                        setIsSaving(false)
                                    }
                                }}
                                disabled={isSaving}
                                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors disabled:opacity-50"
                            >
                                <span className="flex items-center gap-1.5">
                                    {isSaving ? (
                                        <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                            <polyline points="17 21 17 13 7 13 7 21" />
                                            <polyline points="7 3 7 8 15 8" />
                                        </svg>
                                    )}
                                    {isSaving ? 'Saving…' : 'Save'}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={() => { setShowMenu(false); setShowTools(true); }}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                        >
                            <span className="flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                Tools (Context)
                            </span>
                        </button>
                    </div>
                )}
            </div>

            {/* Top Right — Revision Menu */}
            <div className="fixed top-4 right-4 z-40">
                <button
                    onClick={() => { setShowRevisionMenu(!showRevisionMenu); setShowMenu(false) }}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Revision
                </button>
                {showRevisionMenu && (
                    <div className="absolute top-full right-0 mt-2 flex flex-col gap-1 w-56 bg-white border border-gray-200 shadow-lg rounded-lg p-2">
                        <div className="px-3 py-1 mb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Revision Mode (Quiz)</div>
                        <button
                            onClick={() => handleRevisionMode('struggling')}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                        >
                            <span className="flex items-center gap-1.5 pl-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                </svg>
                                Struggling Topics
                            </span>
                        </button>
                        <button
                            onClick={() => handleRevisionMode('page')}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                        >
                            <span className="flex items-center gap-1.5 pl-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                </svg>
                                Current Page
                            </span>
                        </button>

                        <div className="mt-2 px-3 py-1 mb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Flash Cards</div>
                        <button
                            onClick={() => handleCreateFlashCards('struggling')}
                            disabled={isGeneratingFlashcards}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isGeneratingFlashcards ? (
                                <span className="flex items-center gap-1.5 pl-2">
                                    <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Generating…
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 pl-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="5" width="20" height="14" rx="2" />
                                        <line x1="2" y1="10" x2="22" y2="10" />
                                    </svg>
                                    Struggling Topics
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => handleCreateFlashCards('page')}
                            disabled={isGeneratingFlashcards}
                            className="text-left px-3 py-2 mb-1 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <span className="flex items-center gap-1.5 pl-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="5" width="20" height="14" rx="2" />
                                </svg>
                                Current Page
                            </span>
                        </button>
                        <div className="h-px bg-gray-200 mx-1.5" />
                        <div className="px-3 py-1 mb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Export Canvas</div>
                        <button
                            onClick={handleExportCurrentPage}
                            disabled={isExportingPage || isExportingAll}
                            className="text-left px-3 py-2 hover:bg-indigo-50 rounded-md text-sm text-indigo-700 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isExportingPage ? (
                                <span className="flex items-center gap-1.5">
                                    <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Exporting…
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 pl-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <path d="M3 9h18" />
                                    </svg>
                                    Save This Page
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleExportAllPages}
                            disabled={isExportingPage || isExportingAll}
                            className="text-left px-3 py-2 hover:bg-indigo-50 rounded-md text-sm text-indigo-700 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isExportingAll ? (
                                <span className="flex items-center gap-1.5">
                                    <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Exporting…
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 pl-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <path d="M3 9h18" />
                                        <path d="M3 15h18" />
                                    </svg>
                                    Save All Pages
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={!nodes.some((n) => n.type === 'answerNode' || n.type === 'quizQuestionNode') || isGeneratingPDF}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isGeneratingPDF ? (
                                <span className="flex items-center gap-1.5">
                                    <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Generating…
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 pl-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    Save Notes (Text)
                                </span>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* PDF generation loading overlay */}
            {isGeneratingPDF && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-xl">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Generating PDF title with Gemini…
                </div>
            )}

            {/* Visual export progress overlay */}
            {(isExportingPage || isExportingAll) && exportProgress && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-xl">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    {exportProgress}
                    {isExportingAll && (
                        <button
                            onClick={handleCancelExport}
                            className="ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}

            {/* Page navigation bar — only shown when the PDF has multiple pages */}
            {pageMarkdowns.length > 1 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 shadow-md rounded-xl select-none">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => goToPage(currentPage - 1)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        ← Back
                    </button>
                    <span className="text-sm text-gray-600 font-medium min-w-[90px] text-center">
                        Page {currentPage} / {pageMarkdowns.length}
                    </span>
                    <button
                        disabled={currentPage === pageMarkdowns.length}
                        onClick={() => goToPage(currentPage + 1)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Forward →
                    </button>
                </div>
            )}

            {/* Upload hint pill — shown on fresh canvases with no PDF */}
            {!fileData && showUploadHint && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 bg-white border border-indigo-200 shadow-lg rounded-full text-sm text-gray-700 select-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    <span className="text-gray-600">Upload a PDF to get started</span>
                    <button
                        onClick={() => { setShowUploadHint(false); setShowUploadPopup(true) }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-full transition-colors"
                    >
                        Upload PDF
                    </button>
                    <button
                        onClick={() => setShowUploadHint(false)}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Dismiss"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Toast notification */}
            {toast && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    )
}
