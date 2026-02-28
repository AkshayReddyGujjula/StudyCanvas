import { useState, useCallback, useRef, useEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { WhiteboardTool, EraserMode, PenSettings } from '../../types'
import ColorPicker from './ColorPicker'

type ToolPanel = 'pen1' | 'pen2' | 'highlighter' | 'eraser' | 'text' | null

export default function DrawingToolbar() {
    const [openPanel, setOpenPanel] = useState<ToolPanel>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)

    const activeTool = useCanvasStore((s) => s.activeTool)
    const setActiveTool = useCanvasStore((s) => s.setActiveTool)
    const toolSettings = useCanvasStore((s) => s.toolSettings)
    const setToolSettings = useCanvasStore((s) => s.setToolSettings)
    const whiteboardUndo = useCanvasStore((s) => s.whiteboardUndo)
    const whiteboardRedo = useCanvasStore((s) => s.whiteboardRedo)
    const whiteboardUndoStack = useCanvasStore((s) => s.whiteboardUndoStack)
    const whiteboardRedoStack = useCanvasStore((s) => s.whiteboardRedoStack)
    const currentPage = useCanvasStore((s) => s.currentPage)
    const clearStrokesForPage = useCanvasStore((s) => s.clearStrokesForPage)

    const selectTool = useCallback((tool: WhiteboardTool) => {
        if (activeTool === tool && tool !== 'cursor') {
            // Toggle panel open/close if clicking already-active tool
            setOpenPanel((prev) => (prev === tool ? null : tool as ToolPanel))
        } else {
            setActiveTool(tool)
            // Close panel when switching to a different tool
            setOpenPanel(null)
        }
    }, [activeTool, setActiveTool])

    // Close panel when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                setOpenPanel(null)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Sync panel state when tool changes programmatically (e.g. text → cursor after placement)
    useEffect(() => {
        if (activeTool === 'cursor') {
            setOpenPanel(null)
        }
    }, [activeTool])

    const handlePenColorChange = useCallback((pen: 'pen1' | 'pen2', color: string) => {
        const current = toolSettings[pen]
        setToolSettings({ [pen]: { ...current, color } } as Partial<typeof toolSettings>)
    }, [toolSettings, setToolSettings])

    const handlePenWidthChange = useCallback((pen: 'pen1' | 'pen2', width: number) => {
        const current = toolSettings[pen]
        setToolSettings({ [pen]: { ...current, width } } as Partial<typeof toolSettings>)
    }, [toolSettings, setToolSettings])

    const handleHighlighterColorChange = useCallback((color: string) => {
        setToolSettings({ highlighter: { ...toolSettings.highlighter, color } })
    }, [toolSettings, setToolSettings])

    const handleHighlighterWidthChange = useCallback((width: number) => {
        setToolSettings({ highlighter: { ...toolSettings.highlighter, width } })
    }, [toolSettings, setToolSettings])

    const handleHighlighterOpacityChange = useCallback((opacity: number) => {
        setToolSettings({ highlighter: { ...toolSettings.highlighter, opacity } })
    }, [toolSettings, setToolSettings])

    const handleEraserWidthChange = useCallback((width: number) => {
        setToolSettings({ eraser: { ...toolSettings.eraser, width } })
    }, [toolSettings, setToolSettings])

    const handleEraserModeChange = useCallback((mode: EraserMode) => {
        setToolSettings({ eraser: { ...toolSettings.eraser, mode } })
    }, [toolSettings, setToolSettings])

    const handleTextFontSizeChange = useCallback((fontSize: number) => {
        setToolSettings({ text: { ...toolSettings.text, fontSize } })
    }, [toolSettings, setToolSettings])

    const handleTextColorChange = useCallback((color: string) => {
        setToolSettings({ text: { ...toolSettings.text, color } })
    }, [toolSettings, setToolSettings])

    const handleClearPage = useCallback(() => {
        if (window.confirm('Clear all drawings on this page? This can be undone with Ctrl+Z.')) {
            clearStrokesForPage(currentPage)
        }
    }, [currentPage, clearStrokesForPage])

    const toolBtnClass = (tool: WhiteboardTool) =>
        `relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 ${
            activeTool === tool
                ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-400 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
        }`

    return (
        <div ref={toolbarRef} className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex items-start gap-2">
            {/* Sub-panel (appears to the left of toolbar) */}
            {openPanel && (
                <div
                    className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg p-3 min-w-[200px] max-w-[240px] select-none"
                    style={{ marginRight: 4 }}
                >
                    {/* Pen 1 settings */}
                    {openPanel === 'pen1' && (
                        <PenPanel
                            label="Pen 1"
                            settings={toolSettings.pen1}
                            onColorChange={(c) => handlePenColorChange('pen1', c)}
                            onWidthChange={(w) => handlePenWidthChange('pen1', w)}
                        />
                    )}
                    {/* Pen 2 settings */}
                    {openPanel === 'pen2' && (
                        <PenPanel
                            label="Pen 2"
                            settings={toolSettings.pen2}
                            onColorChange={(c) => handlePenColorChange('pen2', c)}
                            onWidthChange={(w) => handlePenWidthChange('pen2', w)}
                        />
                    )}
                    {/* Highlighter settings */}
                    {openPanel === 'highlighter' && (
                        <div className="flex flex-col gap-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Highlighter</div>
                            <ColorPicker currentColor={toolSettings.highlighter.color} onColorChange={handleHighlighterColorChange} />
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Width: {toolSettings.highlighter.width}px</label>
                                <input type="range" min={5} max={50} step={1}
                                    value={toolSettings.highlighter.width}
                                    onChange={(e) => handleHighlighterWidthChange(Number(e.target.value))}
                                    className="w-full accent-blue-500" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Opacity: {Math.round(toolSettings.highlighter.opacity * 100)}%</label>
                                <input type="range" min={10} max={80} step={5}
                                    value={Math.round(toolSettings.highlighter.opacity * 100)}
                                    onChange={(e) => handleHighlighterOpacityChange(Number(e.target.value) / 100)}
                                    className="w-full accent-blue-500" />
                            </div>
                        </div>
                    )}
                    {/* Eraser settings */}
                    {openPanel === 'eraser' && (
                        <div className="flex flex-col gap-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Eraser</div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Size: {toolSettings.eraser.width}px</label>
                                <input type="range" min={5} max={50} step={1}
                                    value={toolSettings.eraser.width}
                                    onChange={(e) => handleEraserWidthChange(Number(e.target.value))}
                                    className="w-full accent-blue-500" />
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1.5">Mode</div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleEraserModeChange('stroke')}
                                        className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                                            toolSettings.eraser.mode === 'stroke'
                                                ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        Stroke
                                    </button>
                                    <button
                                        onClick={() => handleEraserModeChange('area')}
                                        className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                                            toolSettings.eraser.mode === 'area'
                                                ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        Area
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    {toolSettings.eraser.mode === 'stroke'
                                        ? 'Removes entire stroke on contact'
                                        : 'Removes only the touched area'}
                                </p>
                            </div>
                        </div>
                    )}
                    {/* Text settings */}
                    {openPanel === 'text' && (
                        <div className="flex flex-col gap-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Text</div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Font Size: {toolSettings.text.fontSize}px</label>
                                <input type="range" min={8} max={72} step={1}
                                    value={toolSettings.text.fontSize}
                                    onChange={(e) => handleTextFontSizeChange(Number(e.target.value))}
                                    className="w-full accent-blue-500" />
                            </div>
                            <ColorPicker currentColor={toolSettings.text.color} onColorChange={handleTextColorChange} />
                            <p className="text-[10px] text-gray-400">
                                Click on the canvas to place text. Double-click to edit.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Main vertical toolbar */}
            <div className="flex flex-col gap-1 p-1.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg select-none">
                {/* Cursor */}
                <button onClick={() => selectTool('cursor')} className={toolBtnClass('cursor')} title="Cursor (select & move)">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                        <path d="M13 13l6 6" />
                    </svg>
                </button>

                <div className="h-px bg-gray-200 mx-1" />

                {/* Pen 1 */}
                <button onClick={() => selectTool('pen1')} className={toolBtnClass('pen1')} title="Pen 1">
                    <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ backgroundColor: toolSettings.pen1.color }} />
                    </div>
                </button>

                {/* Pen 2 */}
                <button onClick={() => selectTool('pen2')} className={toolBtnClass('pen2')} title="Pen 2">
                    <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ backgroundColor: toolSettings.pen2.color }} />
                    </div>
                </button>

                {/* Highlighter */}
                <button onClick={() => selectTool('highlighter')} className={toolBtnClass('highlighter')} title="Highlighter">
                    <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l-6 6v3h9l3-3" />
                            <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                        </svg>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white" style={{ backgroundColor: toolSettings.highlighter.color, opacity: toolSettings.highlighter.opacity }} />
                    </div>
                </button>

                <div className="h-px bg-gray-200 mx-1" />

                {/* Eraser */}
                <button onClick={() => selectTool('eraser')} className={toolBtnClass('eraser')} title="Eraser">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L13.4 2.8c.8-.8 2-.8 2.8 0L21 7.6c.8.8.8 2 0 2.8L16 15" />
                        <path d="M6 11l4 4" />
                    </svg>
                </button>

                {/* Text */}
                <button onClick={() => selectTool('text')} className={toolBtnClass('text')} title="Text">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 7 4 4 20 4 20 7" />
                        <line x1="9" y1="20" x2="15" y2="20" />
                        <line x1="12" y1="4" x2="12" y2="20" />
                    </svg>
                </button>

                <div className="h-px bg-gray-200 mx-1" />

                {/* Undo */}
                <button
                    onClick={whiteboardUndo}
                    disabled={whiteboardUndoStack.length === 0}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo (Ctrl+Z)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                </button>

                {/* Redo */}
                <button
                    onClick={whiteboardRedo}
                    disabled={whiteboardRedoStack.length === 0}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
                    </svg>
                </button>

                <div className="h-px bg-gray-200 mx-1" />

                {/* Clear page drawings */}
                <button
                    onClick={handleClearPage}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="Clear all drawings on this page"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>
        </div>
    )
}

// ── Sub-panel for pen settings ─────────────────────────────────────────────
function PenPanel({
    label,
    settings,
    onColorChange,
    onWidthChange,
}: {
    label: string
    settings: PenSettings
    onColorChange: (color: string) => void
    onWidthChange: (width: number) => void
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
            <ColorPicker currentColor={settings.color} onColorChange={onColorChange} />
            <div>
                <label className="text-xs text-gray-500 mb-1 block">Width: {settings.width}px</label>
                <input type="range" min={1} max={20} step={1}
                    value={settings.width}
                    onChange={(e) => onWidthChange(Number(e.target.value))}
                    className="w-full accent-blue-500" />
            </div>
            {/* Stroke preview */}
            <div className="flex items-center justify-center p-2 bg-gray-50 rounded-lg">
                <svg width="140" height="24" className="overflow-visible">
                    <path
                        d="M 10,12 Q 40,4 70,12 T 130,12"
                        fill="none"
                        stroke={settings.color}
                        strokeWidth={settings.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
        </div>
    )
}
