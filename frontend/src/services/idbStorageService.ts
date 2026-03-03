/**
 * idbStorageService.ts
 *
 * IndexedDB-backed storage service that mirrors fileSystemService.ts's interface.
 * Used when the File System Access API is unavailable (Firefox, Safari, iOS, Android).
 *
 * Data is stored in a single IndexedDB database 'studycanvas_idb_main' with:
 *   - 'manifest'      : key='root', value=Manifest object
 *   - 'canvas_states' : key=canvasId, value=serialised state JSON string
 *   - 'thumbnails'    : key=canvasId, value=ArrayBuffer (PNG)
 *
 * PDF data is delegated to pdfStorage.ts (existing 'studycanvas_pdf' DB).
 * Audio data is delegated to audioStorage.ts (existing 'studycanvas_audio' DB).
 * Both are already IndexedDB-based, so no changes are needed there.
 */

import type { Manifest } from './fileSystemService'
import { clearAllPdfs } from '../utils/pdfStorage'
import { clearAllAudio } from '../utils/audioStorage'

// ─── DB setup ────────────────────────────────────────────────────────────────

const IDB_DB_NAME = 'studycanvas_idb_main'
const IDB_DB_VERSION = 1
const STORE_MANIFEST = 'manifest'
const STORE_STATES = 'canvas_states'
const STORE_THUMBS = 'thumbnails'
const MANIFEST_KEY = 'root'

function openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE_MANIFEST)) db.createObjectStore(STORE_MANIFEST)
            if (!db.objectStoreNames.contains(STORE_STATES)) db.createObjectStore(STORE_STATES)
            if (!db.objectStoreNames.contains(STORE_THUMBS)) db.createObjectStore(STORE_THUMBS)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function defaultManifestIDB(userName: string): Manifest {
    return { version: 1, user: { name: userName }, canvases: [], folders: [] }
}

/** Read the Manifest from IndexedDB. Returns a default if none found. */
export async function readManifestIDB(fallbackName = ''): Promise<Manifest> {
    try {
        const db = await openIDB()
        const result = await new Promise<Manifest | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_MANIFEST, 'readonly')
            const req = tx.objectStore(STORE_MANIFEST).get(MANIFEST_KEY)
            req.onsuccess = () => resolve(req.result as Manifest | undefined)
            req.onerror = () => reject(req.error)
        })
        return result ?? defaultManifestIDB(fallbackName)
    } catch {
        return defaultManifestIDB(fallbackName)
    }
}

/** Write the Manifest to IndexedDB. */
export async function writeManifestIDB(manifest: Manifest): Promise<void> {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MANIFEST, 'readwrite')
        tx.objectStore(STORE_MANIFEST).put(manifest, MANIFEST_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// ─── Canvas state ─────────────────────────────────────────────────────────────

/** Save canvas state JSON to IndexedDB. Accepts a string or object (as in fileSystemService). */
export async function saveCanvasStateIDB(
    canvasId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateObj: Record<string, any> | string,
): Promise<void> {
    const json = typeof stateObj === 'string' ? stateObj : JSON.stringify(stateObj)
    const db = await openIDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_STATES, 'readwrite')
        tx.objectStore(STORE_STATES).put(json, canvasId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Load canvas state JSON from IndexedDB. Returns null if not found. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCanvasStateIDB(canvasId: string): Promise<Record<string, any> | null> {
    try {
        const db = await openIDB()
        const result = await new Promise<string | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_STATES, 'readonly')
            const req = tx.objectStore(STORE_STATES).get(canvasId)
            req.onsuccess = () => resolve(req.result as string | undefined)
            req.onerror = () => reject(req.error)
        })
        if (!result) return null
        return JSON.parse(result)
    } catch {
        return null
    }
}

/** Delete canvas state from IndexedDB. */
export async function deleteCanvasStateIDB(canvasId: string): Promise<void> {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_STATES, 'readwrite')
        tx.objectStore(STORE_STATES).delete(canvasId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// ─── Thumbnails ───────────────────────────────────────────────────────────────

/** Save a thumbnail PNG Blob to IndexedDB. */
export async function saveThumbnailIDB(canvasId: string, pngBlob: Blob): Promise<void> {
    const buffer = await pngBlob.arrayBuffer()
    const db = await openIDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_THUMBS, 'readwrite')
        tx.objectStore(STORE_THUMBS).put(buffer, canvasId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/** Load a thumbnail as a blob URL from IndexedDB. Returns null if not found. */
export async function loadThumbnailIDB(canvasId: string): Promise<string | null> {
    try {
        const db = await openIDB()
        const result = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_THUMBS, 'readonly')
            const req = tx.objectStore(STORE_THUMBS).get(canvasId)
            req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
            req.onerror = () => reject(req.error)
        })
        if (!result) return null
        const blob = new Blob([result], { type: 'image/png' })
        return URL.createObjectURL(blob)
    } catch {
        return null
    }
}

/** Delete thumbnail for a canvas from IndexedDB. */
export async function deleteThumbnailIDB(canvasId: string): Promise<void> {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_THUMBS, 'readwrite')
        tx.objectStore(STORE_THUMBS).delete(canvasId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// ─── Full reset ───────────────────────────────────────────────────────────────

/**
 * Clear all StudyCanvas IndexedDB data (IDB mode reset/logout).
 * Removes manifest, all canvas states, all thumbnails, all PDFs, all audio.
 */
export async function clearAllIDB(): Promise<void> {
    try {
        const db = await openIDB()
        await Promise.all([
            new Promise<void>((res, rej) => {
                const tx = db.transaction(STORE_MANIFEST, 'readwrite')
                tx.objectStore(STORE_MANIFEST).clear()
                tx.oncomplete = () => res()
                tx.onerror = () => rej(tx.error)
            }),
            new Promise<void>((res, rej) => {
                const tx = db.transaction(STORE_STATES, 'readwrite')
                tx.objectStore(STORE_STATES).clear()
                tx.oncomplete = () => res()
                tx.onerror = () => rej(tx.error)
            }),
            new Promise<void>((res, rej) => {
                const tx = db.transaction(STORE_THUMBS, 'readwrite')
                tx.objectStore(STORE_THUMBS).clear()
                tx.oncomplete = () => res()
                tx.onerror = () => rej(tx.error)
            }),
        ])
        await clearAllPdfs()
        await clearAllAudio()
    } catch (err) {
        console.error('[idbStorageService] clearAllIDB failed:', err)
    }
}
