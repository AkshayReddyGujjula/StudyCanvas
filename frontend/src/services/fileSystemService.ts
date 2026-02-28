/**
 * File System Access API service for reading/writing canvas data
 * to a user-chosen local folder on disk.
 *
 * Folder structure:
 *   [User-chosen location]/StudyCanvas/
 *     ├── manifest.json          ← canvas registry + user info
 *     ├── canvas_<id>/
 *     │   ├── state.json         ← serialised canvas state (nodes, edges, etc.)
 *     │   ├── document.pdf       ← uploaded PDF
 *     │   └── thumbnail.png      ← canvas thumbnail for the homepage
 *     └── canvas_<id2>/ …
 *
 * NOTE: The File System Access API is only supported in Chromium browsers
 *       (Chrome ≥86, Edge ≥86, Opera ≥72). Firefox and Safari are NOT supported.
 */

// ─── IndexedDB helpers for persisting the directory handle across sessions ────

const HANDLE_DB_NAME = 'studycanvas_handles'
const HANDLE_DB_VERSION = 1
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'root'

function openHandleDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(HANDLE_STORE)) {
                db.createObjectStore(HANDLE_STORE)
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

/** Persist a FileSystemDirectoryHandle to IndexedDB so we can retrieve it after page reload. */
export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openHandleDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, 'readwrite')
        tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Load a previously-stored FileSystemDirectoryHandle from IndexedDB. Returns null if none saved. */
export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    const db = await openHandleDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, 'readonly')
        const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
    })
}

/** Remove the stored directory handle from IndexedDB. */
export async function clearDirectoryHandle(): Promise<void> {
    const db = await openHandleDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE, 'readwrite')
        tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// ─── Directory picker & permission helpers ───────────────────────────────────

/**
 * Check whether a directory already contains an entry with the given name.
 */
async function hasEntry(dirHandle: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
        await dirHandle.getDirectoryHandle(name)
        return true
    } catch {
        // Also check if it's a file with that name
        try {
            await dirHandle.getFileHandle(name)
            return true
        } catch {
            return false
        }
    }
}

/**
 * Check whether a directory looks like it IS a StudyCanvas data folder
 * (has a manifest.json inside it).
 */
async function isStudyCanvasFolder(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        await dirHandle.getFileHandle('manifest.json')
        return true
    } catch {
        return false
    }
}

/**
 * Walk upwards through the directory name chain to detect if we're inside
 * a StudyCanvas folder. The File System Access API doesn't expose parent
 * traversal, so we check if the selected folder's name is 'StudyCanvas'
 * or if it contains a manifest.json (which is how our app structures data).
 */

/**
 * Prompt the user to select a directory. Validates the selection and creates
 * a `StudyCanvas` subfolder inside the selected directory.
 *
 * Validation rules:
 *  1. The selected folder must NOT be named `StudyCanvas` (user picked the
 *     data folder itself instead of its parent).
 *  2. The selected folder must NOT already contain a `StudyCanvas` subfolder.
 *  3. The selected folder must NOT itself be a StudyCanvas data folder
 *     (contains manifest.json — i.e. user picked INSIDE an existing SC folder).
 *  4. The selected folder must NOT contain canvas_* subfolders (another sign
 *     the user picked inside a SC folder).
 */
