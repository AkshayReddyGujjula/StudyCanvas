import { create } from 'zustand'
import type { CanvasMeta, FolderMeta } from '../types'
import {
    loadDirectoryHandle,
    storeDirectoryHandle,
    clearDirectoryHandle,
    ensurePermission,
    readManifest,
    writeManifest,
    getCanvasFolder,
    deleteCanvasFolder as fsDeleteCanvasFolder,
    openExistingFolder,
    resolveParentHandle,
    createFolderOnDisk,
    deleteFolderOnDisk,
    moveCanvasOnDisk,
    moveFolderOnDisk,
    type Manifest,
} from '../services/fileSystemService'

// ─── App store — global state for multi-canvas homepage ──────────────────────

interface AppState {
    /** User display name (from onboarding) */
    userName: string
    /** Whether the user has completed onboarding (handle stored in IndexedDB) */
    isOnboarded: boolean
    /** Handle to the StudyCanvas root folder on disk. Not serialisable — lives in IndexedDB. */
    directoryHandle: FileSystemDirectoryHandle | null
    /** Whether we have read-write permission on the handle */
    hasPermission: boolean
    /** Whether the app is still initialising (loading handle + manifest) */
    isLoading: boolean
    /** List of canvases from manifest.json */
    canvasList: CanvasMeta[]
    /** List of folders from manifest.json */
    folderList: FolderMeta[]
    /** ID of the canvas currently open (if any) */
    activeCanvasId: string | null
    /** Whether the currently open canvas has unsaved changes */
    isDirty: boolean
    /** Whether permission was denied and user needs to re-grant */
    needsPermission: boolean
    /** Auto-save interval in milliseconds (default 30000 = 30s) */
    autoSaveInterval: number
}

interface AppActions {
    /** Boot the app: load handle from IndexedDB → request permission → read manifest. */
    initialize: () => Promise<void>
    /** Complete onboarding: store handle + manifest, set state. */
    completeOnboarding: (name: string, handle: FileSystemDirectoryHandle) => Promise<void>
    /** Set the directory handle (e.g. after re-selection). */
    setDirectoryHandle: (handle: FileSystemDirectoryHandle) => Promise<void>
    /** Add a new canvas to the manifest and local state. */
    addCanvas: (meta: CanvasMeta) => Promise<void>
    /** Remove a canvas (deletes folder on disk + updates manifest). */
    removeCanvas: (canvasId: string) => Promise<void>
    /** Rename a canvas. */
    renameCanvas: (canvasId: string, newTitle: string) => Promise<void>
    /** Update the modifiedAt timestamp for a canvas. */
    touchCanvas: (canvasId: string) => Promise<void>
    setActiveCanvasId: (id: string | null) => void
    setDirty: (dirty: boolean) => void
    /** Re-read manifest from disk and refresh canvasList + folderList. */
    refreshManifest: () => Promise<void>
    /** Reset the entire app state (e.g. logout). */
    resetApp: () => Promise<void>
    /** Restore from an existing StudyCanvas folder (validates + loads manifest). */
    restoreFromExisting: () => Promise<void>
    /** Set the auto-save interval (ms). Persisted in localStorage. */
    setAutoSaveInterval: (ms: number) => void

    // ─── Folder actions ──────────────────────────────────────────────────
    /** Create a new folder. */
    addFolder: (name: string, parentFolderId?: string | null) => Promise<void>
    /** Delete a folder and all canvases/subfolders inside it. */
    removeFolder: (folderId: string) => Promise<void>
    /** Rename a folder. */
    renameFolder: (folderId: string, newName: string) => Promise<void>
    /** Move a canvas into a different folder. Returns error string if validation fails. */
    moveCanvas: (canvasId: string, targetFolderId: string | null) => Promise<string | null>
    /** Move a folder into a different parent folder. Returns error string if validation fails. */
    moveFolder: (folderId: string, targetParentId: string | null) => Promise<string | null>
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
    userName: '',
    isOnboarded: false,
    directoryHandle: null,
    hasPermission: false,
    isLoading: true,
    canvasList: [],
    folderList: [],
    activeCanvasId: null,
    isDirty: false,
    needsPermission: false,
    autoSaveInterval: parseInt(localStorage.getItem('studycanvas_autosave') || '30000', 10),

    initialize: async () => {
        set({ isLoading: true })
        try {
            const handle = await loadDirectoryHandle()
            if (!handle) {
                set({ isOnboarded: false, isLoading: false })
                return
            }
            let granted = false
            try {
                granted = await ensurePermission(handle)
            } catch {
                granted = false
            }
            if (!granted) {
                set({ isOnboarded: true, directoryHandle: handle, hasPermission: false, needsPermission: true, isLoading: false })
                return
            }
            const manifest = await readManifest(handle)
            set({
                isOnboarded: true,
                directoryHandle: handle,
                hasPermission: true,
                needsPermission: false,
                userName: manifest.user.name,
                canvasList: manifest.canvases,
                folderList: manifest.folders ?? [],
                isLoading: false,
            })
        } catch (err) {
            console.error('[appStore] initialize failed:', err)
            set({ isLoading: false })
        }
    },

