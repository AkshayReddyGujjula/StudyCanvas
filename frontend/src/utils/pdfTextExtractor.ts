/**
 * Client-side PDF → plain text extractor.
 *
 * Used as a fallback when a PDF file is too large to POST directly to the
 * Vercel serverless function (hard limit: 4.5 MB).  Instead of uploading the
 * binary file the browser extracts the text with pdf.js and sends lightweight
 * JSON to /api/upload-text, which applies the same cleaning/markdown logic as
 * the standard /api/upload route.
 *
 * Re-uses the worker that PDFViewer.tsx already configured — do NOT reassign
 * GlobalWorkerOptions.workerSrc here to avoid a race condition on import order.
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

// Reuse the already-configured worker (set by PDFViewer.tsx / pdfImageExtractor.ts).
// If this module is imported before those, set it as a safe default.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

/**
 * Extracts the text content of every page in a PDF file.
 *
 * @param file - The PDF File object selected by the user.
 * @returns An array of strings, one per page (0-indexed), with whitespace
 *          joined from the pdf.js TextContent items.
 * @throws  If pdf.js cannot parse the file.
 */
export async function extractPdfPagesText(file: File): Promise<string[]> {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    const pages: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        // Join text items — preserve line breaks where the PDF signals them
        // (items with a large `transform[5]` delta indicate a new line).
        // Larger Y-gaps (> 1.8× the average line height) are treated as
        // paragraph breaks (double newlines) for better Markdown rendering.
        let pageText = ''
        let lastY: number | null = null
        let lineHeightSum = 0
        let lineCount = 0

        for (const item of textContent.items) {
            // TextItem has a `transform` array; TextMarkedContent does not.
            if (!('str' in item)) continue

            const y = (item as TextItem).transform[5]
            if (lastY !== null) {
                const yDiff = Math.abs(y - lastY)
                if (yDiff > 2) {
                    // Track running average of line spacing for paragraph detection
                    if (yDiff < 80) {
                        lineHeightSum += yDiff
                        lineCount++
                    }
                    const avgLineHeight = lineCount > 0 ? lineHeightSum / lineCount : 0
                    // A gap significantly larger than the average line height
                    // likely indicates a paragraph break
                    if (avgLineHeight > 0 && yDiff > avgLineHeight * 1.8) {
                        pageText += '\n\n'
                    } else {
                        pageText += '\n'
                    }
                }
            }
            pageText += (item as TextItem).str
            lastY = y
        }

        pages.push(pageText)
        page.cleanup()
    }

    pdf.destroy()
    return pages
}

/**
 * Same as extractPdfPagesText but accepts an ArrayBuffer instead of a File.
 * Useful when we already have the PDF binary in memory (e.g. from IndexedDB).
 */
export async function extractPdfPagesTextFromBuffer(buffer: ArrayBuffer): Promise<string[]> {
    const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise
    const pages: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        let pageText = ''
        let lastY: number | null = null
        let lineHeightSum = 0
        let lineCount = 0

        for (const item of textContent.items) {
            if (!('str' in item)) continue
            const y = (item as TextItem).transform[5]
            if (lastY !== null) {
                const yDiff = Math.abs(y - lastY)
                if (yDiff > 2) {
                    if (yDiff < 80) { lineHeightSum += yDiff; lineCount++ }
                    const avgLineHeight = lineCount > 0 ? lineHeightSum / lineCount : 0
                    if (avgLineHeight > 0 && yDiff > avgLineHeight * 1.8) {
                        pageText += '\n\n'
                    } else {
                        pageText += '\n'
                    }
                }
            }
            pageText += (item as TextItem).str
            lastY = y
        }
        pages.push(pageText)
        page.cleanup()
    }

    pdf.destroy()
    return pages
}
