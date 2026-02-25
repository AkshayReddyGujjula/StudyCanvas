/**
 * IndexedDB helper for storing PDF ArrayBuffers locally in the browser.
 * This means the PDF never needs to leave the user's device after upload.
 */

const DB_NAME = 'studycanvas_pdf'
const DB_VERSION = 1
const STORE_NAME = 'pdfs'

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
 * Save a PDF ArrayBuffer to IndexedDB under a given key.
 * Typically the key is a unique ID like the filename or a UUID.
 */
export async function savePdfToLocal(key: string, data: ArrayBuffer): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(data, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/**
 * Load a PDF ArrayBuffer from IndexedDB by key.
 * Returns null if not found.
 */
export async function loadPdfFromLocal(key: string): Promise<ArrayBuffer | null> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(key)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
    })
}

/**
 * Delete a PDF from IndexedDB by key.
 */
export async function deletePdfFromLocal(key: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

/**
 * Clear all stored PDFs from IndexedDB.
 */
export async function clearAllPdfs(): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}
