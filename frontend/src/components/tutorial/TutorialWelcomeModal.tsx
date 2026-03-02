import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { useTutorialStore } from '../../store/tutorialStore'

// ─── Tutorial Welcome Modal ───────────────────────────────────────────────────
// Shown on the HomePage when the user is newly onboarded and has not yet
// completed the tutorial. Clicking "Start Tour" creates a tutorial canvas,
// injects sample content, and navigates to the canvas page.

export default function TutorialWelcomeModal() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)

    const addCanvas = useAppStore((s) => s.addCanvas)
    const userName = useAppStore((s) => s.userName)
    const startTutorial = useTutorialStore((s) => s.startTutorial)
    const skipTutorial = useTutorialStore((s) => s.skipTutorial)

    const handleStartTour = async () => {
        setLoading(true)
        try {
            const id = crypto.randomUUID()
            const now = new Date().toISOString()
            await addCanvas({
                id,
                title: '📚 Tutorial Canvas',
                createdAt: now,
                modifiedAt: now,
                parentFolderId: null,
            })
            startTutorial(id)
            navigate(`/canvas/${id}`)
        } catch (err) {
            console.error('[TutorialWelcomeModal] Failed to create tutorial canvas:', err)
            setLoading(false)
        }
    }

    const handleSkip = () => {
        skipTutorial()
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
                style={{ animation: 'tutorial-fade-in 0.3s ease-out' }}
            >
                {/* Decorative header band */}
                <div className="h-2 bg-gradient-to-r from-indigo-500 via-secondary-500 to-indigo-500" />

                <div className="p-8">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                            <line x1="8" y1="2" x2="8" y2="18" />
                            <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                    </div>

                    {/* Heading */}
                    <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
                        Welcome to StudyCanvas!
                    </h2>
                    <p className="text-sm text-gray-500 text-center mb-6">
                        Hi {userName ? userName.split(' ')[0] : 'there'}! Ready to study smarter?
                    </p>

                    {/* Feature pills */}
                    <div className="flex flex-wrap gap-2 justify-center mb-6">
                        {([
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/></svg>,
                                label: 'Ask Gemini AI',
                            },
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M4.5 3h15"/><path d="M6 3v9l-2 3.5A4 4 0 0 0 8 21h8a4 4 0 0 0 3.46-5.5L17 12V3"/><line x1="6" y1="13" x2="18" y2="13"/></svg>,
                                label: 'Quiz Generator',
                            },
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
                                label: 'Flashcards',
                            },
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                                label: 'Pomodoro Timer',
                            },
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.02 3 1.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-2-2.02z"/></svg>,
                                label: 'Whiteboard',
                            },
                            {
                                icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>,
                                label: 'Voice Notes',
                            },
                        ] as { icon: ReactNode; label: string }[]).map(({ icon, label }) => (
                            <span
                                key={label}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                            >
                                {icon} {label}
                            </span>
                        ))}
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-600 text-center mb-8 leading-relaxed">
                        A <strong>2-minute interactive tour</strong> will walk you through every feature using a sample Study Guide canvas — no need to upload anything yet!
                    </p>

                    {/* Actions */}
                    <button
                        onClick={handleStartTour}
                        disabled={loading}
                        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2 mb-3"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Setting up your tutorial…
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                Start the Tour
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleSkip}
                        disabled={loading}
                        className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Skip — I'll explore on my own
                    </button>

                    {/* Keyboard hint */}
                    <p className="text-center text-xs text-gray-300 mt-3">
                        Press <kbd className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-mono">Esc</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-mono">Space</kbd> at any time to skip the tour
                    </p>
                </div>
            </div>
        </div>
    )
}
