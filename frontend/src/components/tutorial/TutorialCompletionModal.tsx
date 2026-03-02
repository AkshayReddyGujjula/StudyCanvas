import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTutorialStore } from '../../store/tutorialStore'
import { createPortal } from 'react-dom'

// ─── Tutorial Completion Modal ────────────────────────────────────────────────
// Shown after the user completes all tutorial steps.

export default function TutorialCompletionModal() {
    const navigate = useNavigate()
    const showCompletion = useTutorialStore((s) => s.showCompletion)
    const dismissCompletion = useTutorialStore((s) => s.dismissCompletion)

    if (!showCompletion) return null

    const handleGoHome = () => {
        dismissCompletion()
        navigate('/')
    }

    const handleStay = () => {
        dismissCompletion()
    }

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {/* Confetti particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 24 }).map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-2 h-2 rounded-full"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: '-8px',
                            backgroundColor: ['#4F46E5', '#2D9CDB', '#27AE60', '#EB5757', '#F59E0B', '#8B5CF6'][i % 6],
                            animation: `tutorial-confetti ${1.5 + Math.random() * 2}s ease-in ${Math.random() * 0.8}s forwards`,
                            opacity: 0,
                            transform: `rotate(${Math.random() * 360}deg)`,
                        }}
                    />
                ))}
            </div>

            <div
                className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden relative z-10"
                style={{ animation: 'tutorial-fade-in 0.35s ease-out' }}
            >
                {/* Decorative header band */}
                <div className="h-2 bg-gradient-to-r from-success-500 via-secondary-500 to-indigo-500" />

                <div className="p-8 text-center">
                    {/* Trophy icon */}
                    <div className="w-20 h-20 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="8 9 12 5 16 9" />
                            <line x1="12" y1="5" x2="12" y2="17" />
                            <path d="M20 21H4" />
                            <path d="M5 10H3a1 1 0 0 0-1 1v2a4 4 0 0 0 8 0v-2a1 1 0 0 0-1-1H5z" />
                            <path d="M19 10h2a1 1 0 0 1 1 1v2a4 4 0 0 1-8 0v-2a1 1 0 0 1 1-1h2" />
                        </svg>
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h2>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                        You've completed the StudyCanvas tour. You now know all the tools to study smarter, retain more, and stress less.
                    </p>

                    {/* Quick recap */}
                    <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What you learned</p>
                        <div className="space-y-1.5">
                            {([
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/></svg>, label: 'Ask Gemini about any selected text' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="M4.5 3h15"/><path d="M6 3v9l-2 3.5A4 4 0 0 0 8 21h8a4 4 0 0 0 3.46-5.5L17 12V3"/><line x1="6" y1="13" x2="18" y2="13"/></svg>, label: 'Generate quiz questions per page' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>, label: 'Revision mode with flashcards' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>, label: 'AI chat with full page context' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>, label: 'Snipping, sticky notes, voice recorder' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Pomodoro timer for focused sessions' },
                                { icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.02 3 1.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-2-2.02z"/></svg>, label: 'Whiteboard drawing & annotation' },
                            ] as { icon: ReactNode; label: string }[]).map(({ icon, label }) => (
                                <div key={label} className="flex items-center gap-2">
                                    {icon}
                                    <p className="text-xs text-gray-600">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleGoHome}
                        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors mb-3"
                    >
                        Create My First Canvas →
                    </button>

                    <button
                        onClick={handleStay}
                        className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Stay & explore the tutorial canvas
                    </button>

                    <p className="text-xs text-gray-300 mt-3">
                        You can replay this tour anytime from the Settings menu on the home page
                    </p>
                </div>
            </div>
        </div>,
        document.body,
    )
}
