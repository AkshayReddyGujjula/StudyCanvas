/**
 * IndexedDB helper for storing audio Blobs locally in the browser.
 * Voice note recordings never leave the user's device — only a reference
 * key (`audioId`) is stored in the canvas state JSON/localStorage.
 */

const DB_NAME = 'studycanvas_audio'
const DB_VERSION = 1
const STORE_NAME = 'audio_blobs'

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
 * Save an audio Blob to IndexedDB under a given key (UUID).
 */
export async function saveAudio(key: string, blob: Blob): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(blob, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/**
 * Load an audio Blob from IndexedDB by key.
 * Returns null if not found.
 */
export async function loadAudio(key: string): Promise<Blob | null> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(key)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
    })
}

/**
 * Delete an audio Blob from IndexedDB by key.
 */
export async function deleteAudio(key: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/**
 * Clear all stored audio blobs from IndexedDB.
 */
export async function clearAllAudio(): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}
