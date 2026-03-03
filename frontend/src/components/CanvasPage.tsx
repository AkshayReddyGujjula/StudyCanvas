import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './Canvas'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'
import { useTutorialStore } from '../store/tutorialStore'
import { TUTORIAL_FILE_DATA, createTutorialContentNode, generateTutorialPdf } from './tutorial/sampleContent'
import {
    loadCanvasState,
    saveCanvasState,
    loadPdf as fsLoadPdf,
    savePdf as fsSavePdf,
    saveThumbnail,
    resolveParentHandle,
    saveVoiceAudio as fsSaveVoiceAudio,
    loadVoiceAudio as fsLoadVoiceAudio,
} from '../services/fileSystemService'
import {
    saveCanvasStateIDB,
    loadCanvasStateIDB,
    saveThumbnailIDB,
} from '../services/idbStorageService'
import { savePdfToLocal, loadPdfFromLocal } from '../utils/pdfStorage'
import { extractPdfPagesTextFromBuffer } from '../utils/pdfTextExtractor'
import { saveCanvasBackup, loadCanvasBackup } from '../utils/canvasBackup'
import { saveAudio, loadAudio } from '../utils/audioStorage'
import { toPng } from 'html-to-image'

/**
 * CanvasPage — route wrapper for `/canvas/:canvasId`.
 *
 * Responsibilities:
 *   1. On mount, load canvas state + PDF from the local folder into Zustand.
 *   2. Auto-save every 30 s if there are unsaved changes.
 *   3. On unmount (navigate away), save if dirty.
 *   4. Provides the Save action to Canvas (exposed via callback).
 */
