import { useState, useCallback, useEffect, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { VoiceNoteNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { saveAudio, loadAudio, deleteAudio } from '../utils/audioStorage'
import { transcribeAudio } from '../api/studyApi'

type VoiceNoteNodeProps = NodeProps & { data: VoiceNoteNodeData }

const COLORS = {
    bg: '#F0F4FF',
    border: '#A5B4FC',
    text: '#3730A3',
    accent: '#4F46E5',
    recordBtn: '#EF4444',
    barIdle: '#C7D2FE',
    barActive: '#6366F1',
}

// Number of waveform bars — thin iPhone-style columns
const NUM_BARS = 50

export default function VoiceNoteNode({ id, data }: VoiceNoteNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const [confirmDelete, setConfirmDelete] = useState(false)

    // Recording state
    const [isRecording, setIsRecording] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    // Ref mirrors state so onstop handler reads the final elapsed value synchronously
    const recordingTimeRef = useRef(0)

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [hasAudio, setHasAudio] = useState(false)

    // Waveform bars (0–1 height ratios, updated via AnalyserNode)
    const [bars, setBars] = useState<number[]>(Array(NUM_BARS).fill(0))

    // Refs for recording
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const animFrameRef = useRef<number | null>(null)
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Refs for playback
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const blobUrlRef = useRef<string | null>(null)

    // Transcription state
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [transcribeError, setTranscribeError] = useState<string | null>(null)

    // Label editing
    const [editingLabel, setEditingLabel] = useState(false)
    const [labelDraft, setLabelDraft] = useState(data.label || '')

    // Load audio from IndexedDB when audioId is set
    useEffect(() => {
        if (!data.audioId) {
            setHasAudio(false)
            return
        }
        let cancelled = false
        loadAudio(data.audioId).then((blob) => {
            if (cancelled || !blob) return
            // Revoke any previous object URL
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
            const url = URL.createObjectURL(blob)
            blobUrlRef.current = url
            if (audioRef.current) {
                audioRef.current.src = url
                audioRef.current.load()
            }
            setHasAudio(true)
        })
        return () => { cancelled = true }
    }, [data.audioId])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            if (recordTimerRef.current) clearInterval(recordTimerRef.current)
            if (audioContextRef.current) audioContextRef.current.close()
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
        }
    }, [])

    // ── iPhone-style waveform animation ────────────────────────────────
    // Reads frequency data; maps bar bins to amplitude and renders
    // center-symmetric bars (iPhone Voice Memos style).
    const drawBars = useCallback(() => {
        const analyser = analyserRef.current
        if (!analyser) return

        const bufferLength = analyser.frequencyBinCount   // fftSize / 2
        const freqData = new Uint8Array(bufferLength)
        analyser.getByteFrequencyData(freqData)

        // Only use lower ~60 % of spectrum (voice range is 80 Hz – ~4 kHz)
        const usableLength = Math.floor(bufferLength * 0.6)
        const step = usableLength / NUM_BARS

        const newBars = Array.from({ length: NUM_BARS }, (_, i) => {
            const start = Math.floor(i * step)
            const end = Math.floor((i + 1) * step)
            let peak = 0
            for (let j = start; j < end; j++) {
                if (freqData[j] > peak) peak = freqData[j]
            }
            // Normalize; apply power curve so quiet speech still shows bars
            return Math.min(1, (peak / 180) ** 0.7)
        })

        setBars(newBars)
        animFrameRef.current = requestAnimationFrame(drawBars)
    }, [])

    // ── Start Recording ──────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            // Set up analyser
            const ctx = new AudioContext()
            audioContextRef.current = ctx
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 512          // 256 frequency bins — detailed enough for voice
            analyser.smoothingTimeConstant = 0.6
            source.connect(analyser)
            analyserRef.current = analyser

            // Pick best supported MIME type
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4'

            const recorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = recorder
            chunksRef.current = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: mimeType })
                const audioId = crypto.randomUUID()
                await saveAudio(audioId, blob)

                // Determine duration — WebM streams often report Infinity on ondurationchange,
                // so we fall back to the elapsed recording time captured in the ref.
                const elapsedSecs = recordingTimeRef.current
                const dur = await new Promise<number>((resolve) => {
                    const a = new Audio()
                    const url = URL.createObjectURL(blob)
                    a.src = url

                    const fallback = setTimeout(() => {
                        URL.revokeObjectURL(url)
                        resolve(elapsedSecs)
                    }, 1500)

                    a.onloadedmetadata = () => {
                        if (isFinite(a.duration) && a.duration > 0) {
                            clearTimeout(fallback)
                            URL.revokeObjectURL(url)
                            resolve(a.duration)
                            return
                        }
                        // Seek-to-end trick to force browser to compute WebM duration
                        a.currentTime = 1e101
                        a.ontimeupdate = () => {
                            if (isFinite(a.duration) && a.duration > 0) {
                                clearTimeout(fallback)
                                URL.revokeObjectURL(url)
                                resolve(a.duration)
                            }
                        }
                    }
                    a.onerror = () => { clearTimeout(fallback); URL.revokeObjectURL(url); resolve(elapsedSecs) }
                })

                updateNodeData(id, { audioId, duration: dur > 0 ? dur : elapsedSecs })
                persistToLocalStorage()

                // Clean up audio context
                ctx.close()
                stream.getTracks().forEach((t) => t.stop())
                streamRef.current = null
                audioContextRef.current = null
                analyserRef.current = null
                if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
                setBars(Array(NUM_BARS).fill(0))
            }

            recorder.start(100)
            setIsRecording(true)
            recordingTimeRef.current = 0
            setRecordingTime(0)

            // Elapsed-time counter — keeps ref in sync so onstop can read it
            recordTimerRef.current = setInterval(() => {
                recordingTimeRef.current += 1
                setRecordingTime((t) => t + 1)
            }, 1000)

            // Start waveform animation
            drawBars()
        } catch (err) {
            console.error('VoiceNoteNode: microphone error', err)
            alert('Could not access microphone. Please allow microphone permissions.')
        }
    }, [id, updateNodeData, persistToLocalStorage, drawBars])

    // ── Stop Recording ───────────────────────────────────────────────────
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        setIsRecording(false)
    }, [])

    // ── Playback controls ────────────────────────────────────────────────
    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current
        if (!audio || !hasAudio) return
        if (isPlaying) {
            audio.pause()
            setIsPlaying(false)
        } else {
            audio.play().catch(() => {})
            setIsPlaying(true)
        }
    }, [isPlaying, hasAudio])

    const skipBack = useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.max(0, audio.currentTime - 5)
    }, [])

    const skipForward = useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10)
    }, [])

    const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current
        if (!audio) return
        const t = parseFloat(e.target.value)
        audio.currentTime = t
        setCurrentTime(t)
    }, [])

    // ── Audio element events ─────────────────────────────────────────────
    const handleTimeUpdate = useCallback(() => {
        setCurrentTime(audioRef.current?.currentTime ?? 0)
    }, [])

    const handleEnded = useCallback(() => {
        setIsPlaying(false)
        setCurrentTime(0)
        if (audioRef.current) audioRef.current.currentTime = 0
    }, [])

    // ── Delete ───────────────────────────────────────────────────────────
    const handleDeleteClick = useCallback(() => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        if (isRecording) stopRecording()
        if (data.audioId) deleteAudio(data.audioId).catch(() => {})
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, isRecording, stopRecording, data.audioId, id, setNodes, setEdges, persistToLocalStorage])

    // ── Transcription ─────────────────────────────────────────────────────
    const handleTranscribe = useCallback(async () => {
        if (!hasAudio || !data.audioId || data.transcriptionNodeId || isTranscribing) return
        setIsTranscribing(true)
        setTranscribeError(null)
        try {
            const blob = await loadAudio(data.audioId)
            if (!blob) throw new Error('Audio not found in storage')

            // Convert Blob → raw base64 (strip the data-URL prefix)
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                    const result = reader.result as string
                    resolve(result.split(',')[1])
                }
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })

            const { text } = await transcribeAudio(base64, blob.type)

            // Get current node position and measured height directly from store
            // (avoids stale closure; no new subscription needed)
            const storeNodes = useCanvasStore.getState().nodes
            const thisNode = storeNodes.find((n) => n.id === id)
            const nodeHeight = (thisNode as any)?.measured?.height ?? 260
            const nodePos = thisNode?.position ?? { x: 0, y: 0 }

            const transcriptionNodeId = `transcription-${Date.now()}`

            const transcriptionNode = {
                id: transcriptionNodeId,
                type: 'transcriptionNode' as const,
                position: { x: nodePos.x, y: nodePos.y + nodeHeight + 40 },
                data: {
                    text,
                    isMinimized: false,
                    isPinned: data.isPinned ?? false,
                    pageIndex: data.pageIndex,
                    sourceVoiceNoteId: id,
                    savedWidth: 280,
                    savedHeight: 160,
                },
            }

            const connectingEdge = {
                id: `edge-transcription-${Date.now()}`,
                source: id,
                target: transcriptionNodeId,
                sourceHandle: 'bottom',
                targetHandle: 'top',
                type: 'smoothstep',
                animated: false,
                style: { stroke: '#7C3AED', strokeWidth: 2 },
            }

            setNodes((prev) => [...prev, transcriptionNode])
            setEdges((prev) => [...prev, connectingEdge])
            updateNodeData(id, { transcriptionNodeId })
            persistToLocalStorage()
        } catch (err: unknown) {
            console.error('VoiceNoteNode: transcription failed', err)
            const msg =
                (err as any)?.response?.data?.detail ??
                (err as any)?.message ??
                'Transcription failed. Please try again.'
            setTranscribeError(msg)
            // Auto-clear error after 5 s
            setTimeout(() => setTranscribeError(null), 5000)
        } finally {
            setIsTranscribing(false)
        }
    }, [
        hasAudio,
        data.audioId,
        data.transcriptionNodeId,
        data.isPinned,
        data.pageIndex,
        isTranscribing,
        id,
        setNodes,
        setEdges,
        updateNodeData,
        persistToLocalStorage,
    ])

    // ── Label save ───────────────────────────────────────────────────────
    const commitLabel = useCallback(() => {
        setEditingLabel(false)
        updateNodeData(id, { label: labelDraft })
        persistToLocalStorage()
    }, [id, labelDraft, updateNodeData, persistToLocalStorage])

    // ── Minimize ─────────────────────────────────────────────────────────
    const toggleMinimize = useCallback(() => {
        updateNodeData(id, { isMinimized: !data.isMinimized })
        persistToLocalStorage()
    }, [id, data.isMinimized, updateNodeData, persistToLocalStorage])

    // ── Helpers ──────────────────────────────────────────────────────────
    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }

    const duration = data.duration || 0
    const scrubProgress = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
        <div
            data-nodeid={id}
            className="rounded-lg shadow-lg border-2 relative flex flex-col select-none"
            style={{ width: 260, backgroundColor: COLORS.bg, borderColor: COLORS.border }}
        >
            {/* Hidden audio element */}
            <audio
                ref={audioRef}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                preload="metadata"
            />

            {/* ── Top Bar ─────────────────────────────────────────────── */}
            <div
                className="px-2 py-1 flex items-center justify-between shrink-0 border-b"
                style={{ borderColor: COLORS.border }}
            >
                <div className="flex items-center gap-1">
                    {/* Mic icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" style={{ color: COLORS.text }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.text }}>
                        Voice Note
                    </span>
                    {isRecording && (
                        <span className="ml-1 flex items-center gap-0.5">
                            {/* Pulsing red dot */}
                            <span
                                className="w-1.5 h-1.5 rounded-full bg-red-500"
                                style={{ animation: 'pulse 1s ease-in-out infinite' }}
                            />
                            <span className="text-[9px] font-mono text-red-500">{formatTime(recordingTime)}</span>
                        </span>
                    )}
                </div>
                {/* Right buttons: Delete → Minimize → Pin (order per spec) */}
                <div className="flex items-center gap-0.5">
                    {/* Delete */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-1" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">Delete?</span>
                            <button title="Confirm" onClick={handleDeleteClick} className="p-1 text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors nodrag">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button title="Cancel" onClick={() => setConfirmDelete(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors nodrag">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button title="Delete voice note" onClick={handleDeleteClick} className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-white/40 transition-colors nodrag">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    {/* Minimize */}
                    <button
                        title={data.isMinimized ? 'Expand' : 'Minimise'}
                        onClick={toggleMinimize}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-white/40 rounded-md transition-colors nodrag"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                    </button>

                    {/* Pin */}
                    <button
                        title={data.isPinned ? 'Unpin' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`p-1 rounded-md transition-colors nodrag ${data.isPinned ? 'text-gray-700 bg-white/40' : 'text-gray-400 hover:text-gray-700 hover:bg-white/30'}`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={data.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                            <path d="M9 15l-4.5 4.5" />
                            <path d="M14.5 9l1 1" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Minimized view: skip + play/pause + skip + transcribe ────── */}
            {data.isMinimized ? (
                <div className="relative flex items-center px-3 py-2.5 nodrag">
                    {/* Invisible left spacer mirrors the transcribe button width so the
                        skip/play/skip trio is perfectly centred over the node. */}
                    <div className="w-7 h-7 shrink-0" />

                    {/* Centred playback group */}
                    <div className="flex-1 flex items-center justify-center gap-3">
                        {/* Skip back 5s */}
                        <button
                            onClick={skipBack}
                            disabled={!hasAudio}
                            title="Skip back 5s"
                            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                            style={{ color: COLORS.text }}
                        >
                            <svg className="w-8 h-8" viewBox="0 0 36 36" fill="none">
                                <path d="M18 7A11 11 0 1 0 27 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                                <polyline points="10,4 10,10 16,10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                <text x="18" y="22" fontSize="10" fontWeight="800" fill="currentColor" textAnchor="middle" dominantBaseline="auto">5</text>
                            </svg>
                        </button>

                        {/* Play / Pause */}
                        <button
                            onClick={togglePlayPause}
                            disabled={!hasAudio}
                            title={isPlaying ? 'Pause' : 'Play'}
                            className="p-3 rounded-full text-white shadow-md hover:shadow-lg transition-all active:scale-95 nodrag disabled:opacity-40"
                            style={{ backgroundColor: COLORS.accent }}
                        >
                            {isPlaying ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" rx="1" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            )}
                        </button>

                        {/* Skip forward 10s */}
                        <button
                            onClick={skipForward}
                            disabled={!hasAudio}
                            title="Skip forward 10s"
                            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                            style={{ color: COLORS.text }}
                        >
                            <svg className="w-8 h-8" viewBox="0 0 36 36" fill="none">
                                <path d="M18 7A11 11 0 1 1 9 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                                <polyline points="26,4 26,10 20,10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                <text x="18" y="22" fontSize="9" fontWeight="800" fill="currentColor" textAnchor="middle" dominantBaseline="auto">10</text>
                            </svg>
                        </button>
                    </div>

                    {/* Transcribe — flush right */}
                    <button
                        onClick={handleTranscribe}
                        disabled={!hasAudio || !!data.transcriptionNodeId || isTranscribing}
                        title={
                            data.transcriptionNodeId
                                ? 'Transcription already generated — delete it to re-transcribe'
                                : isTranscribing
                                ? 'Transcribing…'
                                : 'Transcribe voice note'
                        }
                        className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                        style={{ color: data.transcriptionNodeId ? '#7C3AED' : COLORS.text }}
                    >
                        {isTranscribing ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <line x1="10" y1="9" x2="8" y2="9"/>
                            </svg>
                        )}
                    </button>
                </div>
            ) : (
                <>
                    {/* ── Waveform Visualiser (recording only) — iPhone style ── */}
                    {isRecording && (
                        <div className="px-3 pt-3 pb-1">
                            {/* Center-symmetric bars: each bar is vertically centered */}
                            <div
                                className="flex items-center justify-between"
                                style={{ height: 64, gap: 2 }}
                            >
                                {bars.map((h, i) => {
                                    // Taper edges slightly for a natural waveform shape
                                    const edgeFade = 1 - Math.pow(Math.abs((i / (NUM_BARS - 1)) * 2 - 1), 2) * 0.3
                                    const amp = Math.max(0.04, h * edgeFade)
                                    const barH = Math.round(amp * 64)
                                    const lightness = 42 + Math.round(h * 20)
                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                flex: '1 0 0',
                                                height: barH,
                                                borderRadius: 2,
                                                backgroundColor: `hsl(250, 72%, ${lightness}%)`,
                                                transition: 'height 55ms ease, background-color 55ms ease',
                                            }}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Scrubber (playback) ───────────────────────────── */}
                    {!isRecording && hasAudio && (
                        <div className="px-3 pt-2.5 pb-0.5">
                            <div className="relative flex items-center gap-1.5">
                                <span className="text-[9px] font-mono shrink-0" style={{ color: COLORS.text }}>{formatTime(currentTime)}</span>
                                <div className="relative flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.barIdle }}>
                                    <div
                                        className="absolute left-0 top-0 h-full rounded-full transition-all duration-100"
                                        style={{ width: `${scrubProgress}%`, backgroundColor: COLORS.accent }}
                                    />
                                    <input
                                        type="range"
                                        min={0}
                                        max={duration}
                                        step={0.1}
                                        value={currentTime}
                                        onChange={handleScrub}
                                        className="absolute inset-0 w-full opacity-0 cursor-pointer nodrag nopan"
                                    />
                                </div>
                                <span className="text-[9px] font-mono shrink-0" style={{ color: COLORS.text }}>{formatTime(duration)}</span>
                            </div>
                        </div>
                    )}

                    {/* ── Playback Controls ────────────────────────────── */}
                    <div className="relative flex items-center px-3 pt-2 pb-2 nodrag">
                        {/* Invisible left spacer mirrors the transcribe button so the
                            skip/play/skip trio is perfectly centred over the node. */}
                        <div className="w-7 h-7 shrink-0" />

                        {/* Centred playback group */}
                        <div className="flex-1 flex items-center justify-center gap-3">
                            {/* Skip back 5s */}
                            <button
                                onClick={skipBack}
                                disabled={!hasAudio || isRecording}
                                title="Skip back 5s"
                                className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                                style={{ color: COLORS.text }}
                            >
                                <svg className="w-8 h-8" viewBox="0 0 36 36" fill="none">
                                    <path d="M18 7A11 11 0 1 0 27 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                                    <polyline points="10,4 10,10 16,10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <text x="18" y="22" fontSize="10" fontWeight="800" fill="currentColor" textAnchor="middle" dominantBaseline="auto">5</text>
                                </svg>
                            </button>

                            {/* Play / Pause */}
                            <button
                                onClick={togglePlayPause}
                                disabled={!hasAudio || isRecording}
                                title={isPlaying ? 'Pause' : 'Play'}
                                className="p-3 rounded-full text-white shadow-md hover:shadow-lg transition-all active:scale-95 nodrag disabled:opacity-40"
                                style={{ backgroundColor: COLORS.accent }}
                            >
                                {isPlaying ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <rect x="6" y="4" width="4" height="16" rx="1" />
                                        <rect x="14" y="4" width="4" height="16" rx="1" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                )}
                            </button>

                            {/* Skip forward 10s */}
                            <button
                                onClick={skipForward}
                                disabled={!hasAudio || isRecording}
                                title="Skip forward 10s"
                                className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                                style={{ color: COLORS.text }}
                            >
                                <svg className="w-8 h-8" viewBox="0 0 36 36" fill="none">
                                    <path d="M18 7A11 11 0 1 1 9 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                                    <polyline points="26,4 26,10 20,10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <text x="18" y="22" fontSize="9" fontWeight="800" fill="currentColor" textAnchor="middle" dominantBaseline="auto">10</text>
                                </svg>
                            </button>
                        </div>

                        {/* Transcribe — flush right */}
                        <button
                            onClick={handleTranscribe}
                            disabled={!hasAudio || isRecording || !!data.transcriptionNodeId || isTranscribing}
                            title={
                                data.transcriptionNodeId
                                    ? 'Transcription already generated — delete it to re-transcribe'
                                    : isTranscribing
                                    ? 'Transcribing…'
                                    : 'Transcribe voice note'
                            }
                            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full hover:bg-white/70 transition-colors nodrag disabled:opacity-30"
                            style={{ color: data.transcriptionNodeId ? '#7C3AED' : COLORS.text }}
                        >
                            {isTranscribing ? (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <line x1="10" y1="9" x2="8" y2="9"/>
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Transcription error banner */}
                    {transcribeError && (
                        <div className="mx-2.5 mb-1.5 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-[10px] text-red-600 nodrag nopan">
                            {transcribeError}
                        </div>
                    )}

                    {/* ── Record / Stop button — only shown before first recording ── */}
                    {!hasAudio && (
                        <div className="flex items-center justify-center pb-2 nodrag">
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                title={isRecording ? 'Stop recording' : 'Start recording'}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-[11px] font-semibold shadow transition-all active:scale-95 nodrag"
                                style={{ backgroundColor: isRecording ? COLORS.accent : COLORS.recordBtn }}
                            >
                                {isRecording ? (
                                    <>
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                            <rect x="4" y="4" width="16" height="16" rx="2" />
                                        </svg>
                                        Stop
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="8" />
                                        </svg>
                                        Record
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* ── Label input ──────────────────────────────────── */}
                    <div className="px-2.5 pb-2.5">
                        {editingLabel ? (
                            <input
                                autoFocus
                                type="text"
                                value={labelDraft}
                                onChange={(e) => setLabelDraft(e.target.value)}
                                onBlur={commitLabel}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitLabel()
                                    if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(data.label || '') }
                                }}
                                placeholder="Note title…"
                                className="w-full px-2 py-1 text-[11px] rounded-md border outline-none bg-white/70 nodrag nopan"
                                style={{ borderColor: COLORS.border, color: COLORS.text }}
                                maxLength={60}
                            />
                        ) : (
                            <button
                                onClick={() => { setLabelDraft(data.label || ''); setEditingLabel(true) }}
                                className="w-full text-left px-2 py-1 text-[11px] rounded-md hover:bg-white/60 transition-colors nodrag"
                                style={{ color: data.label ? COLORS.text : '#9CA3AF' }}
                            >
                                {data.label || 'Add a title…'}
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* React Flow handles */}
            <Handle type="source" position={Position.Top}    id="top"    className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: COLORS.accent }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: COLORS.accent }} />
            <Handle type="source" position={Position.Left}   id="left"   className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: COLORS.accent }} />
            <Handle type="source" position={Position.Right}  id="right"  className="!w-3 !h-3 !border-2 !border-white hover:!scale-125 !transition-transform" style={{ backgroundColor: COLORS.accent }} />
        </div>
    )
}
