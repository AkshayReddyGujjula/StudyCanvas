import { useState, useCallback, useEffect, useRef } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
    useReactFlow,
    type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ContentNode from './ContentNode'
import AnswerNode from './AnswerNode'
import AskGeminiPopup from './AskGeminiPopup'
import QuestionModal from './QuestionModal'
import RevisionModal from './RevisionModal'
import ToolsModal from './ToolsModal'
import { useTextSelection } from '../hooks/useTextSelection'
import { useCanvasStore } from '../store/canvasStore'
import { streamQuery, generateTitle } from '../api/studyApi'
import { getNewNodePosition, recalculateSiblingPositions, resolveOverlaps, isOverlapping } from '../utils/positioning'
import type { AnswerNodeData } from '../types'
import { pdf } from '@react-pdf/renderer'
import { buildQATree } from '../utils/buildQATree'
import StudyNotePDF from './StudyNotePDF'

const NODE_TYPES = {
    contentNode: ContentNode,
    answerNode: AnswerNode,
}

const STATUS_COLORS: Record<string, string> = {
    loading: '#9ca3af',
    unread: '#3b82f6',
    understood: '#22c55e',
    struggling: '#ef4444',
}

interface SelectionState {
    selectedText: string
    sourceNodeId: string
    rect: DOMRect
}

interface ModalState {
    selectedText: string
    sourceNodeId: string
    preGeneratedNodeId: string
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null

export default function Canvas({ onReset }: { onReset?: () => void }) {
    const { setCenter, getZoom, fitView } = useReactFlow()
    const [selection, setSelection] = useState<SelectionState | null>(null)
    const [modal, setModal] = useState<ModalState | null>(null)
    const [showRevision, setShowRevision] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [showTools, setShowTools] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
    const streamingNodesRef = useRef<Set<string>>(new Set())

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

    // Find the contentNode id
    const contentNode = nodes.find((n) => n.type === 'contentNode')
    const contentNodeId = contentNode?.id ?? ''

    // MiniMap node color function
    const nodeColor = useCallback((node: Node) => {
        if (node.type === 'contentNode') return '#6366f1'
        const status = (node.data as unknown as AnswerNodeData)?.status
        return STATUS_COLORS[status] ?? '#3b82f6'
    }, [])

    // Text selection hook
    const handleSelection = useCallback((result: SelectionState | null) => {
        setSelection(result)
    }, [])
    useTextSelection(handleSelection)

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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (document.activeElement as HTMLElement)?.tagName
            if (e.key === 'F' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
                fitView({ duration: 400 })
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [fitView])

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

            // Calculate new node position
            const { x, y, sourceHandle, targetHandle } = getNewNodePosition(
                sourceNodeId,
                nodes,
                contentNodeId
            )

            // Create the Answer Node
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
                style: { strokeDasharray: '5,5', stroke: '#6366f1', strokeWidth: 2 },
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
                    })
                }

                // Stream complete — Phase 3
                updateNodeData(preGeneratedNodeId, {
                    isStreaming: false,
                    status: 'unread',
                })

                // Update edge to solid
                setEdges((prev) =>
                    prev.map((e) =>
                        e.id === `edge-${sourceNodeId}-${preGeneratedNodeId}`
                            ? {
                                ...e,
                                animated: false,
                                style: { stroke: '#6366f1', strokeWidth: 2 },
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

    // Post-stream correction: re-run Y-position calc after streaming completes
    useEffect(() => {
        const streamingNode = nodes.find((n) => {
            const d = n.data as unknown as AnswerNodeData
            return d?.isStreaming === false && streamingNodesRef.current.has(n.id)
        })
        if (!streamingNode || !contentNodeId) return

        const side =
            streamingNode.position.x > (contentNode?.position.x ?? 0) ? 'right' : 'left'
        const corrected = recalculateSiblingPositions(nodes, streamingNode.id, side, contentNodeId)
        setNodes(corrected)
    }, [nodes, contentNodeId, contentNode, setNodes])

    // Revision mode
    const handleRevisionMode = useCallback(() => {
        const strugglingNodes = nodes.filter(
            (n) => n.type === 'answerNode' && (n.data as unknown as AnswerNodeData).status === 'struggling'
        )
        if (strugglingNodes.length === 0) {
            showToast("Mark some nodes as 'Struggling' first to generate a targeted quiz.")
            return
        }
        setShowRevision(true)
    }, [nodes, showToast])

    // Download Q&A as a PDF
    const handleDownloadPDF = useCallback(async () => {
        setShowMenu(false)
        const qaTree = buildQATree(nodes, edges)
        if (qaTree.length === 0) {
            showToast('No questions yet — ask Gemini something first!')
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

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={(changes) => {
                    // Apply position/selection changes without overriding our state
                    setNodes((prev) => {
                        let next = [...prev]
                        let dimensionsChanged = false
                        for (const change of changes) {
                            if (change.type === 'position' && change.position) {
                                const idx = next.findIndex((n) => n.id === change.id)
                                if (idx !== -1) {
                                    // Check if the proposed position overlaps with any existing nodes
                                    if (!isOverlapping(change.id, change.position, prev)) {
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
                onEdgesChange={() => {
                    // Edges are not user-deletable in MVP — no-op
                }}
                fitView={false}
                nodesDraggable
                nodesConnectable={false}
                edgesFocusable={false}
                deleteKeyCode={null}
            >
                <Background variant={BackgroundVariant.Dots} />
                <Controls position="bottom-left" />
                <MiniMap nodeColor={nodeColor} position="bottom-right" />
            </ReactFlow>

            {/* Ask Gemini popup */}
            {selection && (
                <AskGeminiPopup rect={selection.rect} onAsk={handleAsk} />
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
            {showRevision && fileData && (
                <RevisionModal
                    nodes={nodes}
                    rawText={fileData.raw_text}
                    onClose={() => setShowRevision(false)}
                />
            )}

            {/* Tools modal */}
            {showTools && (
                <ToolsModal onClose={() => setShowTools(false)} />
            )}

            {/* Top Left Menu */}
            <div className="fixed top-4 left-4 z-40">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                    ☰ Menu
                </button>
                {showMenu && (
                    <div className="absolute top-full left-0 mt-2 flex flex-col gap-1 w-48 bg-white border border-gray-200 shadow-lg rounded-lg p-2">
                        {onReset && (
                            <button
                                onClick={() => { setShowMenu(false); onReset(); }}
                                className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                            >
                                ↩ Upload new PDF
                            </button>
                        )}
                        <button
                            onClick={() => { setShowMenu(false); handleRevisionMode(); }}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                        >
                            📝 Revision Mode
                        </button>
                        <button
                            onClick={() => { setShowMenu(false); setShowTools(true); }}
                            className="text-left px-3 py-2 hover:bg-gray-100 rounded-md text-sm text-gray-700 transition-colors"
                        >
                            ⚙️ Tools (Context)
                        </button>
                        <div style={{ height: 1, backgroundColor: '#e5e7eb', margin: '4px 6px' }} />
                        <button
                            onClick={handleDownloadPDF}
                            disabled={!nodes.some((n) => n.type === 'answerNode') || isGeneratingPDF}
                            className="text-left px-3 py-2 hover:bg-indigo-50 rounded-md text-sm text-indigo-700 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isGeneratingPDF ? '⏳ Generating...' : '💾 Save Notes (PDF)'}
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

            {/* Toast notification */}
            {toast && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    )
}