export async function selectAndCreateRootFolder(): Promise<FileSystemDirectoryHandle> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
    })

    // ── Validation 1: User picked a folder literally named "StudyCanvas" ──
    if (parentHandle.name === 'StudyCanvas') {
        // Could be an existing SC data folder or coincidence. Check for manifest.
        const isSC = await isStudyCanvasFolder(parentHandle)
        if (isSC) {
            throw new FolderValidationError(
                'You selected a StudyCanvas data folder directly. Please select the parent folder where you want StudyCanvas to live.'
            )
        }
        // It's named StudyCanvas but isn't one — creating a nested StudyCanvas/StudyCanvas is confusing
        throw new FolderValidationError(
            'The selected folder is already named "StudyCanvas". Please choose a different location to avoid confusion.'
        )
    }

    // ── Validation 2: The selected folder already has a StudyCanvas child ──
    const hasExistingSC = await hasEntry(parentHandle, 'StudyCanvas')
    if (hasExistingSC) {
        // Check whether it actually looks like a StudyCanvas data folder
        try {
            const existingChild = await parentHandle.getDirectoryHandle('StudyCanvas')
            const isReal = await isStudyCanvasFolder(existingChild)
            if (isReal) {
                throw new FolderValidationError(
                    'This location already contains a StudyCanvas folder with data. Please choose a different location.'
                )
            }
        } catch (e) {
            if (e instanceof FolderValidationError) throw e
        }
        // A folder named StudyCanvas exists but has no manifest — still block it
        throw new FolderValidationError(
            'This location already contains a folder named "StudyCanvas". Please choose a different location or remove the existing folder first.'
        )
    }

    // ── Validation 3: Selected folder IS inside a StudyCanvas data folder ──
    //    Check for manifest.json (user picked the SC root itself without it being named "StudyCanvas")
    //    or canvas_* directories (user picked somewhere inside it).
    if (await isStudyCanvasFolder(parentHandle)) {
        throw new FolderValidationError(
            'This folder appears to be a StudyCanvas data folder (contains manifest.json). Please select a different location.'
        )
    }

    // Check for canvas_* subfolders which would indicate we're inside an SC folder
    let hasCanvasFolders = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of (parentHandle as any).entries()) {
        if (handle.kind === 'directory' && name.startsWith('canvas_')) {
            hasCanvasFolders = true
            break
        }
    }
    if (hasCanvasFolders) {
        throw new FolderValidationError(
            'This folder appears to be inside a StudyCanvas data directory (contains canvas folders). Please select a different location.'
        )
    }

    // ── All checks passed — create the StudyCanvas subfolder ──
    const rootHandle = await parentHandle.getDirectoryHandle('StudyCanvas', { create: true })
    return rootHandle
}

/** Custom error class for folder validation failures. */
export class FolderValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'FolderValidationError'
    }
}

/**
 * Validate and open an existing StudyCanvas data folder chosen by the user.
 * The user should pick the `StudyCanvas` folder itself (the one containing manifest.json).
 *
 * Validation rules:
 *  1. The folder must contain a valid manifest.json.
 *  2. The manifest must have a parseable JSON structure with `version`, `user.name`, and `canvases` array.
 *  3. There must be at least the manifest.json (not just an empty folder named "StudyCanvas").
 *  4. Protects against random folders that happen to have a manifest.json by
 *     checking the structure.
 */
