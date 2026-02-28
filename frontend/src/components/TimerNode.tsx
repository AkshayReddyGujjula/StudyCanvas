import { useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { TimerNodeData, TimerMode } from '../types'
import { TIMER_DURATIONS } from '../types'
import { useCanvasStore } from '../store/canvasStore'

type TimerNodeProps = NodeProps & { data: TimerNodeData }

const MODE_LABELS: Record<TimerMode, string> = {
    pomodoro: 'Focus',
    shortBreak: 'Short Break',
    longBreak: 'Long Break',
}

const MODE_COLORS: Record<TimerMode, { bg: string; border: string; text: string; button: string }> = {
    pomodoro: { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B', button: '#EF4444' },
    shortBreak: { bg: '#F0FDF4', border: '#86EFAC', text: '#166534', button: '#22C55E' },
    longBreak: { bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF', button: '#3B82F6' },
}

export default function TimerNode({ id, data }: TimerNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Editable time fields (only when paused)
    const [editingMinutes, setEditingMinutes] = useState(false)
    const [editingSeconds, setEditingSeconds] = useState(false)
    const [editMin, setEditMin] = useState('')
    const [editSec, setEditSec] = useState('')
    const minInputRef = useRef<HTMLInputElement>(null)
    const secInputRef = useRef<HTMLInputElement>(null)

    // Get effective durations (custom or default)
    const getModeDuration = useCallback((mode: TimerMode) => {
        return data.customDurations?.[mode] ?? TIMER_DURATIONS[mode]
    }, [data.customDurations])

    // Timer tick logic
    useEffect(() => {
        if (data.isRunning && data.remaining > 0) {
            intervalRef.current = setInterval(() => {
                const store = useCanvasStore.getState()
                const node = store.nodes.find((n) => n.id === id)
                if (!node) return
                const d = node.data as unknown as TimerNodeData
                if (!d.isRunning || d.remaining <= 0) return
                const newRemaining = d.remaining - 1
                if (newRemaining <= 0) {
                    const isPomodoro = d.mode === 'pomodoro'
                    const newSessions = isPomodoro ? d.sessionsCompleted + 1 : d.sessionsCompleted
                    let nextMode: TimerMode = 'pomodoro'
                    if (isPomodoro) {
                        nextMode = newSessions % 4 === 0 ? 'longBreak' : 'shortBreak'
                    }
                    const nextDuration = d.customDurations?.[nextMode] ?? TIMER_DURATIONS[nextMode]
                    store.updateNodeData(id, {
                        remaining: 0,
                        isRunning: false,
                        sessionsCompleted: newSessions,
                        mode: nextMode,
                        duration: nextDuration,
                    })
                    setTimeout(() => {
                        store.updateNodeData(id, { remaining: nextDuration })
                        store.persistToLocalStorage()
                    }, 100)
                } else {
                    store.updateNodeData(id, { remaining: newRemaining })
                }
            }, 1000)
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [data.isRunning, data.remaining, id])

    // Persist periodically while timer running
    useEffect(() => {
        if (!data.isRunning) return
        const persist = setInterval(() => persistToLocalStorage(), 10000)
        return () => clearInterval(persist)
    }, [data.isRunning, persistToLocalStorage])

    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        if (intervalRef.current) clearInterval(intervalRef.current)
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])

    const toggleTimer = useCallback(() => {
        updateNodeData(id, { isRunning: !data.isRunning })
        persistToLocalStorage()
    }, [data.isRunning, id, updateNodeData, persistToLocalStorage])

    const resetTimer = useCallback(() => {
        const dur = getModeDuration(data.mode)
        updateNodeData(id, {
            remaining: dur,
            duration: dur,
            isRunning: false,
        })
        persistToLocalStorage()
    }, [data.mode, id, getModeDuration, updateNodeData, persistToLocalStorage])

    const switchMode = useCallback((mode: TimerMode) => {
        const dur = getModeDuration(mode)
        updateNodeData(id, {
            mode,
            duration: dur,
            remaining: dur,
            isRunning: false,
        })
        persistToLocalStorage()
    }, [id, getModeDuration, updateNodeData, persistToLocalStorage])

    // ── Editable time fields ──────────────────────────────────────────────
    const commitTimeEdit = useCallback((newMin: number, newSec: number) => {
        const clampedMin = Math.min(99, Math.max(0, isNaN(newMin) ? 0 : newMin))
        const clampedSec = Math.min(59, Math.max(0, isNaN(newSec) ? 0 : newSec))
        const totalSeconds = clampedMin * 60 + clampedSec
        const newDurations = {
            ...(data.customDurations ?? { ...TIMER_DURATIONS }),
            [data.mode]: totalSeconds,
        }
        updateNodeData(id, {
            remaining: totalSeconds,
            duration: totalSeconds,
            customDurations: newDurations,
        })
        persistToLocalStorage()
    }, [data.mode, data.customDurations, id, updateNodeData, persistToLocalStorage])

    const handleMinutesClick = useCallback(() => {
        if (data.isRunning) return
        setEditMin(String(Math.floor(data.remaining / 60)))
        setEditingMinutes(true)
        setTimeout(() => minInputRef.current?.select(), 0)
    }, [data.isRunning, data.remaining])

    const handleSecondsClick = useCallback(() => {
        if (data.isRunning) return
        setEditSec(String(data.remaining % 60))
        setEditingSeconds(true)
        setTimeout(() => secInputRef.current?.select(), 0)
    }, [data.isRunning, data.remaining])

    const finishMinEdit = useCallback(() => {
        setEditingMinutes(false)
        const newMin = parseInt(editMin, 10)
        const currentSec = data.remaining % 60
        commitTimeEdit(isNaN(newMin) ? Math.floor(data.remaining / 60) : newMin, currentSec)
    }, [editMin, data.remaining, commitTimeEdit])

    const finishSecEdit = useCallback(() => {
        setEditingSeconds(false)
        const newSec = parseInt(editSec, 10)
        const currentMin = Math.floor(data.remaining / 60)
        commitTimeEdit(currentMin, isNaN(newSec) ? data.remaining % 60 : newSec)
    }, [editSec, data.remaining, commitTimeEdit])

    const handleMinKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') finishMinEdit()
        if (e.key === 'Escape') { setEditingMinutes(false) }
        if (e.key === 'Tab') {
            e.preventDefault()
            finishMinEdit()
            handleSecondsClick()
        }
    }, [finishMinEdit, handleSecondsClick])

    const handleSecKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') finishSecEdit()
        if (e.key === 'Escape') { setEditingSeconds(false) }
    }, [finishSecEdit])

    const colors = MODE_COLORS[data.mode]
    const minutes = Math.floor(data.remaining / 60)
    const seconds = data.remaining % 60
    const progress = data.duration > 0 ? ((data.duration - data.remaining) / data.duration) * 100 : 0

    return (
        <div
            data-nodeid={id}
            className="rounded-lg shadow-lg border-2 relative overflow-hidden flex flex-col"
            style={{ width: 240, backgroundColor: colors.bg, borderColor: colors.border }}
        >
            {/* Top Bar */}
            <div className="px-2 py-1 flex items-center justify-between shrink-0 border-b" style={{ borderColor: colors.border }}>
                <div className="flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" style={{ color: colors.text }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.text }}>
                        Timer
                    </span>
                </div>
                <div className="flex items-center gap-0.5">
                    {confirmDelete ? (
                        <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-accent-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button title="Confirm" onClick={handleDeleteClick} className="p-1 text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button title="Cancel" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button title="Delete timer" onClick={handleDeleteClick} className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-white/40 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    <button
                        title={data.isPinned ? 'Unpin' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`p-1 rounded-md transition-colors ${data.isPinned
                            ? 'text-gray-700 bg-white/40'
                            : 'text-gray-400 hover:text-gray-700 hover:bg-white/30'
                            }`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={data.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                            <path d="M9 15l-4.5 4.5" />
                            <path d="M14.5 9l1 1" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mode tabs */}
            <div className="flex px-2 pt-2 gap-1">
                {(['pomodoro', 'shortBreak', 'longBreak'] as TimerMode[]).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => switchMode(mode)}
                        className={`flex-1 px-1 py-1 text-[10px] font-medium rounded-md transition-all nodrag ${data.mode === mode
                            ? 'bg-white shadow-sm'
                            : 'hover:bg-white/50'
                            }`}
                        style={{ color: data.mode === mode ? colors.text : colors.text + '99' }}
                    >
                        {MODE_LABELS[mode]}
                    </button>
                ))}
            </div>

            {/* Progress bar */}
            <div className="mx-3 mt-2 h-1 rounded-full bg-white/60 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%`, backgroundColor: colors.button }}
                />
            </div>

            {/* Timer display — click to edit when paused */}
            <div className="text-center py-3 select-none">
                <span className="text-4xl font-mono font-bold tracking-wider" style={{ color: colors.text }}>
                    {editingMinutes ? (
                        <input
                            ref={minInputRef}
                            type="text"
                            inputMode="numeric"
                            value={editMin}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                                setEditMin(val)
                            }}
                            onBlur={finishMinEdit}
                            onKeyDown={handleMinKeyDown}
                            className="w-[2.5ch] text-4xl font-mono font-bold text-center bg-white/60 rounded outline-none border-2 nodrag nopan"
                            style={{ color: colors.text, borderColor: colors.button }}
                            maxLength={2}
                        />
                    ) : (
                        <span
                            onClick={handleMinutesClick}
                            className={!data.isRunning ? 'cursor-pointer hover:bg-white/40 rounded px-0.5 transition-colors' : ''}
                            title={!data.isRunning ? 'Click to edit minutes' : undefined}
                        >
                            {String(minutes).padStart(2, '0')}
                        </span>
                    )}
                    :
                    {editingSeconds ? (
                        <input
                            ref={secInputRef}
                            type="text"
                            inputMode="numeric"
                            value={editSec}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                                setEditSec(val)
                            }}
                            onBlur={finishSecEdit}
                            onKeyDown={handleSecKeyDown}
                            className="w-[2.5ch] text-4xl font-mono font-bold text-center bg-white/60 rounded outline-none border-2 nodrag nopan"
                            style={{ color: colors.text, borderColor: colors.button }}
                            maxLength={2}
                        />
                    ) : (
                        <span
                            onClick={handleSecondsClick}
                            className={!data.isRunning ? 'cursor-pointer hover:bg-white/40 rounded px-0.5 transition-colors' : ''}
                            title={!data.isRunning ? 'Click to edit seconds' : undefined}
                        >
                            {String(seconds).padStart(2, '0')}
                        </span>
                    )}
                </span>
                {!data.isRunning && !editingMinutes && !editingSeconds && (
                    <p className="text-[9px] mt-0.5 opacity-50" style={{ color: colors.text }}>Click numbers to edit</p>
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pb-3">
                <button
                    onClick={resetTimer}
                    className="p-2 rounded-full hover:bg-white/60 transition-colors nodrag"
                    title="Reset"
                    style={{ color: colors.text }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                </button>
                <button
                    onClick={toggleTimer}
                    className="p-3 rounded-full text-white shadow-md hover:shadow-lg transition-all nodrag active:scale-95"
                    style={{ backgroundColor: colors.button }}
                    title={data.isRunning ? 'Pause' : 'Start'}
                >
                    {data.isRunning ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                    )}
                </button>
                <button
                    onClick={() => {
                        const isPomodoro = data.mode === 'pomodoro'
                        const newSessions = isPomodoro ? data.sessionsCompleted + 1 : data.sessionsCompleted
                        let nextMode: TimerMode = 'pomodoro'
                        if (isPomodoro) {
                            nextMode = newSessions % 4 === 0 ? 'longBreak' : 'shortBreak'
                        }
                        const nextDuration = getModeDuration(nextMode)
                        updateNodeData(id, {
                            mode: nextMode,
                            duration: nextDuration,
                            remaining: nextDuration,
                            isRunning: false,
                            sessionsCompleted: newSessions,
                        })
                        persistToLocalStorage()
                    }}
                    className="p-2 rounded-full hover:bg-white/60 transition-colors nodrag"
                    title="Skip"
                    style={{ color: colors.text }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 4 15 12 5 20 5 4" />
                        <line x1="19" y1="5" x2="19" y2="19" />
                    </svg>
                </button>
            </div>

            {/* Handles */}
            <Handle type="source" position={Position.Top} id="top" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: colors.button }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: colors.button }} />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: colors.button }} />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: colors.button }} />
        </div>
    )
}
