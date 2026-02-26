import { useState, useEffect, useRef } from 'react'
import { loadThumbnail, resolveParentHandle } from '../services/fileSystemService'
import { useAppStore } from '../store/appStore'
import type { CanvasMeta } from '../types'

interface Props {
    canvas: CanvasMeta
    onClick: () => void
    onDragStart?: (e: React.DragEvent) => void
}

export default function CanvasCard({ canvas, onClick, onDragStart }: Props) {
    const directoryHandle = useAppStore((s) => s.directoryHandle)
    const renameCanvas = useAppStore((s) => s.renameCanvas)
    const removeCanvas = useAppStore((s) => s.removeCanvas)
    const [thumbUrl, setThumbUrl] = useState<string | null>(null)
    const [showMenu, setShowMenu] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [renameValue, setRenameValue] = useState(canvas.title)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const renameRef = useRef<HTMLInputElement>(null)

    // Load thumbnail
    useEffect(() => {
        let revoked = false
        if (directoryHandle) {
            const folderList = useAppStore.getState().folderList
            resolveParentHandle(directoryHandle, folderList, canvas.parentFolderId)
                .then((parentHandle) => loadThumbnail(parentHandle, canvas.id))
                .then((url) => {
                    if (!revoked && url) setThumbUrl(url)
                })
                .catch(() => {})
        }
        return () => {
            revoked = true
            if (thumbUrl) URL.revokeObjectURL(thumbUrl)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [directoryHandle, canvas.id])

    // Close menu on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Focus rename input
    useEffect(() => {
        if (isRenaming) renameRef.current?.focus()
    }, [isRenaming])

    const handleRename = async () => {
        const trimmed = renameValue.trim()
        if (trimmed && trimmed !== canvas.title) {
            await renameCanvas(canvas.id, trimmed)
        }
        setIsRenaming(false)
    }

    const handleDelete = async () => {
        await removeCanvas(canvas.id)
        setShowDeleteConfirm(false)
        setShowMenu(false)
    }

    const formattedDate = new Date(canvas.modifiedAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })

    return (
        <>
            <div
                draggable={!isRenaming}
                onDragStart={(e) => {
                    if (isRenaming) { e.preventDefault(); return }
                    onDragStart?.(e)
                }}
                className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={() => !isRenaming && onClick()}
            >
                {/* Thumbnail area */}
                <div className="h-36 bg-gray-50 flex items-center justify-center overflow-hidden rounded-t-xl">
                    {thumbUrl ? (
                        <img
                            src={thumbUrl}
                            alt={canvas.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                    )}
                </div>

                {/* Info area */}
                <div className="p-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        {isRenaming ? (
                            <input
                                ref={renameRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename()
                                    if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(canvas.title) }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-sm font-medium text-gray-800 border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        ) : (
                            <p className="text-sm font-medium text-gray-800 truncate">{canvas.title}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">Edited: {formattedDate}</p>
                    </div>

                    {/* Overflow menu button */}
                    <div ref={menuRef} className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
                            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                        {showMenu && (
                            <div className="absolute right-0 bottom-full mb-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setShowMenu(false)
                                        setRenameValue(canvas.title)
                                        setIsRenaming(true)
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Rename
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setShowMenu(false)
                                        setShowDeleteConfirm(true)
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete canvas?</h3>
                        <p className="text-sm text-gray-500 mb-5">
                            This will permanently delete <span className="font-medium text-gray-700">"{canvas.title}"</span> and all its data from your device.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