export async function openExistingFolder(): Promise<{ handle: FileSystemDirectoryHandle; manifest: Manifest }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
    })

    // ── Check 1: Must have a manifest.json ──
    const hasManifest = await isStudyCanvasFolder(handle)
    if (!hasManifest) {
        // Maybe the user picked the parent folder that *contains* a StudyCanvas subfolder
        const hasChild = await hasEntry(handle, 'StudyCanvas')
        if (hasChild) {
            try {
                const child = await handle.getDirectoryHandle('StudyCanvas')
                const childHasManifest = await isStudyCanvasFolder(child)
                if (childHasManifest) {
                    throw new FolderValidationError(
                        'You selected the parent folder. Please select the "StudyCanvas" folder inside it, not its parent directory.'
                    )
                }
            } catch (e) {
                if (e instanceof FolderValidationError) throw e
            }
        }
        throw new FolderValidationError(
            'This folder is not a valid StudyCanvas data folder. It must contain a manifest.json file. Please select the correct StudyCanvas folder.'
        )
    }

    // ── Check 2: Parse and validate manifest structure ──
    let manifest: Manifest
    try {
        const fileHandle = await handle.getFileHandle('manifest.json')
        const file = await fileHandle.getFile()
        const text = await file.text()
        manifest = JSON.parse(text) as Manifest
    } catch {
        throw new FolderValidationError(
            'The manifest.json in this folder is corrupted or unreadable. Please select a valid StudyCanvas folder.'
        )
    }

    // ── Check 3: Validate manifest has required fields ──
    if (typeof manifest.version !== 'number') {
        throw new FolderValidationError(
            'Invalid StudyCanvas folder: manifest.json is missing a version field.'
        )
    }
    if (!manifest.user || typeof manifest.user.name !== 'string' || !manifest.user.name.trim()) {
        throw new FolderValidationError(
            'Invalid StudyCanvas folder: manifest.json is missing user information.'
        )
    }
    if (!Array.isArray(manifest.canvases)) {
        throw new FolderValidationError(
            'Invalid StudyCanvas folder: manifest.json has an invalid canvases list.'
        )
    }

    // ── Check 4: Verify at least some canvas folders exist if manifest says they should ──
    for (const canvas of manifest.canvases.slice(0, 5)) {
        try {
            await handle.getDirectoryHandle(canvasFolderName(canvas.id))
        } catch {
            // A listed canvas folder doesn't exist — warn but don't block
            console.warn(`[openExistingFolder] Canvas folder missing for "${canvas.title}" (${canvas.id})`)
        }
    }

    return { handle, manifest }
}

/**
 * Re-select an existing StudyCanvas folder (e.g. when permission was revoked).
 * The user must pick the `StudyCanvas` folder itself.
 */
export async function reselectRootFolder(): Promise<FileSystemDirectoryHandle> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
    })
    return handle
}

/**
 * Check if we have read-write permission on a handle.
 * If not, request it (requires a user gesture).
 * Returns true if granted, false otherwise.
 */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = handle as any
    const readPerm = await h.queryPermission({ mode: 'readwrite' })
    if (readPerm === 'granted') return true
    const requestPerm = await h.requestPermission({ mode: 'readwrite' })
    return requestPerm === 'granted'
}

// ─── Manifest operations ─────────────────────────────────────────────────────

export interface CanvasMeta {
    id: string
    title: string
    createdAt: string
    modifiedAt: string
    pdfFilename?: string
    pageCount?: number
    parentFolderId?: string | null
}

export interface FolderMeta {
    id: string
    name: string
    parentFolderId?: string | null
    createdAt: string
}

export interface Manifest {
    version: number
    user: { name: string }
    canvases: CanvasMeta[]
    folders?: FolderMeta[]
}

const MANIFEST_FILE = 'manifest.json'

function defaultManifest(userName: string): Manifest {
    return { version: 1, user: { name: userName }, canvases: [], folders: [] }
}

/** Read manifest.json from the StudyCanvas root folder. Creates a default if missing. */
export async function readManifest(rootHandle: FileSystemDirectoryHandle, fallbackName = ''): Promise<Manifest> {
    try {
        const fileHandle = await rootHandle.getFileHandle(MANIFEST_FILE)
        const file = await fileHandle.getFile()
        const text = await file.text()
        return JSON.parse(text) as Manifest
    } catch {
        // File doesn't exist yet — return default
        return defaultManifest(fallbackName)
    }
}

/** Write manifest.json to the StudyCanvas root folder. */
export async function writeManifest(rootHandle: FileSystemDirectoryHandle, manifest: Manifest): Promise<void> {
    const fileHandle = await rootHandle.getFileHandle(MANIFEST_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(manifest, null, 2))
    await writable.close()
}

// ─── Per-canvas folder operations ────────────────────────────────────────────

function canvasFolderName(canvasId: string) {
    return `canvas_${canvasId}`
}

/** Get (or create) a canvas subfolder handle. */
export async function getCanvasFolder(
    rootHandle: FileSystemDirectoryHandle,
    canvasId: string,
    create = false,
): Promise<FileSystemDirectoryHandle> {
    return rootHandle.getDirectoryHandle(canvasFolderName(canvasId), { create })
}

