import { useState, useCallback, useRef } from 'react'
import { uploadPdf } from '../api/studyApi'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'
import type { Node } from '@xyflow/react'

interface Props {
    onClose: () => void
    onUploaded: () => void
}

/**
 * Small centered popup for uploading a PDF into the current canvas.
 * Replaces the old full-page UploadPanel.
 * Only 1 PDF is allowed per canvas — the popup blocks if one already exists.
 */
export default function PdfUploadPopup({ onClose, onUploaded }: Props) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const fileData = useCanvasStore((s) => s.fileData)
    const setFileData = useCanvasStore((s) => s.setFileData)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)
    const setDirty = useAppStore((s) => s.setDirty)

    const processFile = useCallback(
        async (file: File) => {
            setError(null)

            if (file.type !== 'application/pdf') {
                setError('Only PDF files are accepted.')
                return
            }
            if (file.size > 104857600) {
                setError('File is too large. Maximum size is 100MB.')
                return
            }

            setLoading(true)
            try {
                const pdfArrayBuffer = await file.arrayBuffer()
                const data = await uploadPdf(file)
                setFileData(
                    {
                        markdown_content: data.markdown_content,
                        raw_text: data.raw_text,
                        filename: data.filename,
                        page_count: data.page_count,
                        pdf_id: data.pdf_id,
                    },
                    pdfArrayBuffer,
                )

                // Grab the first page's markdown
                const firstPageMarkdown =
                    useCanvasStore.getState().pageMarkdowns[0] ?? data.markdown_content

                const contentNode: Node = {
                    id: crypto.randomUUID(),
                    type: 'contentNode',
                    position: { x: 100, y: 100 },
                    data: {
                        markdown_content: firstPageMarkdown,
                        filename: data.filename,
                        page_count: data.page_count,
                        pdf_id: data.pdf_id,
                    },
                    style: { width: 700 },
                }
                setNodes([contentNode])
                persistToLocalStorage()
                setDirty(true)
                onUploaded()
                onClose()
            } catch (err: unknown) {
                setLoading(false)
                const msg =
                    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                    'Upload failed. Please try again.'
                setError(msg)
            }
        },
        [setFileData, setNodes, persistToLocalStorage, setDirty, onUploaded, onClose],
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) processFile(file)
        },
        [processFile],
    )

    const hasPdf = Boolean(fileData)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-semibold text-gray-800">Upload PDF</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {hasPdf ? (
                    <div className="text-center py-8">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <p className="text-sm text-gray-600">This canvas already has a PDF.</p>
                        <p className="text-xs text-gray-400 mt-1">Only one PDF is allowed per canvas.</p>
                    </div>
                ) : loading ? (
                    <div className="text-center py-8">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-sm font-medium text-gray-500">Processing your document…</p>
                    </div>
                ) : (
                    <>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
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
                                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                            >
                                Browse files
                            </button>
                            <p className="text-xs text-gray-400 mt-3">PDF files only · Max 100MB</p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) processFile(file)
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
