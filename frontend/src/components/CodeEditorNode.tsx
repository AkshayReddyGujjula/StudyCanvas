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

function CodeEditorNode({ id, data }: CodeEditorNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [showLangDropdown, setShowLangDropdown] = useState(false)
    const langDropdownRef = useRef<HTMLDivElement>(null)

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
    // Track current size in ref to avoid stale closure in mouseup
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

    const extensions = useMemo(() => getExtensions(data.language ?? 'python'), [data.language])
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
            <div className="flex items-center justify-between px-2 py-1 shrink-0 border-b border-gray-700" style={{ backgroundColor: '#0f0f1a' }}>
                {/* Left: icon + label + language selector */}
                <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">Code</span>

                    <div className="w-px h-3.5 bg-gray-700 mx-0.5" />

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
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

                    {/* CodeMirror editor */}
                    <div
                        className="flex-1 overflow-hidden relative"
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
                            className="nodrag nopan h-full"
                            style={{ fontSize: 13, height: '100%' }}
                        />

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
                    </div>
                </>
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