/** Delete an entire canvas subfolder recursively. */
export async function deleteCanvasFolder(rootHandle: FileSystemDirectoryHandle, canvasId: string): Promise<void> {
    await rootHandle.removeEntry(canvasFolderName(canvasId), { recursive: true })
}

// ─── Folder operations ───────────────────────────────────────────────────────

function folderDirName(folderId: string) {
    return `folder_${folderId}`
}

/**
 * Resolve the FileSystemDirectoryHandle for a given parentFolderId
 * by walking the folder hierarchy from root.
 * Returns rootHandle if parentFolderId is null/undefined (item is at root).
 */
export async function resolveParentHandle(
    rootHandle: FileSystemDirectoryHandle,
    folders: FolderMeta[],
    parentFolderId: string | null | undefined,
): Promise<FileSystemDirectoryHandle> {
    if (!parentFolderId) return rootHandle

    // Build path from root to target folder
    const path: string[] = []
    let currentId: string | null | undefined = parentFolderId
    const visited = new Set<string>()
    while (currentId) {
        if (visited.has(currentId)) break // guard against circular refs
        visited.add(currentId)
        path.unshift(currentId)
        const folder = folders.find(f => f.id === currentId)
        currentId = folder?.parentFolderId
    }

    // Walk the path from root
    let handle = rootHandle
    for (const folderId of path) {
        handle = await handle.getDirectoryHandle(folderDirName(folderId))
    }
    return handle
}

/** Create a new folder directory on disk. */
export async function createFolderOnDisk(
    rootHandle: FileSystemDirectoryHandle,
    folders: FolderMeta[],
    folderId: string,
    parentFolderId: string | null | undefined,
): Promise<void> {
    const parentHandle = await resolveParentHandle(rootHandle, folders, parentFolderId)
    await parentHandle.getDirectoryHandle(folderDirName(folderId), { create: true })
}

/** Delete a folder directory on disk recursively. */
export async function deleteFolderOnDisk(
    rootHandle: FileSystemDirectoryHandle,
    folders: FolderMeta[],
    folderId: string,
    parentFolderId: string | null | undefined,
): Promise<void> {
    const parentHandle = await resolveParentHandle(rootHandle, folders, parentFolderId)
    try {
        await parentHandle.removeEntry(folderDirName(folderId), { recursive: true })
    } catch {
        // folder might not exist on disk
    }
}

