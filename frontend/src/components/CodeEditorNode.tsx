import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CodeEditorNodeData, CodeEditorLanguage } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { EditorView } from '@codemirror/view'
import { streamCodeAssist, parseStreamChunk } from '../api/studyApi'

type CodeEditorNodeProps = NodeProps & { data: CodeEditorNodeData }

const MIN_W = 320
const MIN_H = 240

const LANGUAGE_OPTIONS: { value: CodeEditorLanguage; label: string; color: string }[] = [
    { value: 'python', label: 'Python', color: '#3776AB' },
    { value: 'java',   label: 'Java',   color: '#ED8B00' },
    { value: 'c',      label: 'C',      color: '#A8B9CC' },
]

const DEFAULT_CODE: Record<CodeEditorLanguage, string> = {
    python: '# Python\n\n',
    java: '// Java\npublic class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n',
    c: '// C\n#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
}

function getExtensions(lang: CodeEditorLanguage) {
    switch (lang) {
        case 'python': return [python()]
        case 'java':   return [java()]
        case 'c':      return [cpp()]
    }
}

function getStatusBorderColor(status?: string): string {
    if (status === 'understood') return '#27AE60'
    if (status === 'struggling') return '#EB5757'
    return '#2D9CDB'
}

/** Strip markdown code fences from AI output in case the model ignores our prompt instructions. */
function stripCodeFences(text: string): string {
    // Remove opening fence like ```python or ``` and closing ```
    return text.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '')
}

