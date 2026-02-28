/**
 * IndexedDB-based canvas state backup.
 *
 * This provides crash-recovery: before clearing canvas state on unmount,
 * we write a snapshot to IndexedDB (which has no practical size limit unlike
 * localStorage's ~5 MB cap). If the File System save failed and state.json
 * is corrupt/missing on next load, we can recover from this backup.
 */

const DB_NAME = 'studycanvas_backup'
const DB_VERSION = 1
const STORE_NAME = 'canvas_states'

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

/**
 * Save a canvas state backup to IndexedDB.
 * Strips raw_text and markdown_content to keep size manageable.
 */
export async function saveCanvasBackup(canvasId: string, state: Record<string, any>): Promise<void> {
    try {
        const lightState = { ...state }
        // Strip large recoverable fields
        if (lightState.fileData) {
            lightState.fileData = {
                ...lightState.fileData,
                raw_text: '',
                markdown_content: '',
            }
        }
        const db = await openDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            tx.objectStore(STORE_NAME).put(lightState, canvasId)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    } catch (err) {
        console.warn('[canvasBackup] Failed to save backup:', err)
    }
}

/**
 * Load a canvas state backup from IndexedDB.
 * Returns null if not found.
 */
export async function loadCanvasBackup(canvasId: string): Promise<Record<string, any> | null> {
    try {
        const db = await openDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly')
            const req = tx.objectStore(STORE_NAME).get(canvasId)
            req.onsuccess = () => resolve(req.result ?? null)
            req.onerror = () => reject(req.error)
        })
    } catch {
        return null
    }
}

/**
 * Delete a canvas state backup from IndexedDB.
 */
export async function deleteCanvasBackup(canvasId: string): Promise<void> {
    try {
        const db = await openDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite')
            tx.objectStore(STORE_NAME).delete(canvasId)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    } catch {
        // Best-effort
    }
}
