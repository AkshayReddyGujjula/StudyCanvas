import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './Canvas'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'
import {
    loadCanvasState,
    saveCanvasState,
    loadPdf as fsLoadPdf,
    savePdf as fsSavePdf,
    saveThumbnail,
    resolveParentHandle,
} from '../services/fileSystemService'
import { savePdfToLocal, loadPdfFromLocal } from '../utils/pdfStorage'
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
    const savingRef = useRef(false)
    const mountedRef = useRef(true)

    const directoryHandle = useAppStore((s) => s.directoryHandle)
    const isDirty = useAppStore((s) => s.isDirty)
    const setDirty = useAppStore((s) => s.setDirty)
    const setActiveCanvasId = useAppStore((s) => s.setActiveCanvasId)
    const touchCanvas = useAppStore((s) => s.touchCanvas)
    const autoSaveInterval = useAppStore((s) => s.autoSaveInterval)

    // ── Save current canvas to the local folder ──────────────────────────────
    const saveCanvas = useCallback(async () => {
        if (!directoryHandle || !canvasId || savingRef.current) return
        savingRef.current = true
        try {
            // Resolve the correct parent directory for this canvas (may be inside a folder)
            const appState = useAppStore.getState()
            const canvasMeta = appState.canvasList.find(c => c.id === canvasId)
            const parentHandle = await resolveParentHandle(
                directoryHandle,
                appState.folderList,
                canvasMeta?.parentFolderId,
            )

            const store = useCanvasStore.getState()
            const {
                nodes, edges, fileData, highlights, userDetails,
                currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport,
            } = store

            // 1. Save state.json
            const stateObj = { nodes, edges, fileData, highlights, userDetails, currentPage, pageMarkdowns, zoomLevel, scrollPositions, canvasViewport }
            await saveCanvasState(parentHandle, canvasId, stateObj)

            // 2. Save PDF to the local folder (if we have it in memory or IndexedDB)
            const pdfBuffer = store.pdfArrayBuffer
            if (pdfBuffer) {
                await fsSavePdf(parentHandle, canvasId, pdfBuffer)
            } else if (fileData) {
                // Try loading from IndexedDB cache
                const key = fileData.pdf_id || fileData.filename || 'current_pdf'
                const cached = await loadPdfFromLocal(key)
                if (cached) {
                    await fsSavePdf(parentHandle, canvasId, cached)
                }
            }

            // 3. Capture thumbnail
            try {
                const rfEl = document.querySelector('.react-flow') as HTMLElement | null
                if (rfEl) {
                    // Find the viewport container which holds the actual nodes
                    const viewport = rfEl.querySelector('.react-flow__viewport') as HTMLElement | null
                    const target = viewport ?? rfEl

                    // Use a higher-fidelity capture: render at native size then scale down.
                    // First get the bounding box of what's visible, then capture with
                    // proper pixel ratio for sharpness.
                    const dataUrl = await toPng(target, {
                        quality: 0.85,
                        pixelRatio: 0.5,  // Half native pixel ratio for reasonable file size
                        backgroundColor: '#f1f5f9',  // slate-100 background
                        filter: (node) => {
                            // Exclude minimap, controls, and panels from thumbnail
                            const el = node as HTMLElement
                            if (el.classList?.contains('react-flow__minimap')) return false
                            if (el.classList?.contains('react-flow__controls')) return false
                            if (el.classList?.contains('react-flow__panel')) return false
                            // Exclude any fixed/absolute overlays (menus, popups)
                            if (el.classList?.contains('react-flow__attribution')) return false
                            return true
                        },
                    })
                    const res = await fetch(dataUrl)
                    const blob = await res.blob()
                    await saveThumbnail(parentHandle, canvasId, blob)
                }
            } catch {
                // Thumbnail capture is best-effort
            }

            // 4. Update manifest timestamp
            await touchCanvas(canvasId)

            // 5. Also update localStorage cache
            store.persistToLocalStorage()

            setDirty(false)
        } catch (err) {
            console.error('[CanvasPage] save failed:', err)
        } finally {
            savingRef.current = false
        }
    }, [directoryHandle, canvasId, touchCanvas, setDirty])

    // ── Load canvas on mount ─────────────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true
        if (!directoryHandle || !canvasId) {
            setLoadError('No workspace folder available.')
            setLoading(false)
            return
        }

        setActiveCanvasId(canvasId)

        const load = async () => {
            try {
                // Resolve the correct parent directory for this canvas
                const appState = useAppStore.getState()
                const canvasMeta = appState.canvasList.find(c => c.id === canvasId)
                const parentHandle = await resolveParentHandle(
                    directoryHandle,
                    appState.folderList,
                    canvasMeta?.parentFolderId,
                )

                // Load state.json
                const stateObj = await loadCanvasState(parentHandle, canvasId)
                const store = useCanvasStore.getState()

                if (stateObj) {
                    if (stateObj.nodes) store.setNodes(stateObj.nodes)
                    if (stateObj.edges) {
                        // Migrate old edges
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                }

                // Always hydrate canvasStore.userDetails from the global user context
                // so every canvas query uses the latest context
                const globalCtx = useAppStore.getState().userContext
                if (globalCtx.name || globalCtx.age || globalCtx.status || globalCtx.educationLevel) {
                    store.setUserDetails(globalCtx)
                }

                // Load PDF: try local folder first, fall back to IndexedDB
                const pdfBuf = await fsLoadPdf(parentHandle, canvasId)
                if (pdfBuf) {
                    store.setPdfArrayBuffer(pdfBuf)
                    // Also cache in IndexedDB for fast access
                    if (stateObj?.fileData) {
                        const key = stateObj.fileData.pdf_id || stateObj.fileData.filename || 'current_pdf'
                        savePdfToLocal(key, pdfBuf).catch(() => {})
                    }
                } else if (stateObj?.fileData) {
                    // Try IndexedDB
                    await store.loadPdfFromStorage()
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
    }, [directoryHandle, canvasId, setActiveCanvasId, setDirty])

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
                saveCanvas()
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
            <Canvas onGoHome={handleGoHome} onSave={saveCanvas} />
        </ReactFlowProvider>
    )
}