    completeOnboarding: async (name, handle) => {
        await storeDirectoryHandle(handle)
        const manifest: Manifest = { version: 1, user: { name }, canvases: [], folders: [] }
        await writeManifest(handle, manifest)
        set({
            userName: name,
            isOnboarded: true,
            directoryHandle: handle,
            hasPermission: true,
            needsPermission: false,
            canvasList: [],
            folderList: [],
        })
    },

    setDirectoryHandle: async (handle) => {
        await storeDirectoryHandle(handle)
        const granted = await ensurePermission(handle)
        if (granted) {
            const manifest = await readManifest(handle)
            set({
                directoryHandle: handle,
                hasPermission: true,
                needsPermission: false,
                userName: manifest.user.name,
                canvasList: manifest.canvases,
                folderList: manifest.folders ?? [],
            })
        }
    },

    addCanvas: async (meta) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return
        // Resolve the parent directory for this canvas
        const parentHandle = await resolveParentHandle(directoryHandle, folderList, meta.parentFolderId)
        await getCanvasFolder(parentHandle, meta.id, true)
        const updated = [...canvasList, meta]
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updated
        manifest.folders = folderList
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updated })
    },

    removeCanvas: async (canvasId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return
        const canvas = canvasList.find((c) => c.id === canvasId)
        try {
            const parentHandle = await resolveParentHandle(directoryHandle, folderList, canvas?.parentFolderId)
            await fsDeleteCanvasFolder(parentHandle, canvasId)
        } catch { /* folder might not exist */ }
        const updated = canvasList.filter((c) => c.id !== canvasId)
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updated
        manifest.folders = folderList
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updated })
    },

    renameCanvas: async (canvasId, newTitle) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return
        const updated = canvasList.map((c) => (c.id === canvasId ? { ...c, title: newTitle } : c))
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updated
        manifest.folders = folderList
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updated })
    },

    touchCanvas: async (canvasId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return
        const now = new Date().toISOString()
        const updated = canvasList.map((c) => (c.id === canvasId ? { ...c, modifiedAt: now } : c))
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updated
        manifest.folders = folderList
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updated })
    },

    setActiveCanvasId: (id) => set({ activeCanvasId: id }),
    setDirty: (dirty) => set({ isDirty: dirty }),

    refreshManifest: async () => {
        const { directoryHandle } = get()
        if (!directoryHandle) return
        const manifest = await readManifest(directoryHandle)
        set({ canvasList: manifest.canvases, folderList: manifest.folders ?? [], userName: manifest.user.name })
    },

    resetApp: async () => {
        await clearDirectoryHandle()
        set({
            userName: '',
            isOnboarded: false,
            directoryHandle: null,
            hasPermission: false,
            canvasList: [],
            folderList: [],
            activeCanvasId: null,
            isDirty: false,
            needsPermission: false,
        })
    },

    restoreFromExisting: async () => {
        const { handle, manifest } = await openExistingFolder()
        await storeDirectoryHandle(handle)
        set({
            userName: manifest.user.name,
            isOnboarded: true,
            directoryHandle: handle,
            hasPermission: true,
            needsPermission: false,
            canvasList: manifest.canvases,
            folderList: manifest.folders ?? [],
        })
    },

    setAutoSaveInterval: (ms) => {
        localStorage.setItem('studycanvas_autosave', String(ms))
        set({ autoSaveInterval: ms })
    },

    // ─── Folder actions ──────────────────────────────────────────────────

    addFolder: async (name, parentFolderId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return

        // Validate: no duplicate folder name in the same parent
        const siblings = folderList.filter(f => (f.parentFolderId ?? null) === (parentFolderId ?? null))
        if (siblings.some(f => f.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`A folder named "${name}" already exists here.`)
        }

        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const newFolder: FolderMeta = { id, name, parentFolderId: parentFolderId ?? null, createdAt: now }

        // Create on disk
        await createFolderOnDisk(directoryHandle, folderList, id, parentFolderId)

        // Update manifest
        const updatedFolders = [...folderList, newFolder]
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = canvasList
        manifest.folders = updatedFolders
        await writeManifest(directoryHandle, manifest)
        set({ folderList: updatedFolders })
    },

    removeFolder: async (folderId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return

        // Collect all descendant folder IDs (recursive)
        const allDescendantFolderIds = new Set<string>()
        const collectDescendants = (parentId: string) => {
            allDescendantFolderIds.add(parentId)
            for (const f of folderList) {
                if (f.parentFolderId === parentId && !allDescendantFolderIds.has(f.id)) {
                    collectDescendants(f.id)
                }
            }
        }
        collectDescendants(folderId)

        // Remove all canvases inside this folder and descendants
        const updatedCanvases = canvasList.filter(c => !allDescendantFolderIds.has(c.parentFolderId ?? ''))
        // Remove all descendant folders + the folder itself
        const updatedFolders = folderList.filter(f => !allDescendantFolderIds.has(f.id))

        // Delete folder from disk
        const folder = folderList.find(f => f.id === folderId)
        try {
            await deleteFolderOnDisk(directoryHandle, folderList, folderId, folder?.parentFolderId)
        } catch { /* might not exist */ }

        // Update manifest
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updatedCanvases
        manifest.folders = updatedFolders
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updatedCanvases, folderList: updatedFolders })
    },

    renameFolder: async (folderId, newName) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return

        const folder = folderList.find(f => f.id === folderId)
        if (!folder) return

        // Validate: no duplicate folder name in the same parent
        const siblings = folderList.filter(f =>
            f.id !== folderId && (f.parentFolderId ?? null) === (folder.parentFolderId ?? null)
        )
        if (siblings.some(f => f.name.toLowerCase() === newName.toLowerCase())) {
            throw new Error(`A folder named "${newName}" already exists here.`)
        }

        const updatedFolders = folderList.map(f =>
            f.id === folderId ? { ...f, name: newName } : f
        )
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = canvasList
        manifest.folders = updatedFolders
        await writeManifest(directoryHandle, manifest)
        set({ folderList: updatedFolders })
    },

    moveCanvas: async (canvasId, targetFolderId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return null

        const canvas = canvasList.find(c => c.id === canvasId)
        if (!canvas) return 'Canvas not found.'
        const fromFolderId = canvas.parentFolderId ?? null
        if (fromFolderId === targetFolderId) return null // already there

        // Validate: no duplicate canvas name in target folder
        const siblingsInTarget = canvasList.filter(c =>
            c.id !== canvasId && (c.parentFolderId ?? null) === targetFolderId
        )
        if (siblingsInTarget.some(c => c.title.toLowerCase() === canvas.title.toLowerCase())) {
            return `A canvas named "${canvas.title}" already exists in this folder.`
        }

        // Move on disk
        await moveCanvasOnDisk(directoryHandle, folderList, canvasId, fromFolderId, targetFolderId)

        // Update manifest
        const updatedCanvases = canvasList.map(c =>
            c.id === canvasId ? { ...c, parentFolderId: targetFolderId } : c
        )
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = updatedCanvases
        manifest.folders = folderList
        await writeManifest(directoryHandle, manifest)
        set({ canvasList: updatedCanvases })
        return null
    },

    moveFolder: async (folderId, targetParentId) => {
        const { directoryHandle, canvasList, folderList } = get()
        if (!directoryHandle) return null

        const folder = folderList.find(f => f.id === folderId)
        if (!folder) return 'Folder not found.'
        const fromParentId = folder.parentFolderId ?? null
        if (fromParentId === targetParentId) return null // already there

        // Prevent moving into itself
        if (folderId === targetParentId) return 'Cannot move a folder into itself.'

        // Prevent moving into a descendant (circular)
        if (targetParentId) {
            const isDescendant = (parentId: string, targetId: string): boolean => {
                const children = folderList.filter(f => f.parentFolderId === parentId)
                for (const child of children) {
                    if (child.id === targetId) return true
                    if (isDescendant(child.id, targetId)) return true
                }
                return false
            }
            if (isDescendant(folderId, targetParentId)) {
                return 'Cannot move a folder into one of its subfolders.'
            }
        }

        // Validate: no duplicate folder name in target parent
        const siblingsInTarget = folderList.filter(f =>
            f.id !== folderId && (f.parentFolderId ?? null) === targetParentId
        )
        if (siblingsInTarget.some(f => f.name.toLowerCase() === folder.name.toLowerCase())) {
            return `A folder named "${folder.name}" already exists in the destination.`
        }

        // Move on disk
        await moveFolderOnDisk(directoryHandle, folderList, folderId, fromParentId, targetParentId)

        // Update manifest
        const updatedFolders = folderList.map(f =>
            f.id === folderId ? { ...f, parentFolderId: targetParentId } : f
        )
        const manifest = await readManifest(directoryHandle)
        manifest.canvases = canvasList
        manifest.folders = updatedFolders
        await writeManifest(directoryHandle, manifest)
        set({ folderList: updatedFolders })
        return null
    },
}))
