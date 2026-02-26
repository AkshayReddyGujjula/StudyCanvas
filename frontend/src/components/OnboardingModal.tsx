import { useState } from 'react'
import { selectAndCreateRootFolder, FolderValidationError } from '../services/fileSystemService'
import { useAppStore } from '../store/appStore'

/**
 * Two-step onboarding modal shown to first-time users.
 *   Step 1 — Ask for their name.
 *   Step 2 — Pick a local folder where StudyCanvas data will be stored.
 *   OR — Restore from an existing StudyCanvas folder.
 */
export default function OnboardingModal() {
    const completeOnboarding = useAppStore((s) => s.completeOnboarding)
    const restoreFromExisting = useAppStore((s) => s.restoreFromExisting)
    const [step, setStep] = useState<1 | 2>(1)
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isSelecting, setIsSelecting] = useState(false)
    const [isRestoring, setIsRestoring] = useState(false)

    const handleNameSubmit = () => {
        if (!name.trim()) {
            setError('Please enter your name.')
            return
        }
        setError(null)
        setStep(2)
    }

    const handleFolderSelect = async () => {
        setError(null)
        setIsSelecting(true)
        try {
            const handle = await selectAndCreateRootFolder()
            await completeOnboarding(name.trim(), handle)
        } catch (err) {
            console.error('[OnboardingModal] folder select failed', err)
            if (err instanceof FolderValidationError) {
                setError(err.message)
            } else if (err instanceof DOMException && err.name === 'AbortError') {
                setError('Folder selection was cancelled. Please try again.')
            } else {
                setError('Folder selection failed. Please try again.')
            }
        } finally {
            setIsSelecting(false)
        }
    }

    const handleRestore = async () => {
        setError(null)
        setIsRestoring(true)
        try {
            await restoreFromExisting()
        } catch (err) {
            console.error('[OnboardingModal] restore failed', err)
            if (err instanceof FolderValidationError) {
                setError(err.message)
            } else if (err instanceof DOMException && err.name === 'AbortError') {
                setError('Folder selection was cancelled. Please try again.')
            } else {
                setError('Failed to restore from folder. Please try again.')
            }
        } finally {
            setIsRestoring(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-100 to-indigo-50">
            <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full mx-4">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="mb-3 flex justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome to StudyCanvas</h1>
                    <p className="text-sm text-gray-500 mt-1">Let's set up your workspace</p>
                </div>

                {step === 1 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">What's your name?</label>
                            <input
                                autoFocus
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                                placeholder="e.g. Akshay"
                                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800"
                            />
                        </div>
                        {error && (
                            <p className="text-sm text-red-600">{error}</p>
                        )}
                        <button
                            onClick={handleNameSubmit}
                            className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Continue
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="flex flex-col gap-4">
                        <div className="text-center">
                            <p className="text-sm text-gray-600 mb-1">
                                Hi <span className="font-semibold text-gray-800">{name}</span>! Choose where to store your canvases.
                            </p>
                            <p className="text-xs text-gray-400">
                                A <code className="bg-gray-100 px-1 rounded">StudyCanvas</code> folder will be created at the location you pick.
                            </p>
                        </div>

                        <button
                            onClick={handleFolderSelect}
                            disabled={isSelecting || isRestoring}
                            className="w-full px-4 py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSelecting ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Setting up…
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    </svg>
                                    Create New Workspace
                                </>
                            )}
                        </button>

                        <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400 font-medium">OR</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>

                        <button
                            onClick={handleRestore}
                            disabled={isSelecting || isRestoring}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isRestoring ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Restoring…
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Restore Existing Workspace
                                </>
                            )}
                        </button>
                        <p className="text-xs text-gray-400 text-center -mt-2">
                            Select an existing <code className="bg-gray-100 px-1 rounded">StudyCanvas</code> folder to restore your progress.
                        </p>

                        {error && (
                            <p className="text-sm text-red-600 text-center">{error}</p>
                        )}

                        <button
                            onClick={() => { setStep(1); setError(null) }}
                            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            ← Back
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
