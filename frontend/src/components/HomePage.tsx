import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import CanvasCard from './CanvasCard'
import FolderCard from './FolderCard'
import ToolsModal from './ToolsModal'
import { ensurePermission, reselectRootFolder } from '../services/fileSystemService'

export default function HomePage() {
    const navigate = useNavigate()
    const userName = useAppStore((s) => s.userName)
    const canvasList = useAppStore((s) => s.canvasList)
    const folderList = useAppStore((s) => s.folderList)
    const addCanvas = useAppStore((s) => s.addCanvas)
    const addFolder = useAppStore((s) => s.addFolder)
    const moveCanvas = useAppStore((s) => s.moveCanvas)
    const moveFolder = useAppStore((s) => s.moveFolder)
    const directoryHandle = useAppStore((s) => s.directoryHandle)
    const needsPermission = useAppStore((s) => s.needsPermission)
    const setDirectoryHandle = useAppStore((s) => s.setDirectoryHandle)
    const resetApp = useAppStore((s) => s.resetApp)

    const [showSettingsMenu, setShowSettingsMenu] = useState(false)
    const [showContext, setShowContext] = useState(false)
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
    const [showAutosaveMenu, setShowAutosaveMenu] = useState(false)
    const autoSaveInterval = useAppStore((s) => s.autoSaveInterval)
    const setAutoSaveInterval = useAppStore((s) => s.setAutoSaveInterval)
    const settingsRef = useRef<HTMLDivElement>(null)

    // ─── Folder navigation state ─────────────────────────────────────────
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [dragError, setDragError] = useState<string | null>(null)
    const [isDragOverBack, setIsDragOverBack] = useState(false)

    // Close settings menu on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettingsMenu(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Clear drag error after timeout
    useEffect(() => {
        if (!dragError) return
        const t = setTimeout(() => setDragError(null), 4000)
        return () => clearTimeout(t)
    }, [dragError])

    const handleNewCanvas = async () => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        await addCanvas({
            id,
            title: 'Untitled',
            createdAt: now,
            modifiedAt: now,
            parentFolderId: currentFolderId,
        })
        navigate(`/canvas/${id}`)
    }

    const handleNewFolder = async () => {
        const siblings = folderList.filter(f => (f.parentFolderId ?? null) === currentFolderId)
        let name = 'New Folder'
        let counter = 1
        while (siblings.some(f => f.name.toLowerCase() === name.toLowerCase())) {
            counter++
            name = `New Folder ${counter}`
        }
        try {
            await addFolder(name, currentFolderId)
        } catch (err) {
            setDragError(err instanceof Error ? err.message : 'Failed to create folder')
        }
    }

    const handleOpenCanvas = (canvasId: string) => {
        navigate(`/canvas/${canvasId}`)
    }

    const handleOpenFolder = (folderId: string) => {
        setCurrentFolderId(folderId)
    }

    const handleGrantPermission = async () => {
        if (directoryHandle) {
            try {
                const granted = await ensurePermission(directoryHandle)
                if (granted) {
                    await useAppStore.getState().refreshManifest()
                    useAppStore.setState({ hasPermission: true, needsPermission: false })
                    return
                }
            } catch { /* fall through to re-select */ }
        }
        try {
            const handle = await reselectRootFolder()
            await setDirectoryHandle(handle)
        } catch {
            // user cancelled
        }
    }

    // ─── Drag & drop handlers ────────────────────────────────────────────

    const handleDragStartCanvas = useCallback((e: React.DragEvent, canvasId: string) => {
        e.dataTransfer.setData('application/studycanvas-canvas', canvasId)
        e.dataTransfer.effectAllowed = 'move'
    }, [])

    const handleDragStartFolder = useCallback((e: React.DragEvent, folderId: string) => {
        e.dataTransfer.setData('application/studycanvas-folder', folderId)
        e.dataTransfer.effectAllowed = 'move'
    }, [])

    const handleDropOnFolder = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
        const canvasId = e.dataTransfer.getData('application/studycanvas-canvas')
        const folderId = e.dataTransfer.getData('application/studycanvas-folder')

        if (canvasId) {
            const err = await moveCanvas(canvasId, targetFolderId)
            if (err) setDragError(err)
        } else if (folderId) {
            if (folderId === targetFolderId) return
            const err = await moveFolder(folderId, targetFolderId)
            if (err) setDragError(err)
        }
    }, [moveCanvas, moveFolder])

    // Drop on the Back button = move item to parent folder
    const handleDropOnBack = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOverBack(false)

        if (!currentFolderId) return // shouldn't happen — Back button only shown inside a folder
        const currentFolder = folderList.find(f => f.id === currentFolderId)
        const parentId = currentFolder?.parentFolderId ?? null

        const canvasId = e.dataTransfer.getData('application/studycanvas-canvas')
        const folderId = e.dataTransfer.getData('application/studycanvas-folder')

        if (canvasId) {
            const err = await moveCanvas(canvasId, parentId)
            if (err) setDragError(err)
        } else if (folderId) {
            const err = await moveFolder(folderId, parentId)
            if (err) setDragError(err)
        }
    }, [moveCanvas, moveFolder, currentFolderId, folderList])

    // Drop on the "background" area = move to current folder (or root)
    const handleDropOnBackground = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        const canvasId = e.dataTransfer.getData('application/studycanvas-canvas')
        const folderId = e.dataTransfer.getData('application/studycanvas-folder')

        if (canvasId) {
            const err = await moveCanvas(canvasId, currentFolderId)
            if (err) setDragError(err)
        } else if (folderId) {
            const err = await moveFolder(folderId, currentFolderId)
            if (err) setDragError(err)
        }
    }, [moveCanvas, moveFolder, currentFolderId])

    // ─── Breadcrumb path ─────────────────────────────────────────────────

    const breadcrumbPath = (() => {
        const path: { id: string | null; name: string }[] = [{ id: null, name: 'Home' }]
        let id = currentFolderId
        const visited = new Set<string>()
        while (id) {
            if (visited.has(id)) break
            visited.add(id)
            const f = folderList.find(folder => folder.id === id)
            if (!f) break
            path.push({ id: f.id, name: f.name })
            id = f.parentFolderId ?? null
        }
        const root = path[0]
        const rest = path.slice(1).reverse()
        return [root, ...rest]
    })()

    // ─── Items in current folder ─────────────────────────────────────────

    const foldersInView = folderList
        .filter(f => (f.parentFolderId ?? null) === currentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name))

    const canvasesInView = canvasList
        .filter(c => (c.parentFolderId ?? null) === currentFolderId)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

    if (needsPermission) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full mx-4 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Permission Required</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        StudyCanvas needs access to your local folder to load your saved canvases.
                    </p>
                    <button
                        onClick={handleGrantPermission}
                        className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                    >
                        Grant Access
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                        <span className="text-lg font-bold text-gray-900">StudyCanvas</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">{userName}</span>
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        <div ref={settingsRef} className="relative">
                            <button
                                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Settings"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                            </button>
                            {showSettingsMenu && (
                                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                                    <button
                                        onClick={() => { setShowSettingsMenu(false); setShowContext(true) }}
                                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                        </svg>
                                        Context
                                    </button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                        onClick={() => { setShowSettingsMenu(false); setShowAutosaveMenu(true) }}
                                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        Autosave
                                        <span className="ml-auto text-xs text-gray-400">{autoSaveInterval / 1000}s</span>
                                    </button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                        onClick={() => { setShowSettingsMenu(false); setShowLogoutConfirm(true) }}
                                        className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                            <polyline points="16 17 21 12 16 7" />
                                            <line x1="21" y1="12" x2="9" y2="12" />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main
                className="max-w-7xl mx-auto px-6 py-8"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnBackground}
            >
                {/* Breadcrumbs */}
                {currentFolderId && (
                    <nav className="flex items-center gap-1.5 mb-5 text-sm">
                        {breadcrumbPath.map((crumb, i) => (
                            <span key={crumb.id ?? 'root'} className="flex items-center gap-1.5">
                                {i > 0 && (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                )}
                                <button
                                    onClick={() => setCurrentFolderId(crumb.id)}
                                    className={`hover:text-indigo-600 transition-colors ${
                                        i === breadcrumbPath.length - 1
                                            ? 'text-gray-800 font-medium'
                                            : 'text-gray-400 hover:underline'
                                    }`}
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        ))}
                    </nav>
                )}

                {/* Action buttons row */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={handleNewCanvas}
                        className="h-[52px] px-5 flex items-center gap-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer font-medium text-sm shadow-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New Canvas
                    </button>
                    <button
                        onClick={handleNewFolder}
                        className="h-[52px] px-5 flex items-center gap-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer font-medium text-sm shadow-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            <line x1="12" y1="11" x2="12" y2="17" />
                            <line x1="9" y1="14" x2="15" y2="14" />
                        </svg>
                        New Folder
                    </button>

                    {/* Back button when in a folder — also a drop target */}
                    {currentFolderId && (
                        <button
                            onClick={() => {
                                const currentFolder = folderList.find(f => f.id === currentFolderId)
                                setCurrentFolderId(currentFolder?.parentFolderId ?? null)
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOverBack(true) }}
                            onDragLeave={() => setIsDragOverBack(false)}
                            onDrop={handleDropOnBack}
                            className={`h-[52px] px-4 flex items-center gap-2 rounded-xl border transition-colors cursor-pointer text-sm ${
                                isDragOverBack
                                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200'
                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            {isDragOverBack ? 'Drop to move here' : 'Back'}
                        </button>
                    )}
                </div>

                {/* Error toast */}
                {dragError && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {dragError}
                    </div>
                )}

                {/* Items grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {/* Folders first */}
                    {foldersInView.map((folder) => (
                        <FolderCard
                            key={folder.id}
                            folder={folder}
                            onOpen={() => handleOpenFolder(folder.id)}
                            onDragStart={(e) => handleDragStartFolder(e, folder.id)}
                            onDropItem={(e) => handleDropOnFolder(e, folder.id)}
                        />
                    ))}

                    {/* Then canvases */}
                    {canvasesInView.map((canvas) => (
                        <CanvasCard
                            key={canvas.id}
                            canvas={canvas}
                            onClick={() => handleOpenCanvas(canvas.id)}
                            onDragStart={(e) => handleDragStartCanvas(e, canvas.id)}
                        />
                    ))}
                </div>

                {foldersInView.length === 0 && canvasesInView.length === 0 && (
                    <div className="text-center mt-16">
                        <p className="text-gray-400 text-sm">
                            {currentFolderId
                                ? 'This folder is empty. Create a canvas or folder, or drag items here.'
                                : 'No canvases yet. Click "New Canvas" to get started!'}
                        </p>
                    </div>
                )}
            </main>

            {/* Context / User Details modal */}
            {showContext && <ToolsModal onClose={() => setShowContext(false)} />}

            {/* Logout confirmation modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowLogoutConfirm(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Log out?</h3>
                        <p className="text-sm text-gray-500 mb-5">
                            This will reset your session and take you back to the onboarding screen. Your saved canvas data on disk will not be deleted.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => { await resetApp(); setShowLogoutConfirm(false) }}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Autosave interval modal */}
            {showAutosaveMenu && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowAutosaveMenu(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Autosave Interval</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Choose how often your canvas is automatically saved.
                        </p>
                        <div className="flex flex-col gap-1.5">
                            {[
                                { label: '30 seconds', ms: 30_000 },
                                { label: '1 minute', ms: 60_000 },
                                { label: '2 minutes', ms: 120_000 },
                                { label: '3 minutes', ms: 180_000 },
                                { label: '5 minutes', ms: 300_000 },
                            ].map(({ label, ms }) => (
                                <button
                                    key={ms}
                                    onClick={() => { setAutoSaveInterval(ms); setShowAutosaveMenu(false) }}
                                    className={`w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between ${
                                        autoSaveInterval === ms
                                            ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-200'
                                            : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {label}
                                    {autoSaveInterval === ms && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setShowAutosaveMenu(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
