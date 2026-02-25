/**
 * Client-side PDF page → base64 JPEG image extractor.
 * Uses pdf.js to render a specific page to a canvas, then converts to base64.
 * This replaces the backend's get_page_image_base64() function.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Use the same worker path as PDFViewer.tsx — served from the public folder.
// IMPORTANT: Do NOT use `new URL('pdfjs-dist/build/...', import.meta.url)` here
// because this module loads AFTER PDFViewer.tsx in the import graph, so this
// assignment would override PDFViewer's correct '/pdf.worker.min.mjs' path,
// potentially breaking PDF rendering if the resolved URL differs.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

/**
 * Renders a specific page of a PDF to a base64-encoded JPEG string.
 * @param pdfData - The raw PDF as an ArrayBuffer.
 * @param pageIndex - 0-based page index.
 * @param dpi - Resolution for rendering (default 150, matching backend).
 * @returns Base64-encoded JPEG string (without data URI prefix), or null on failure.
 */
export async function extractPageImageBase64(
    pdfData: ArrayBuffer,
    pageIndex: number,
    dpi: number = 150
): Promise<string | null> {
    try {
        const pdf = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise
        if (pageIndex < 0 || pageIndex >= pdf.numPages) {
            pdf.destroy()
            return null
        }

        const page = await pdf.getPage(pageIndex + 1) // pdf.js is 1-based
        // Default PDF resolution is 72 DPI; scale = target DPI / 72
        const scale = dpi / 72
        const viewport = page.getViewport({ scale })

        // Create an offscreen canvas
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            pdf.destroy()
            return null
        }

        await page.render({ canvasContext: ctx, viewport }).promise

        // Convert to base64 JPEG (0.85 quality for good balance of size/quality)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        // Strip the "data:image/jpeg;base64," prefix
        const base64 = dataUrl.split(',')[1]

        pdf.destroy()
        return base64
    } catch (err) {
        console.error('[pdfImageExtractor] Error extracting page image:', err)
        return null
    }
}