export default function CanvasPage() {
    const { canvasId } = useParams<{ canvasId: string }>()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null)
    const savingRef = useRef(false)
    const mountedRef = useRef(true)

    const directoryHandle = useAppStore((s) => s.directoryHandle)
    const storageMode = useAppStore((s) => s.storageMode)
    const isDirty = useAppStore((s) => s.isDirty)
    const setDirty = useAppStore((s) => s.setDirty)
    const setActiveCanvasId = useAppStore((s) => s.setActiveCanvasId)
    const touchCanvas = useAppStore((s) => s.touchCanvas)
    const autoSaveInterval = useAppStore((s) => s.autoSaveInterval)

    // ── Save current canvas ──────────────────────────────────────────────────
    const saveCanvas = useCallback(async (onProgress?: (pct: number, label: string) => void) => {
        if (!canvasId || savingRef.current) return
        if (storageMode !== 'indexeddb' && !directoryHandle) return
        savingRef.current = true
        try {
            onProgress?.(5, 'Preparing to save…')

            const store = useCanvasStore.getState()
            const {
                nodes, edges, fileData, highlights, userDetails,
                currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport,
                drawingStrokes, savedColors, toolSettings,
            } = store

            // Build the state object (strip large recoverable fields)
            const lightFileData = fileData ? {
                ...fileData,
                raw_text: '',            // recoverable from PDF
                markdown_content: '',    // recoverable from PDF
            } : null
            const lightNodes = nodes.map((n: any) => {
                if (n.type === 'imageNode' && n.data?.imageDataUrl) {
                    return { ...n, data: { ...n.data } }
                }
                return n
            })
            const stateObj = { nodes: lightNodes, edges, fileData: lightFileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport, drawingStrokes, savedColors, toolSettings }

            onProgress?.(20, 'Serializing canvas…')

            // Use a Web Worker to JSON.stringify off the main thread
            const jsonString: string = await new Promise((resolve, reject) => {
                const workerCode = `self.onmessage = function(e) { try { self.postMessage(JSON.stringify(e.data)); } catch(err) { self.postMessage('__SERIALIZE_ERROR__'); } };`
                const blob = new Blob([workerCode], { type: 'application/javascript' })
                const url = URL.createObjectURL(blob)
                const worker = new Worker(url)
                worker.onmessage = (e) => {
                    worker.terminate()
                    URL.revokeObjectURL(url)
                    if (e.data === '__SERIALIZE_ERROR__') reject(new Error('Serialization failed'))
                    else resolve(e.data)
                }
                worker.onerror = () => {
                    worker.terminate()
                    URL.revokeObjectURL(url)
                    try { resolve(JSON.stringify(stateObj)) } catch { reject(new Error('Serialization failed')) }
                }
                worker.postMessage(stateObj)
            })

            onProgress?.(45, 'Writing canvas data…')

            if (storageMode === 'indexeddb') {
                // ── IDB save path ─────────────────────────────────────────────
                await saveCanvasStateIDB(canvasId, jsonString as any)

                onProgress?.(58, 'Saving PDF…')
                const pdfBuffer = store.pdfArrayBuffer
                if (pdfBuffer) {
                    // In IDB mode always key by canvasId so removeCanvas can reliably clean it up
                    await savePdfToLocal(canvasId, pdfBuffer)
                }

                // Voice audio is already in IndexedDB via audioStorage.ts — no extra copy needed

                onProgress?.(72, 'Capturing thumbnail…')
                try {
                    const containerEl = document.querySelector('[data-tutorial="canvas-container"]') as HTMLElement | null
                    const target = containerEl ?? (document.querySelector('.react-flow') as HTMLElement | null)
                    if (target) {
                        const dataUrl = await toPng(target, {
                            quality: 0.85, pixelRatio: 0.5, backgroundColor: '#ffffff',
                            filter: (node) => {
                                const el = node as HTMLElement
                                if (!el.classList) return true
                                if (el.classList.contains('react-flow__minimap')) return false
                                if (el.classList.contains('react-flow__controls')) return false
                                if (el.classList.contains('react-flow__panel')) return false
                                if (el.classList.contains('react-flow__attribution')) return false
                                if (el.classList.contains('drawing-canvas-temp')) return false
                                if (el.classList.contains('fixed')) return false
                                return true
                            },
                        })
                        const res = await fetch(dataUrl)
                        const blob = await res.blob()
                        await saveThumbnailIDB(canvasId, blob)
                    }
                } catch { /* best-effort */ }

            } else {
                // ── File System save path (original logic) ────────────────────
                const appState = useAppStore.getState()
                const canvasMeta = appState.canvasList.find(c => c.id === canvasId)
                const parentHandle = await resolveParentHandle(
                    directoryHandle!,
                    appState.folderList,
                    canvasMeta?.parentFolderId,
                )

                await saveCanvasState(parentHandle, canvasId, jsonString as any)

                onProgress?.(58, 'Saving PDF…')
                const pdfBuffer = store.pdfArrayBuffer
                if (pdfBuffer) {
                    await fsSavePdf(parentHandle, canvasId, pdfBuffer)
                } else if (fileData) {
                    const key = fileData.pdf_id || fileData.filename || 'current_pdf'
                    const cached = await loadPdfFromLocal(key)
                    if (cached) {
                        await fsSavePdf(parentHandle, canvasId, cached)
                    }
                }

                onProgress?.(65, 'Saving audio…')
                try {
                    const voiceNodes = nodes.filter((n: any) => n.type === 'voiceNoteNode' && n.data?.audioId)
                    for (const node of voiceNodes) {
                        const audioId = (node.data as any).audioId as string
                        const blob = await loadAudio(audioId)
                        if (blob) {
                            await fsSaveVoiceAudio(parentHandle, canvasId, audioId, blob).catch(() => { })
                        }
                    }
                } catch { /* best-effort */ }

                onProgress?.(72, 'Capturing thumbnail…')
                try {
                    const containerEl = document.querySelector('[data-tutorial="canvas-container"]') as HTMLElement | null
                    const target = containerEl ?? (document.querySelector('.react-flow') as HTMLElement | null)
                    if (target) {
                        const dataUrl = await toPng(target, {
                            quality: 0.85, pixelRatio: 0.5, backgroundColor: '#ffffff',
                            filter: (node) => {
                                const el = node as HTMLElement
                                if (!el.classList) return true
                                if (el.classList.contains('react-flow__minimap')) return false
                                if (el.classList.contains('react-flow__controls')) return false
                                if (el.classList.contains('react-flow__panel')) return false
                                if (el.classList.contains('react-flow__attribution')) return false
                                if (el.classList.contains('drawing-canvas-temp')) return false
                                if (el.classList.contains('fixed')) return false
                                return true
                            },
                        })
                        const res = await fetch(dataUrl)
                        const blob = await res.blob()
                        await saveThumbnail(parentHandle, canvasId, blob)
                    }
                } catch { /* best-effort */ }
            }

            // Shared post-save steps
            onProgress?.(86, 'Updating manifest…')
            await touchCanvas(canvasId)

            onProgress?.(93, 'Finishing up…')
            store.persistToLocalStorage()

            const backupState = { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport, drawingStrokes, savedColors, toolSettings }
            await saveCanvasBackup(canvasId, backupState).catch(() => { })

            onProgress?.(100, 'Done!')
            setDirty(false)
        } catch (err) {
            console.error('[CanvasPage] save failed:', err)
            throw err
        } finally {
            savingRef.current = false
        }
    }, [directoryHandle, storageMode, canvasId, touchCanvas, setDirty])

    // ── Load canvas on mount ─────────────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true
        if (!canvasId) {
            setLoadError('No canvas ID in the URL.')
            setLoading(false)
            return
        }
        if (storageMode !== 'indexeddb' && !directoryHandle) {
            setLoadError('No workspace folder available.')
            setLoading(false)
            return
        }

        setActiveCanvasId(canvasId)

        const load = async () => {
            try {
                let stateObj: Record<string, any> | null = null

                if (storageMode === 'indexeddb') {
                    // ── IDB load path ─────────────────────────────────────────
                    stateObj = await loadCanvasStateIDB(canvasId!)
                } else {
                    // ── File System load path (original) ──────────────────────
                    const appState = useAppStore.getState()
                    const canvasMeta = appState.canvasList.find(c => c.id === canvasId)
                    const parentHandle = await resolveParentHandle(
                        directoryHandle!,
                        appState.folderList,
                        canvasMeta?.parentFolderId,
                    )
                    stateObj = await loadCanvasState(parentHandle, canvasId!)
                }

                // Fallback: if primary storage missing or corrupt, try IndexedDB crash-recovery backup
                if (!stateObj) {
                    console.warn('[CanvasPage] primary state missing, trying IndexedDB backup…')
                    stateObj = await loadCanvasBackup(canvasId!)
                    if (stateObj) {
                        console.info('[CanvasPage] Recovered canvas from IndexedDB backup')
                    }
                }
                const store = useCanvasStore.getState()

                if (stateObj) {
                    if (stateObj.nodes) store.setNodes(stateObj.nodes)
                    if (stateObj.edges) {
                        const migrated = (stateObj.edges as any[]).map((e: any) =>
                            e.targetHandle === 'right-target' ? { ...e, targetHandle: 'right' } : e
                        )
                        store.setEdges(migrated)
                    }
                    if (stateObj.fileData) store.setFileData(stateObj.fileData)
                    if (stateObj.userDetails) store.setUserDetails(stateObj.userDetails)
                    if (stateObj.highlights && stateObj.highlights.length > 0) {
                        stateObj.highlights.forEach((h: { id: string; text: string; nodeId: string }) =>
                            store.addHighlight(h)
                        )
                    }
                    if (typeof stateObj.currentPage === 'number' && stateObj.currentPage > 1) {
                        store.setCurrentPage(stateObj.currentPage)
                    }
                    if (stateObj.zoomLevel) store.setZoomLevel(stateObj.zoomLevel)
                    if (stateObj.canvasViewport) store.setCanvasViewport(stateObj.canvasViewport)
                    if (stateObj.scrollPositions) {
                        Object.entries(stateObj.scrollPositions).forEach(([page, pos]) => {
                            store.updateScrollPosition(Number(page), pos as number)
                        })
                    }
                    if (stateObj.drawingStrokes) store.setDrawingStrokes(stateObj.drawingStrokes)
                    if (stateObj.savedColors) store.setSavedColors(stateObj.savedColors)
                    if (stateObj.toolSettings) store.setToolSettings(stateObj.toolSettings)
                    if (stateObj.pageMarkdowns && Array.isArray(stateObj.pageMarkdowns)) store.setPageMarkdowns(stateObj.pageMarkdowns)
                }

                // Always hydrate canvasStore.userDetails from the global user context
                const globalCtx = useAppStore.getState().userContext
                if (globalCtx.name || globalCtx.age || globalCtx.status || globalCtx.educationLevel) {
                    store.setUserDetails(globalCtx)
                }

                // Tutorial canvas: inject pre-built sample content when loading fresh
                const { tutorialCanvasId } = useTutorialStore.getState()
                if (canvasId === tutorialCanvasId && !stateObj) {
                    store.setFileData(TUTORIAL_FILE_DATA)
                    const firstPageMarkdown = useCanvasStore.getState().pageMarkdowns[0] ?? TUTORIAL_FILE_DATA.markdown_content
                    store.setNodes([createTutorialContentNode(firstPageMarkdown)])
                    try {
                        const tutorialPdfBuffer = generateTutorialPdf()
                        store.setPdfArrayBuffer(tutorialPdfBuffer)
                    } catch (err) {
                        console.warn('[CanvasPage] Tutorial PDF generation failed, falling back to markdown:', err)
                    }
                }

                // Load PDF
                if (storageMode === 'indexeddb') {
                    // In IDB mode, PDF is keyed by canvasId for predictable cleanup
                    const idbPdfBuf = await loadPdfFromLocal(canvasId!)
                    if (idbPdfBuf) {
                        store.setPdfArrayBuffer(idbPdfBuf)
                    } else {
                        // Fallback: try legacy key based on fileData (for data saved before this fix)
                        await store.loadPdfFromStorage()
                    }
                } else {
                    // FS mode: load from disk, cache to IndexedDB for fast repeat access
                    const appState = useAppStore.getState()
                    const canvasMeta = appState.canvasList.find(c => c.id === canvasId)
                    const parentHandle = await resolveParentHandle(
                        directoryHandle!,
                        appState.folderList,
                        canvasMeta?.parentFolderId,
                    )
                    const pdfBuf = await fsLoadPdf(parentHandle, canvasId!)
                    if (pdfBuf) {
                        store.setPdfArrayBuffer(pdfBuf)
                        if (stateObj?.fileData) {
                            const key = stateObj.fileData.pdf_id || stateObj.fileData.filename || 'current_pdf'
                            savePdfToLocal(key, pdfBuf).catch(() => { })
                        }
                    } else if (stateObj?.fileData) {
                        await store.loadPdfFromStorage()
                    }

                    // Re-hydrate voice note audio blobs from file system into IndexedDB
                    // (handles the case where IndexedDB was cleared, e.g. after logout/login)
                    const loadedNodes = stateObj?.nodes ?? []
                    const voiceNodesToHydrate = (loadedNodes as any[]).filter(
                        (n: any) => n.type === 'voiceNoteNode' && n.data?.audioId
                    )
                    for (const node of voiceNodesToHydrate) {
                        const audioId = node.data.audioId as string
                        const existingBlob = await loadAudio(audioId).catch(() => null)
                        if (!existingBlob) {
                            const blob = await fsLoadVoiceAudio(parentHandle, canvasId!, audioId).catch(() => null)
                            if (blob) {
                                await saveAudio(audioId, blob).catch(() => { })
                            }
                        }
                    }
                }

                // Re-derive raw_text & markdown_content if they were stripped during save.
                // Runs lazily in background so it doesn't block rendering.
                const currentFileData = useCanvasStore.getState().fileData
                const loadedPdf = useCanvasStore.getState().pdfArrayBuffer
                if (currentFileData && (!currentFileData.raw_text || currentFileData.raw_text.length === 0) && loadedPdf) {
                    extractPdfPagesTextFromBuffer(loadedPdf).then((pages) => {
                        if (!mountedRef.current) return
                        const rawText = pages.join('\n\n')
                        const markdownContent = pages.map((p, i) => `## Page ${i + 1}\n${p}`).join('\n\n')
                        const s = useCanvasStore.getState()
                        s.updateFileDataText(rawText, markdownContent)
                    }).catch((err) => console.warn('[CanvasPage] PDF text re-extraction failed:', err))
                }

                if (mountedRef.current) {
                    setLoading(false)
                    setDirty(false)
                }
            } catch (err) {
                console.error('[CanvasPage] load failed:', err)
                if (mountedRef.current) {
                    setLoadError('Failed to load canvas data.')
                    setLoading(false)
                }
            }
        }

        load()

        return () => {
            mountedRef.current = false
            setActiveCanvasId(null)
        }
    }, [directoryHandle, storageMode, canvasId, setActiveCanvasId, setDirty])

    // ── Mark dirty on store changes ──────────────────────────────────────────
    useEffect(() => {
        const unsub = useCanvasStore.subscribe(() => {
            if (mountedRef.current) setDirty(true)
        })
        return unsub
    }, [setDirty])

    // ── Auto-save interval ───────────────────────────────────────────────────
    useEffect(() => {
        const timer = setInterval(() => {
            if (isDirty && mountedRef.current) {
                saveCanvas().then(() => {
                    if (mountedRef.current) setLastAutoSave(new Date())
                }).catch(() => { })
            }
        }, autoSaveInterval)
        return () => clearInterval(timer)
    }, [isDirty, saveCanvas, autoSaveInterval])

    // ── Save on page unload ──────────────────────────────────────────────────
    useEffect(() => {
        const handler = () => {
            if (isDirty) {
                // Best-effort: persist to localStorage synchronously
                useCanvasStore.getState().persistToLocalStorage()
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isDirty])

    // ── Block navigation if dirty ────────────────────────────────────────────
    const blocker = useBlocker(isDirty)

    useEffect(() => {
        if (blocker.state === 'blocked') {
            // Auto-save then proceed
            saveCanvas().then(() => {
                blocker.proceed()
            })
        }
    }, [blocker, saveCanvas])

    // ── Clean up store on unmount ────────────────────────────────────────────
    useEffect(() => {
        return () => {
            // Save an IndexedDB backup before clearing (crash-safe)
            if (canvasId) {
                const s = useCanvasStore.getState()
                const backup = {
                    nodes: s.nodes, edges: s.edges, fileData: s.fileData,
                    highlights: s.highlights, userDetails: s.userDetails,
                    currentPage: s.currentPage, pageMarkdowns: s.pageMarkdowns,
                    zoomLevel: s.zoomLevel, scrollPositions: s.scrollPositions,
                    canvasViewport: s.canvasViewport, drawingStrokes: s.drawingStrokes,
                    savedColors: s.savedColors, toolSettings: s.toolSettings,
                }
                saveCanvasBackup(canvasId, backup).catch(() => { })
            }
            // Save before leaving
            if (useAppStore.getState().isDirty) {
                // Fire-and-forget — we can't await in a cleanup
                saveCanvas()
            }
            // Clear the canvas store so the next canvas starts fresh
            useCanvasStore.getState().clearForNewCanvas()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleGoHome = useCallback(async () => {
        try {
            await saveCanvas()
        } catch {
            // Save failed — still navigate home
        }
        navigate('/')
    }, [navigate, saveCanvas])

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm w-full mx-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-500">Loading canvas…</p>
                </div>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm w-full mx-4">
                    <p className="text-sm text-red-600 mb-4">{loadError}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        )
    }

    return (
        <ReactFlowProvider>
            <Canvas onGoHome={handleGoHome} onSave={saveCanvas} lastAutoSave={lastAutoSave} autoSaveInterval={autoSaveInterval} />
        </ReactFlowProvider>
    )
}
