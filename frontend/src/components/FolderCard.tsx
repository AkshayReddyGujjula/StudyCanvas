import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import type { FolderMeta } from '../types'

interface Props {
    folder: FolderMeta
    onOpen: () => void
    onDragStart: (e: React.DragEvent) => void
    onDropItem: (e: React.DragEvent) => void
}

export default function FolderCard({ folder, onOpen, onDragStart, onDropItem }: Props) {
    const renameFolder = useAppStore((s) => s.renameFolder)
    const removeFolder = useAppStore((s) => s.removeFolder)
    const [showMenu, setShowMenu] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [renameValue, setRenameValue] = useState(folder.name)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)
    const [renameError, setRenameError] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const renameRef = useRef<HTMLInputElement>(null)

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
        if (!trimmed) {
            setRenameValue(folder.name)
            setIsRenaming(false)
            setRenameError(null)
            return
        }
        if (trimmed !== folder.name) {
            try {
                await renameFolder(folder.id, trimmed)
                setRenameError(null)
            } catch (err) {
                setRenameError(err instanceof Error ? err.message : 'Rename failed')
                return // keep rename input open
            }
        }
        setIsRenaming(false)
        setRenameError(null)
    }

    const handleDelete = async () => {
        await removeFolder(folder.id)
        setShowDeleteConfirm(false)
        setShowMenu(false)
    }

    const folderItemCount = (() => {
        const canvases = useAppStore.getState().canvasList.filter(c => c.parentFolderId === folder.id)
        const subfolders = useAppStore.getState().folderList.filter(f => f.parentFolderId === folder.id)
        return canvases.length + subfolders.length
    })()

    const formattedDate = new Date(folder.createdAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
    })

    return (
        <>
            <div
                draggable={!isRenaming}
                onDragStart={(e) => {
                    if (isRenaming) { e.preventDefault(); return }
                    onDragStart(e)
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); onDropItem(e) }}
                className={`group relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${
                    isDragOver
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-gray-200'
                }`}
                onDoubleClick={() => !isRenaming && onOpen()}
                onClick={() => !isRenaming && onOpen()}
            >
                {/* Folder icon area */}
                <div className="h-36 bg-amber-50 flex items-center justify-center rounded-t-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-amber-400" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {folderItemCount > 0 && (
                        <span className="absolute top-3 right-3 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            {folderItemCount} item{folderItemCount !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Info area */}
                <div className="p-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        {isRenaming ? (
                            <div>
                                <input
                                    ref={renameRef}
                                    value={renameValue}
                                    onChange={(e) => { setRenameValue(e.target.value); setRenameError(null) }}
                                    onBlur={handleRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRename()
                                        if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(folder.name); setRenameError(null) }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className={`w-full text-sm font-medium text-gray-800 border rounded px-1 py-0.5 focus:outline-none focus:ring-1 ${
                                        renameError ? 'border-red-400 focus:ring-red-400' : 'border-indigo-300 focus:ring-indigo-500'
                                    }`}
                                />
                                {renameError && (
                                    <p className="text-xs text-red-500 mt-0.5">{renameError}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">Created: {formattedDate}</p>
                    </div>

                    {/* Overflow menu button */}
                    <div ref={menuRef} className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
                            onDoubleClick={(e) => e.stopPropagation()}
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
                                        setRenameValue(folder.name)
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
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete folder?</h3>
                        <p className="text-sm text-gray-500 mb-5">
                            This will permanently delete <span className="font-medium text-gray-700">"{folder.name}"</span> and
                            {folderItemCount > 0 ? ` all ${folderItemCount} item${folderItemCount !== 1 ? 's' : ''} inside it` : ' its contents'} from your device.
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
