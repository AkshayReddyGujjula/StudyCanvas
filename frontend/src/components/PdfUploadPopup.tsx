import { useState, useCallback, useRef } from 'react'
import { uploadPdf, uploadDocFile } from '../api/studyApi'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'
import type { Node } from '@xyflow/react'

interface Props {
    onClose: () => void
    onUploaded: () => void
}

/**
 * Small centered popup for uploading a PDF, Word (.docx), or PowerPoint (.pptx)
 * into the current canvas.
 *
 * - PDF files are uploaded directly to /api/upload and displayed as-is.
 * - .docx / .pptx files are sent to /api/convert-to-pdf, which converts them
 *   server-side to a text-selectable PDF before displaying in the viewer.
 *
 * Only one document is allowed per canvas.
 */
export default function PdfUploadPopup({ onClose, onUploaded }: Props) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)

    const pdfInputRef  = useRef<HTMLInputElement>(null)
    const wordInputRef = useRef<HTMLInputElement>(null)
    const pptInputRef  = useRef<HTMLInputElement>(null)

    const fileData             = useCanvasStore((s) => s.fileData)
    const setFileData          = useCanvasStore((s) => s.setFileData)
    const setNodes             = useCanvasStore((s) => s.setNodes)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setDirty             = useAppStore((s) => s.setDirty)

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Decode a base64 string to an ArrayBuffer (for the PDF viewer). */
    function base64ToArrayBuffer(b64: string): ArrayBuffer {
        const binary = atob(b64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
    }

    /** Shared finalisation: store data, create content node, close popup. */
    const finalise = useCallback(
        (
            data: { markdown_content: string; raw_text: string; filename: string; page_count: number; pdf_id?: string },
            pdfArrayBuffer: ArrayBuffer,
        ) => {
            setFileData(
                {
                    markdown_content: data.markdown_content,
                    raw_text:         data.raw_text,
                    filename:         data.filename,
                    page_count:       data.page_count,
                    pdf_id:           data.pdf_id,
                },
                pdfArrayBuffer,
            )

            const firstPageMarkdown =
                useCanvasStore.getState().pageMarkdowns[0] ?? data.markdown_content

            const contentNode: Node = {
                id:       crypto.randomUUID(),
                type:     'contentNode',
                position: { x: 100, y: 100 },
                data: {
                    markdown_content: firstPageMarkdown,
                    filename:         data.filename,
                    page_count:       data.page_count,
                    pdf_id:           data.pdf_id,
                    pdfViewerState:   { viewMode: 'pdf' },
                },
                style: { width: 700 },
            }
            setNodes([contentNode])
            persistToLocalStorage()
            setDirty(true)
            onUploaded()
            onClose()
        },
        [setFileData, setNodes, persistToLocalStorage, setDirty, onUploaded, onClose],
    )

    // ── PDF upload ────────────────────────────────────────────────────────────

    const processPdf = useCallback(
        async (file: File) => {
            setError(null)
            if (file.type !== 'application/pdf') {
                setError('Only PDF files are accepted here.')
                return
            }
            if (file.size > 104_857_600) {
                setError('File is too large. Maximum size is 100 MB.')
                return
            }
            setLoading(true)
            try {
                const pdfArrayBuffer = await file.arrayBuffer()
                const data           = await uploadPdf(file)
                finalise(data, pdfArrayBuffer)
            } catch (err: unknown) {
                setLoading(false)
                const msg =
                    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                    'Upload failed. Please try again.'
                setError(msg)
            }
        },
        [finalise],
    )

    // ── Office conversion upload ──────────────────────────────────────────────

    const processOfficeFile = useCallback(
        async (file: File, label: string) => {
            setError(null)
            if (file.size > 104_857_600) {
                setError('File is too large. Maximum size is 100 MB.')
                return
            }
            setLoading(true)
            try {
                const data           = await uploadDocFile(file)
                const pdfArrayBuffer = base64ToArrayBuffer(data.pdf_data)
                finalise(data, pdfArrayBuffer)
            } catch (err: unknown) {
                setLoading(false)
                const msg =
                    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                    `${label} conversion failed. Please try again.`
                setError(msg)
            }
        },
        [finalise],
    )

    // ── Drag-and-drop (PDF only) ──────────────────────────────────────────────

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (!file) return
            const name = file.name.toLowerCase()
            if (name.endsWith('.docx'))      processOfficeFile(file, 'Word')
            else if (name.endsWith('.pptx')) processOfficeFile(file, 'PowerPoint')
            else                             processPdf(file)
        },
        [processPdf, processOfficeFile],
    )

    const hasPdf = Boolean(fileData)

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-semibold text-gray-800">Upload Document</h3>
                    <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                {hasPdf ? (
                    <div className="text-center py-8">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <p className="text-sm text-gray-600">This canvas already has a document.</p>
                        <p className="text-xs text-gray-400 mt-1">Only one document is allowed per canvas.</p>
                    </div>
                ) : loading ? (
                    <div className="text-center py-8">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-sm font-medium text-gray-500">Processing your document…</p>
                    </div>
                ) : (
                    <>
                        {/* ── PDF drag-and-drop zone ── */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => pdfInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                                dragOver
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                            <p className="text-sm font-medium text-gray-700">Drag & drop your PDF here</p>
                            <p className="text-xs text-gray-400 mt-1 mb-3">or</p>
                            <button
                                type="button"
                                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                onClick={(e) => { e.stopPropagation(); pdfInputRef.current?.click() }}
                            >
                                Browse PDF
                            </button>
                            <p className="text-xs text-gray-400 mt-3">PDF files · Max 100 MB</p>
                        </div>

                        <input
                            ref={pdfInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            aria-label="Upload PDF file"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) processPdf(f)
                                e.target.value = ''
                            }}
                        />

                        {/* ── Divider ── */}
                        <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400 font-medium">or convert from</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>

                        {/* ── Word / PowerPoint buttons ── */}
                        <div className="flex gap-3">
                            {/* Word */}
                            <button
                                type="button"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors group"
                                onClick={() => wordInputRef.current?.click()}
                            >
                                {/* W icon */}
                                <svg className="h-6 w-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="24" height="24" rx="4" fill="#2B579A"/>
                                    <path d="M5 7h14M5 12h14M5 17h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                                    <text x="12" y="15" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">W</text>
                                </svg>
                                <div className="text-left min-w-0">
                                    <p className="text-sm font-semibold text-blue-800 leading-tight">Word Document</p>
                                    <p className="text-xs text-blue-500 leading-tight">.docx</p>
                                </div>
                            </button>

                            {/* PowerPoint */}
                            <button
                                type="button"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-orange-100 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 transition-colors group"
                                onClick={() => pptInputRef.current?.click()}
                            >
                                {/* P icon */}
                                <svg className="h-6 w-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="24" height="24" rx="4" fill="#D24726"/>
                                    <text x="12" y="15" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">P</text>
                                </svg>
                                <div className="text-left min-w-0">
                                    <p className="text-sm font-semibold text-orange-800 leading-tight">PowerPoint</p>
                                    <p className="text-xs text-orange-500 leading-tight">.pptx</p>
                                </div>
                            </button>
                        </div>

                        <p className="text-xs text-gray-400 text-center mt-2">
                            Office files are converted to PDF automatically
                        </p>

                        <input
                            ref={wordInputRef}
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            aria-label="Upload Word document"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) processOfficeFile(f, 'Word')
                                e.target.value = ''
                            }}
                        />
                        <input
                            ref={pptInputRef}
                            type="file"
                            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            aria-label="Upload PowerPoint presentation"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) processOfficeFile(f, 'PowerPoint')
                                e.target.value = ''
                            }}
                        />
                    </>
                )}

                {error && (
                    <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {error}
                    </div>
                )}
            </div>
        </div>
    )
}