/** Copy a directory recursively from source to a new child of destParent. */
async function copyDirectoryRecursive(
    source: FileSystemDirectoryHandle,
    destParent: FileSystemDirectoryHandle,
    destName: string,
): Promise<FileSystemDirectoryHandle> {
    const dest = await destParent.getDirectoryHandle(destName, { create: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of (source as any).entries()) {
        if (handle.kind === 'file') {
            const file = await (handle as FileSystemFileHandle).getFile()
            const destFile = await dest.getFileHandle(name, { create: true })
            const writable = await destFile.createWritable()
            await writable.write(await file.arrayBuffer())
            await writable.close()
        } else {
            await copyDirectoryRecursive(handle as FileSystemDirectoryHandle, dest, name)
        }
    }
    return dest
}

/** Move a canvas directory from one parent folder to another on disk. */
export async function moveCanvasOnDisk(
    rootHandle: FileSystemDirectoryHandle,
    folders: FolderMeta[],
    canvasId: string,
    fromParentFolderId: string | null | undefined,
    toParentFolderId: string | null | undefined,
): Promise<void> {
    const fromHandle = await resolveParentHandle(rootHandle, folders, fromParentFolderId)
    const toHandle = await resolveParentHandle(rootHandle, folders, toParentFolderId)

    const dirName = canvasFolderName(canvasId)
    try {
        const sourceDir = await fromHandle.getDirectoryHandle(dirName)
        await copyDirectoryRecursive(sourceDir, toHandle, dirName)
        await fromHandle.removeEntry(dirName, { recursive: true })
    } catch {
        // Source doesn't exist — create empty dir at destination
        await toHandle.getDirectoryHandle(dirName, { create: true })
    }
}

/** Move a folder directory from one parent to another on disk. */
export async function moveFolderOnDisk(
    rootHandle: FileSystemDirectoryHandle,
    folders: FolderMeta[],
    folderId: string,
    fromParentFolderId: string | null | undefined,
    toParentFolderId: string | null | undefined,
): Promise<void> {
    const fromHandle = await resolveParentHandle(rootHandle, folders, fromParentFolderId)
    const toHandle = await resolveParentHandle(rootHandle, folders, toParentFolderId)

    const dirName = folderDirName(folderId)
    try {
        const sourceDir = await fromHandle.getDirectoryHandle(dirName)
        await copyDirectoryRecursive(sourceDir, toHandle, dirName)
        await fromHandle.removeEntry(dirName, { recursive: true })
    } catch {
        // Source doesn't exist — create empty dir at destination
        await toHandle.getDirectoryHandle(dirName, { create: true })
    }
}

// ─── Canvas state (JSON) ─────────────────────────────────────────────────────

const STATE_FILE = 'state.json'

export async function saveCanvasState(
    rootHandle: FileSystemDirectoryHandle,
    canvasId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateObj: Record<string, any> | string,
): Promise<void> {
    const folder = await getCanvasFolder(rootHandle, canvasId, true)
    const fileHandle = await folder.getFileHandle(STATE_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    // Accept a pre-serialized JSON string (from Web Worker) or an object
    const json = typeof stateObj === 'string' ? stateObj : JSON.stringify(stateObj)
    await writable.write(json)
    await writable.close()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCanvasState(rootHandle: FileSystemDirectoryHandle, canvasId: string): Promise<Record<string, any> | null> {
    try {
        const folder = await getCanvasFolder(rootHandle, canvasId)
        const fileHandle = await folder.getFileHandle(STATE_FILE)
        const file = await fileHandle.getFile()
        const text = await file.text()
        return JSON.parse(text)
    } catch {
        return null
    }
}

// ─── PDF file ────────────────────────────────────────────────────────────────

const PDF_FILE = 'document.pdf'

export async function savePdf(
    rootHandle: FileSystemDirectoryHandle,
    canvasId: string,
    pdfBuffer: ArrayBuffer,
): Promise<void> {
    const folder = await getCanvasFolder(rootHandle, canvasId, true)
    const fileHandle = await folder.getFileHandle(PDF_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(pdfBuffer)
    await writable.close()
}

export async function loadPdf(rootHandle: FileSystemDirectoryHandle, canvasId: string): Promise<ArrayBuffer | null> {
    try {
        const folder = await getCanvasFolder(rootHandle, canvasId)
        const fileHandle = await folder.getFileHandle(PDF_FILE)
        const file = await fileHandle.getFile()
        return await file.arrayBuffer()
    } catch {
        return null
    }
}

// ─── Thumbnail ───────────────────────────────────────────────────────────────

const THUMB_FILE = 'thumbnail.png'

export async function saveThumbnail(
    rootHandle: FileSystemDirectoryHandle,
    canvasId: string,
    pngBlob: Blob,
): Promise<void> {
    const folder = await getCanvasFolder(rootHandle, canvasId, true)
    const fileHandle = await folder.getFileHandle(THUMB_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(pngBlob)
    await writable.close()
}

export async function loadThumbnail(rootHandle: FileSystemDirectoryHandle, canvasId: string): Promise<string | null> {
    try {
        const folder = await getCanvasFolder(rootHandle, canvasId)
        const fileHandle = await folder.getFileHandle(THUMB_FILE)
        const file = await fileHandle.getFile()
        return URL.createObjectURL(file)
    } catch {
        return null
    }
}
