import { useState, useCallback, useRef } from 'react'
import { uploadPdf } from '../api/studyApi'
import { useCanvasStore } from '../store/canvasStore'
import type { Node } from '@xyflow/react'

interface UploadPanelProps {
    onUploaded: () => void
}

export default function UploadPanel({ onUploaded }: UploadPanelProps) {
    const [loading, setLoading] = useState(false)
    const [loadingFilename, setLoadingFilename] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const setFileData = useCanvasStore((s) => s.setFileData)
    const setNodes = useCanvasStore((s) => s.setNodes)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const processFile = useCallback(
        async (file: File) => {
            setError(null)

            if (file.type !== 'application/pdf') {
                setError('Only PDF files are accepted.')
                return
            }
            if (file.size > 52428800) {
                setError('File is too large. Maximum size is 50MB.')
                return
            }

            setLoadingFilename(file.name)
            setLoading(true)

            try {
                const data = await uploadPdf(file)
                setFileData({
                    markdown_content: data.markdown_content,
                    raw_text: data.raw_text,
                    filename: data.filename,
                    page_count: data.page_count,
                })

                // After setFileData the store has split the markdown into pages.
                // Use page 1's markdown so the contentNode only shows the first page.
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
                    },
                    style: { width: 700 },
                }
                setNodes([contentNode])
                persistToLocalStorage() // lifecycle event (a)
                onUploaded()
            } catch (err: unknown) {
                setLoading(false)
                const msg =
                    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                    'Upload failed. Please try again.'
                setError(msg)
            }
        },
        [setFileData, setNodes, persistToLocalStorage, onUploaded]
    )

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) processFile(file)
            e.target.value = '' // reset so same file can be re-selected
        },
        [processFile]
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) processFile(file)
        },
        [processFile]
    )

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm w-full mx-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-500 mb-1">Processing your lecture...</p>
                    <p className="text-xs text-gray-400 truncate max-w-xs mx-auto">{loadingFilename}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl p-10 max-w-lg w-full mx-4">
                {/* Logo/Title */}
                <div className="text-center mb-8">
                    <div className="text-4xl mb-2">🗺️</div>
                    <h1 className="text-2xl font-bold text-gray-900">StudyCanvas</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Every other AI gives you a conversation. We give you a map of your understanding.
                    </p>
                </div>

                {/* Drag-and-drop zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${dragOver
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-indigo-400 hover:bg-gray-50'
                        }`}
                >
                    <div className="text-3xl mb-3">📄</div>
                    <p className="text-sm font-medium text-gray-700">
                        Drag & drop your PDF here
                    </p>
                    <p className="text-xs text-gray-400 mt-1 mb-4">or</p>
                    <button
                        className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                    >
                        Browse files
                    </button>
                    <p className="text-xs text-gray-400 mt-3">PDF files only · Max 50MB</p>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                />

                {error && (
                    <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {error}
                    </div>
                )}
            </div>
        </div>
    )
}