function CodeEditorNode({ id, data }: CodeEditorNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [showLangDropdown, setShowLangDropdown] = useState(false)
    const langDropdownRef = useRef<HTMLDivElement>(null)

    // ── AI assistant state ──────────────────────────────────────────────────
    const [showAiPanel, setShowAiPanel] = useState(false)
    const [aiPrompt, setAiPrompt] = useState('')
    const [isAiLoading, setIsAiLoading] = useState(false)
    // null = auto (derived from hasCode); 'write' or 'edit' = user override
    const [aiForceMode, setAiForceMode] = useState<'write' | 'edit' | null>(null)
    const aiAbortRef = useRef<AbortController | null>(null)
    const aiPanelRef = useRef<HTMLDivElement>(null)
    const aiTextareaRef = useRef<HTMLTextAreaElement>(null)

    // Keep a ref to the latest code so handleAiSubmit doesn't go stale
    // during the stream (updateNodeData changes data.code on each chunk).
    const latestCodeRef = useRef(data.code)
    latestCodeRef.current = data.code

    useEffect(() => {
        if (!showLangDropdown) return
        const handleOutside = (e: MouseEvent) => {
            if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
                setShowLangDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [showLangDropdown])

    // Close AI panel on click outside (but not when clicking within the panel/button wrapper)
    useEffect(() => {
        if (!showAiPanel) return
        const handleOutside = (e: MouseEvent) => {
            if (aiPanelRef.current && !aiPanelRef.current.contains(e.target as Node)) {
                setShowAiPanel(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [showAiPanel])

    // Close AI panel when node is minimized
    useEffect(() => {
        if (data.isMinimized) setShowAiPanel(false)
    }, [data.isMinimized])

    // Abort any in-flight AI request on unmount
    useEffect(() => {
        return () => { aiAbortRef.current?.abort() }
    }, [])

    // Auto-focus the textarea when the panel opens
    useEffect(() => {
        if (showAiPanel) {
            // Small delay ensures the element is mounted before focus
            const t = setTimeout(() => aiTextareaRef.current?.focus(), 40)
            return () => clearTimeout(t)
        }
    }, [showAiPanel])

    const [size, setSize] = useState({
        width: data.savedWidth ?? 500,
        height: data.savedHeight ?? 400,
    })

    const editorRef = useRef<ReactCodeMirrorRef>(null)

    const handleSelectAll = useCallback(() => {
        const view = editorRef.current?.view
        if (!view) return
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
        view.focus()
    }, [])

    const resizingRef = useRef<{
        handle: string
        startX: number
        startY: number
        startW: number
        startH: number
    } | null>(null)
    const currentSizeRef = useRef(size)
    currentSizeRef.current = size

    // ── Resize ──────────────────────────────────────────────────────────────
    const handleResizeMouseDown = useCallback((handle: string) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        resizingRef.current = {
            handle,
            startX: e.clientX,
            startY: e.clientY,
            startW: currentSizeRef.current.width,
            startH: currentSizeRef.current.height,
        }

        const handleMouseMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return
            const dx = ev.clientX - resizingRef.current.startX
            const dy = ev.clientY - resizingRef.current.startY
            let newW = resizingRef.current.startW
            let newH = resizingRef.current.startH
            if (handle.includes('right'))  newW += dx
            if (handle.includes('left'))   newW -= dx
            if (handle.includes('bottom')) newH += dy
            if (handle.includes('top'))    newH -= dy
            const clamped = { width: Math.max(MIN_W, newW), height: Math.max(MIN_H, newH) }
            setSize(clamped)
        }

        const handleMouseUp = () => {
            resizingRef.current = null
            updateNodeData(id, {
                savedWidth: currentSizeRef.current.width,
                savedHeight: currentSizeRef.current.height,
            })
            persistToLocalStorage()
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [id, updateNodeData, persistToLocalStorage])

    // ── Actions ─────────────────────────────────────────────────────────────
    const handleDelete = useCallback(() => {
        if (!confirmDelete) { setConfirmDelete(true); return }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])

    const handleLanguageChange = useCallback((lang: CodeEditorLanguage) => {
        const codeIsEmpty = !data.code || data.code.trim() === ''
        updateNodeData(id, {
            language: lang,
            ...(codeIsEmpty ? { code: DEFAULT_CODE[lang] } : {}),
        })
        persistToLocalStorage()
    }, [id, data.code, updateNodeData, persistToLocalStorage])

    const handleStatusToggle = useCallback((next: 'understood' | 'struggling') => {
        const newStatus = data.status === next ? 'unread' : next
        updateNodeData(id, { status: newStatus as CodeEditorNodeData['status'] })
        persistToLocalStorage()
    }, [id, data.status, updateNodeData, persistToLocalStorage])

    // Whether the editor currently has meaningful (non-default) code.
    const hasCode = Boolean(data.code && data.code.trim())
    // Resolved AI mode: user override if set, otherwise auto-detect from content.
    const effectiveMode = aiForceMode ?? (hasCode ? 'edit' : 'write')

    // ── AI code assist ───────────────────────────────────────────────────────
    const handleAiSubmit = useCallback(async () => {
        if (!aiPrompt.trim() || isAiLoading) return

        setShowAiPanel(false)
        setIsAiLoading(true)

        const controller = new AbortController()
        aiAbortRef.current = controller
        let accumulated = ''

        try {
            const response = await streamCodeAssist(
                {
                    language: data.language ?? 'python',
                    // Write mode sends empty string so the AI writes from scratch
                    code: effectiveMode === 'write' ? '' : (latestCodeRef.current ?? ''),
                    prompt: aiPrompt.trim(),
                },
                controller.signal,
            )

            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const modelUsed = response.headers.get('X-Model-Used') ?? 'gemini-3.1-flash-lite-preview'
            const reader = response.body!.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = parseStreamChunk(decoder.decode(value), 'code-assist', modelUsed)
                accumulated += chunk
                updateNodeData(id, { code: accumulated })
            }

            // Strip markdown fences if the model returned them despite instructions
            const clean = stripCodeFences(accumulated)
            if (clean !== accumulated) {
                updateNodeData(id, { code: clean })
            }

            setAiPrompt('')
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('AI code assist error:', err)
            }
        } finally {
            setIsAiLoading(false)
            aiAbortRef.current = null
            persistToLocalStorage()
        }
    }, [aiPrompt, isAiLoading, effectiveMode, data.language, id, updateNodeData, persistToLocalStorage])

    const handleAiButtonClick = useCallback(() => {
        // While loading, clicking the button cancels the in-flight request
        if (isAiLoading) {
            aiAbortRef.current?.abort()
            setIsAiLoading(false)
            return
        }
        setShowAiPanel((v) => !v)
    }, [isAiLoading])

    const extensions = useMemo(
        () => [EditorView.lineWrapping, ...getExtensions(data.language ?? 'python')],
        [data.language],
    )
    const borderColor = getStatusBorderColor(data.status)

    return (
        <div
            data-nodeid={id}
            className="rounded-lg shadow-lg border border-gray-700 relative flex flex-col overflow-hidden"
            style={{
                width: size.width,
                height: data.isMinimized ? 'auto' : size.height,
                borderTop: `4px solid ${borderColor}`,
                backgroundColor: '#1a1a2e',
            }}
        >
            {/* ── Resize handles (8: 4 corners + 4 edges) ── */}
            {!data.isMinimized && (
                <>
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-left')} />
                    <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top-right')} />
                    <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-left')} />
                    <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom-right')} />
                    {/* Edges */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1.5 cursor-n-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('top')} />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1.5 cursor-s-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('bottom')} />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 cursor-w-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('left')} />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-10 cursor-e-resize z-10 nodrag" onMouseDown={handleResizeMouseDown('right')} />
                </>
            )}

            {/* ── Top Toolbar ── */}
            <div className="flex items-center justify-between px-2 py-2 shrink-0 border-b border-gray-700" style={{ backgroundColor: '#0f0f1a' }}>
                {/* Left: icon + label + language selector */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase shrink-0">Code</span>

                    <div className="w-px h-3.5 bg-gray-700 mx-0.5 shrink-0" />

                    {data.isMinimized ? (
                        /* Show title when minimized */
                        <span className="text-xs text-gray-300 truncate max-w-[180px]">
                            {data.title?.trim() || 'Untitled snippet'}
                        </span>
                    ) : (
                        <>
                            {/* Understood (tick) */}
                            <button
                                title="Mark as understood"
                                onClick={() => handleStatusToggle('understood')}
                                className={`p-1 rounded-md transition-colors ${data.status === 'understood' ? 'text-green-400 bg-green-900/40' : 'text-gray-500 hover:text-green-400 hover:bg-green-900/30'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>

                            {/* Struggling (cross) */}
                            <button
                                title="Mark as struggling"
                                onClick={() => handleStatusToggle('struggling')}
                                className={`p-1 rounded-md transition-colors ${data.status === 'struggling' ? 'text-red-400 bg-red-900/40' : 'text-gray-500 hover:text-red-400 hover:bg-red-900/30'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            <div className="w-px h-3.5 bg-gray-700 mx-0.5" />

                            {/* Language dropdown — custom pill */}
                            <div ref={langDropdownRef} className="relative ml-1 nodrag nopan">
                        {(() => {
                            const active = LANGUAGE_OPTIONS.find((o) => o.value === (data.language ?? 'python')) ?? LANGUAGE_OPTIONS[0]
                            return (
                                <button
                                    type="button"
                                    onClick={() => setShowLangDropdown((v) => !v)}
                                    className="nodrag nopan flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-full border border-gray-600/70 bg-gray-800/80 hover:bg-gray-700 hover:border-gray-500 transition-all duration-150 cursor-pointer"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
                                    <span className="text-[10px] font-semibold text-gray-200 tracking-wide">{active.label}</span>
                                    <svg className={`w-2.5 h-2.5 text-gray-500 transition-transform duration-150 ${showLangDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )
                        })()}

                        {showLangDropdown && (
                            <div className="absolute left-0 top-full mt-1 z-50 min-w-[90px] rounded-lg border border-gray-600/80 shadow-xl overflow-hidden" style={{ backgroundColor: '#0d0d1f' }}>
                                {LANGUAGE_OPTIONS.map((opt) => {
                                    const isActive = (data.language ?? 'python') === opt.value
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => { handleLanguageChange(opt.value); setShowLangDropdown(false) }}
                                            className={`nodrag nopan w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors duration-100 ${isActive ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                            style={isActive ? { backgroundColor: `${opt.color}22` } : {}}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                                            {opt.label}
                                            {isActive && (
                                                <svg className="ml-auto w-3 h-3" style={{ color: opt.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                        </>
                    )}
                </div>

                {/* Right: pin + delete + minimize */}
                <div className="flex items-center gap-0.5">
                    {/* Pin */}
                    <button
                        title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`p-1 rounded-md transition-colors ${data.isPinned ? 'text-cyan-400 bg-cyan-900/40' : 'text-gray-500 hover:text-cyan-400 hover:bg-gray-700'}`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={data.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                            <path d="M9 15l-4.5 4.5" />
                            <path d="M14.5 9l1 1" />
                        </svg>
                    </button>

                    {/* Delete (2-step) */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-0.5" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-red-400 font-semibold whitespace-nowrap">Delete?</span>
                            <button title="Confirm delete" onClick={handleDelete} className="p-1 text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button title="Cancel" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-700 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button title="Delete node" onClick={handleDelete} className="p-1 text-gray-500 hover:text-red-400 rounded-md hover:bg-gray-700 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    {/* Minimize */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimize'}
                        onClick={() => { updateNodeData(id, { isMinimized: !data.isMinimized }); persistToLocalStorage() }}
                        className="p-1 text-gray-500 hover:text-gray-200 rounded-md hover:bg-gray-700 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {data.isMinimized
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            }
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Body (hidden when minimized) ── */}
            {!data.isMinimized && (
                <>
                    {/* Title input */}
                    <div className="px-3 py-1.5 border-b border-gray-700 shrink-0" style={{ backgroundColor: '#12122a' }}>
                        <input
                            type="text"
                            value={data.title ?? ''}
                            onChange={(e) => updateNodeData(id, { title: e.target.value })}
                            onBlur={() => persistToLocalStorage()}
                            placeholder="Untitled snippet…"
                            className="nodrag nopan w-full bg-transparent text-white text-sm font-medium placeholder-gray-600 outline-none border-none"
                        />
                    </div>

                    {/* Scoped CSS: scrollbar on the native-scroll wrapper */}
                    <style>{`
                        [data-nodeid="${id}"] .code-scroll { scrollbar-width: thin; scrollbar-color: #6B7280 #1a1a2e; }
                        [data-nodeid="${id}"] .code-scroll::-webkit-scrollbar { width: 8px; }
                        [data-nodeid="${id}"] .code-scroll::-webkit-scrollbar-track { background: #1a1a2e; }
                        [data-nodeid="${id}"] .code-scroll::-webkit-scrollbar-thumb { background: #6B7280; border-radius: 4px; }
                        [data-nodeid="${id}"] .code-scroll::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
                        [data-nodeid="${id}"] .cm-scroller { overflow: hidden !important; }
                        [data-nodeid="${id}"] .cm-editor { min-height: 100%; }
                        [data-nodeid="${id}"] .cm-gutters { padding-left: 8px; }
                        [data-nodeid="${id}"] .cm-content { padding-bottom: 20px; }
                    `}</style>

                    {/* Browser-native scroll wrapper — identical pattern to AnswerNode/SummaryNode.
                        CodeMirror runs in auto-height mode (no height prop), so it grows with
                        content. The wrapper div clips it and provides the native scrollbar. */}
                    <div className="flex-1 relative min-h-0">
                        <div
                            className="code-scroll absolute inset-0 overflow-y-auto nodrag nopan nowheel"
                            onWheelCapture={(e) => e.stopPropagation()}
                        >
                            <CodeMirror
                                ref={editorRef}
                                value={data.code ?? ''}
                                extensions={extensions}
                                onChange={(value) => updateNodeData(id, { code: value })}
                                onBlur={() => persistToLocalStorage()}
                                theme="dark"
                                basicSetup={{
                                    lineNumbers: true,
                                    highlightActiveLineGutter: true,
                                    foldGutter: false,
                                    autocompletion: true,
                                    bracketMatching: true,
                                    indentOnInput: true,
                                    syntaxHighlighting: true,
                                    highlightActiveLine: true,
                                }}
                                className="nodrag nopan"
                                style={{ fontSize: 13 }}
                            />
                        </div>

                        {/* Select-all button — floats top-right inside editor */}
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            title="Select all code (then copy to ask Gemini)"
                            className="nodrag nopan absolute top-1.5 right-2 z-10 flex items-center justify-center p-1 rounded text-gray-500 bg-gray-800/60 border border-gray-700/50 opacity-40 hover:opacity-100 hover:text-gray-200 hover:bg-gray-700 transition-all duration-150 select-none"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                            </svg>
                        </button>

                        {/* AI loading shimmer — thin animated bar at the top of the editor */}
                        {isAiLoading && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden">
                                <div
                                    className="h-full animate-pulse"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent 0%, #2D9CDB 50%, transparent 100%)',
                                        animation: 'ai-scan 1.4s ease-in-out infinite',
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── AI Code Assistant button + popup ────────────────────────────────
                Positioned absolute within the root div (which is `relative`) so the
                popup is never clipped by the editor's overflow-hidden container.    */}
            {!data.isMinimized && (
                <div
                    ref={aiPanelRef}
                    className="absolute bottom-3 right-3 z-30"
                >
                    {/* Popup — appears above the button */}
                    {showAiPanel && (
                        <div
                            className="absolute right-0 nodrag nopan"
                            style={{ bottom: 'calc(100% + 8px)', width: 272 }}
                        >
                            <div
                                className="rounded-xl border border-gray-700/80 shadow-2xl flex flex-col overflow-hidden"
                                style={{ backgroundColor: '#0d0d1f' }}
                            >
                                {/* Panel header */}
                                <div
                                    className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 shrink-0"
                                    style={{ backgroundColor: '#12122a' }}
                                >
                                    <div className="flex items-center gap-2">
                                        {/* Sparkles icon */}
                                        <svg className="w-3.5 h-3.5 shrink-0" style={{ color: '#2D9CDB' }} viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                                        </svg>
                                        <span className="text-xs font-semibold" style={{ color: '#2D9CDB' }}>AI Code Assistant</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {/* Write / Edit mode badge — click to toggle */}
                                        <button
                                            type="button"
                                            title={effectiveMode === 'edit' ? 'Switch to Write mode' : 'Switch to Edit mode'}
                                            onClick={() => setAiForceMode(effectiveMode === 'edit' ? 'write' : 'edit')}
                                            className="nodrag nopan text-[9px] px-1.5 py-0.5 rounded-full border font-semibold tracking-wide transition-all duration-150 hover:brightness-125 active:scale-95 cursor-pointer"
                                            style={effectiveMode === 'edit'
                                                ? { borderColor: '#F2994A50', color: '#F2994A', backgroundColor: '#F2994A12' }
                                                : { borderColor: '#2D9CDB50', color: '#2D9CDB', backgroundColor: '#2D9CDB12' }
                                            }
                                        >
                                            {effectiveMode === 'edit' ? 'EDIT' : 'WRITE'}
                                        </button>
                                        <button
                                            type="button"
                                            title="Close AI panel"
                                            onClick={() => setShowAiPanel(false)}
                                            className="p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Prompt textarea + submit */}
                                <div className="p-2.5 flex flex-col gap-2">
                                    <textarea
                                        ref={aiTextareaRef}
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        onKeyDown={(e) => {
                                            // Ctrl+Enter or Cmd+Enter submits
                                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                                e.preventDefault()
                                                handleAiSubmit()
                                            }
                                            // Stop keydown from bubbling to canvas (e.g. Delete key)
                                            e.stopPropagation()
                                        }}
                                        placeholder={hasCode
                                            ? 'Describe what to change or fix…'
                                            : 'What should I write? (e.g. binary search in Python)'
                                        }
                                        rows={3}
                                        className="nodrag nopan w-full text-xs text-white placeholder-gray-600 rounded-lg p-2 resize-none border focus:outline-none transition-colors"
                                        style={{
                                            backgroundColor: '#1a1a2e',
                                            borderColor: '#374151',
                                            minHeight: 68,
                                        }}
                                        onFocus={(e) => { e.currentTarget.style.borderColor = '#2D9CDB' }}
                                        onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
                                    />
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-gray-600 select-none">⌃↵ to send</span>
                                        <button
                                            type="button"
                                            onClick={handleAiSubmit}
                                            disabled={!aiPrompt.trim()}
                                            className="nodrag nopan px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-95"
                                            style={{ backgroundColor: '#2D9CDB' }}
                                        >
                                            Generate
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AI trigger button */}
                    <button
                        type="button"
                        title={isAiLoading ? 'Cancel AI generation' : 'AI Code Assistant'}
                        onClick={handleAiButtonClick}
                        className="nodrag nopan w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all duration-150 hover:brightness-110 hover:scale-105 active:scale-95"
                        style={{
                            backgroundColor: showAiPanel ? '#1a7aaa' : '#2D9CDB',
                            boxShadow: showAiPanel
                                ? '0 0 0 2px #2D9CDB40, 0 4px 12px #2D9CDB30'
                                : '0 4px 12px #2D9CDB30',
                        }}
                    >
                        {isAiLoading ? (
                            /* Cancel / loading spinner */
                            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            /* Sparkles icon */
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                            </svg>
                        )}
                    </button>
                </div>
            )}

            {/* ReactFlow Handles */}
            <Handle type="source" position={Position.Top}    id="top"    className="!w-3 !h-3 !border-2 !border-gray-800 hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !border-2 !border-gray-800 hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Left}   id="left"   className="!w-3 !h-3 !border-2 !border-gray-800 hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
            <Handle type="source" position={Position.Right}  id="right"  className="!w-3 !h-3 !border-2 !border-gray-800 hover:!scale-125 !transition-transform" style={{ backgroundColor: borderColor }} />
        </div>
    )
}

export default memo(CodeEditorNode)
