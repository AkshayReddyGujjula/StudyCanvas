import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTutorialStore, TUTORIAL_TOTAL_STEPS } from '../../store/tutorialStore'
import { tutorialSteps } from './tutorialSteps'
import TutorialCompletionModal from './TutorialCompletionModal'

// ─── Tutorial Overlay ─────────────────────────────────────────────────────────
// Renders via React Portal at z-index 10000. Shows a spotlight on the target
// element and a tooltip card with navigation controls.
// Inspired by game-style intro tutorials — each step focuses the user's attention
// on one feature at a time.

const OVERLAY_BG = 'rgba(0, 0, 0, 0.65)'
const SPOTLIGHT_PADDING = 10
const TOOLTIP_MAX_WIDTH = 360
// Ring smoothly tracks the spotlit element; strips SNAP (no transition) to avoid the
// wipe-across-screen glitch when the spotlight jumps between distant elements.
const RING_TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
// Tooltip card MOVES smoothly via CSS position transitions; inner content slides up fresh
const TOOLTIP_MOVE_TRANSITION = 'top 0.32s cubic-bezier(0.4, 0, 0.2, 1), left 0.32s cubic-bezier(0.4, 0, 0.2, 1)'

interface SpotlightRect {
    top: number
    left: number
    width: number
    height: number
}

function getSpotlightRect(selector: string | null, padding: number): SpotlightRect | null {
    if (!selector) return null
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
        top: r.top - padding,
        left: r.left - padding,
        width: r.width + padding * 2,
        height: r.height + padding * 2,
    }
}

// Compute tooltip position so it doesn't go off-screen
function computeTooltipStyle(
    spot: SpotlightRect,
    position: string,
    tooltipWidth: number,
): React.CSSProperties {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const PAD = 20
    const estimatedH = 380

    let top: number
    let left: number

    if (position === 'right') {
        left = spot.left + spot.width + 16
        top = spot.top + spot.height / 2 - estimatedH / 2
        // Flip to left if overflow
        if (left + tooltipWidth > vw - PAD) left = spot.left - tooltipWidth - 16
    } else if (position === 'left') {
        left = spot.left - tooltipWidth - 16
        top = spot.top + spot.height / 2 - estimatedH / 2
        if (left < PAD) left = spot.left + spot.width + 16
    } else if (position === 'top') {
        top = spot.top - estimatedH - 16
        left = spot.left + spot.width / 2 - tooltipWidth / 2
        if (top < PAD) top = spot.top + spot.height + 16
    } else {
        // bottom
        top = spot.top + spot.height + 16
        left = spot.left + spot.width / 2 - tooltipWidth / 2
        if (top + estimatedH > vh - PAD) top = spot.top - estimatedH - 16
    }

    // Clamp fully within viewport so the card is always visible on any display size
    left = Math.max(PAD, Math.min(left, vw - tooltipWidth - PAD))
    top = Math.max(PAD, Math.min(top, vh - estimatedH - PAD))

    return { top, left, position: 'fixed', width: tooltipWidth }
}

// ─── Phase icon lookup — maps phaseIconKey strings to crisp SVG icons ─────────
function PhaseIcon({ id, className = 'h-3.5 w-3.5' }: { id: string; className?: string }) {
    const props = {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2 as number,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        className,
    }
    switch (id) {
        case 'graduation-cap':
            return <svg {...props}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        case 'file-text':
            return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        case 'layers':
            return <svg {...props}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        case 'sparkle':
            return <svg {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/></svg>
        case 'flask':
            return <svg {...props}><path d="M4.5 3h15"/><path d="M6 3v9l-2 3.5A4 4 0 0 0 8 21h8a4 4 0 0 0 3.46-5.5L17 12V3"/><line x1="6" y1="13" x2="18" y2="13"/></svg>
        case 'refresh-cw':
            return <svg {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        case 'bot':
            return <svg {...props}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        case 'wrench':
            return <svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        case 'timer':
            return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        case 'paintbrush':
            return <svg {...props}><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.02 3 1.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-2-2.02z"/></svg>
        case 'save':
            return <svg {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        case 'mic':
            return <svg {...props}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        default:
            return null
    }
}

// Skip confirm banner (shows briefly after Esc/Space)
function SkipConfirmBanner({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    return (
        <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10002] flex items-center gap-3 px-5 py-3 bg-gray-900 text-white text-sm rounded-xl shadow-2xl"
            style={{ animation: 'tutorial-fade-in 0.2s ease-out' }}
        >
            <span>Skip the tutorial?</span>
            <button
                onClick={onConfirm}
                className="px-3 py-1 bg-white text-gray-900 font-semibold rounded-lg text-xs hover:bg-gray-100 transition-colors"
            >
                Yes, skip
            </button>
            <button
                onClick={onCancel}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors"
            >
                Keep going
            </button>
        </div>
    )
}

export default function TutorialOverlay() {
    const isTutorialActive = useTutorialStore((s) => s.isTutorialActive)
    const currentStep = useTutorialStore((s) => s.currentStep)
    const nextStep = useTutorialStore((s) => s.nextStep)
    const prevStep = useTutorialStore((s) => s.prevStep)
    const skipTutorial = useTutorialStore((s) => s.skipTutorial)

    const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)
    const [tooltipKey, setTooltipKey] = useState(0)
    const [showSkipConfirm, setShowSkipConfirm] = useState(false)

    const rafRef = useRef<number | null>(null)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const step = tutorialSteps[currentStep]

    // ── Measure spotlight target ─────────────────────────────────────────────
    const measureTarget = useCallback(() => {
        if (!step) return
        const rect = getSpotlightRect(step.targetSelector, SPOTLIGHT_PADDING + step.highlightPadding)
        setSpotlightRect(rect)
        return rect
    }, [step])

    // Re-measure on step change, with retries for elements that load async
    useEffect(() => {
        if (!isTutorialActive) return

        // Clear any pending retries
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        setTooltipKey((k) => k + 1)

        const rect = measureTarget()

        // If element not found yet, retry a few times (covers ReactFlow lazy-mount)
        if (!rect && step?.targetSelector) {
            let attempts = 0
            const retry = () => {
                attempts++
                const r = measureTarget()
                if (!r && attempts < 8) {
                    retryTimerRef.current = setTimeout(retry, 350)
                }
            }
            retryTimerRef.current = setTimeout(retry, 300)
        }

        return () => {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        }
    }, [isTutorialActive, currentStep, measureTarget, step?.targetSelector])

    // Re-measure on window resize
    useEffect(() => {
        if (!isTutorialActive) return
        const handler = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => measureTarget())
        }
        window.addEventListener('resize', handler)
        return () => {
            window.removeEventListener('resize', handler)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [isTutorialActive, measureTarget])

    // ── Keyboard controls ────────────────────────────────────────────────────
    useEffect(() => {
        if (!isTutorialActive) return

        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

            if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault()
                if (showSkipConfirm) { setShowSkipConfirm(false); return }
                nextStep()
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                if (showSkipConfirm) { setShowSkipConfirm(false); return }
                prevStep()
            } else if (e.key === 'Escape' || e.key === ' ') {
                e.preventDefault()
                if (showSkipConfirm) {
                    setShowSkipConfirm(false)
                } else {
                    setShowSkipConfirm(true)
                    // Auto-hide after 4s
                    setTimeout(() => setShowSkipConfirm(false), 4000)
                }
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isTutorialActive, nextStep, prevStep, showSkipConfirm])

    if (!isTutorialActive || !step) {
        return (
            <>
                <TutorialCompletionModal />
            </>
        )
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
    // Responsive tooltip width: slightly wider on larger screens, always fits viewport
    const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, Math.max(300, vw * 0.18))
    const isCentred = !step.targetSelector || !spotlightRect

    // Build overlay strips (4 divs around the spotlight)
    const sp = spotlightRect
    const TOP_H = sp ? Math.max(0, sp.top) : 0
    const BOT_Y = sp ? Math.min(vh, sp.top + sp.height) : 0
    const BOT_H = sp ? Math.max(0, vh - BOT_Y) : 0
    const MID_H = sp ? Math.max(0, sp.height) : 0
    const LEFT_W = sp ? Math.max(0, sp.left) : 0
    const RIGHT_X = sp ? Math.min(vw, sp.left + sp.width) : 0
    const RIGHT_W = sp ? Math.max(0, vw - RIGHT_X) : 0

    const tooltipStyle = isCentred
        ? { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: tooltipWidth }
        : computeTooltipStyle(spotlightRect!, step.tooltipPosition, tooltipWidth)

    // Progress percentage
    const progressPct = ((currentStep) / (TUTORIAL_TOTAL_STEPS - 1)) * 100

    return createPortal(
        <>
            {/* ── Overlay strips ─────────────────────────────────────────── */}
            {isCentred ? (
                // Full-screen dim for centred steps
                <div
                    className="fixed inset-0 z-[10000]"
                    style={{ background: OVERLAY_BG }}
                    onClick={nextStep}
                />
            ) : (
                <>
                    {/* Top strip — snaps instantly; no transition avoids wipe-across-screen */}
                    <div
                        className="fixed left-0 right-0 z-[10000]"
                        style={{
                            top: 0,
                            height: TOP_H,
                            background: OVERLAY_BG,
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Bottom strip */}
                    <div
                        className="fixed left-0 right-0 z-[10000]"
                        style={{
                            top: BOT_Y,
                            height: BOT_H,
                            background: OVERLAY_BG,
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Left strip */}
                    <div
                        className="fixed z-[10000]"
                        style={{
                            top: sp ? sp.top : 0,
                            left: 0,
                            width: LEFT_W,
                            height: MID_H,
                            background: OVERLAY_BG,
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Right strip */}
                    <div
                        className="fixed z-[10000]"
                        style={{
                            top: sp ? sp.top : 0,
                            left: RIGHT_X,
                            width: RIGHT_W,
                            height: MID_H,
                            background: OVERLAY_BG,
                            pointerEvents: 'none',
                        }}
                    />
                    {/* Click-through backdrop for the rest (so user can't interact outside spotlight) */}
                    <div
                        className="fixed inset-0 z-[9999]"
                        style={{ pointerEvents: 'all', cursor: 'default' }}
                        onClick={nextStep}
                    />
                    {/* Spotlight border ring — smoothly tracks the element */}
                    <div
                        className="fixed z-[10001] pointer-events-none"
                        style={{
                            top: sp ? sp.top : 0,
                            left: sp ? sp.left : 0,
                            width: sp ? sp.width : 0,
                            height: sp ? sp.height : 0,
                            border: '2px solid #2D9CDB',
                            borderRadius: 12,
                            boxShadow: '0 0 0 3px rgba(45,156,219,0.25), 0 0 20px rgba(45,156,219,0.15)',
                            transition: RING_TRANSITION,
                            animation: 'tutorial-ring-pulse 2.5s ease-in-out infinite',
                        }}
                    />
                </>
            )}

            {/* ── Tooltip card ───────────────────────────────────────────── */}
            {/* Outer div: smoothly moves to the new position via CSS transitions.   */}
            {/* Inner div: remounts per-step (key) so content slides up fresh each time */}
            <div
                className="z-[10002] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                style={{
                    ...tooltipStyle,
                    pointerEvents: 'all',
                    transition: isCentred ? 'none' : TOOLTIP_MOVE_TRANSITION,
                }}
                onClick={(e) => e.stopPropagation()}
            >
            <div key={tooltipKey} style={{ animation: 'tutorial-slide-up 0.22s cubic-bezier(0.34,1.4,0.64,1)' }}>
                {/* Progress bar */}
                <div className="h-1 bg-gray-100">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                <div className="p-5">
                    {/* Step counter + phase badge */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">
                            <PhaseIcon id={step.phaseIconKey} className="h-3 w-3" /> {step.phaseLabel}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                            {currentStep + 1} / {TUTORIAL_TOTAL_STEPS}
                        </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>

                    {/* Description */}
                    <p className="text-[13px] text-gray-600 leading-relaxed mb-3">
                        {step.description}
                    </p>

                    {/* Pro tip */}
                    <div className="flex items-start gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p className="text-[11px] text-amber-700 leading-relaxed">{step.proTip}</p>
                    </div>

                    {/* Navigation row */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={prevStep}
                            disabled={currentStep === 0}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Back
                        </button>

                        {/* Step dots */}
                        <div className="flex items-center gap-1 flex-1 justify-center">
                            {Array.from({ length: TUTORIAL_TOTAL_STEPS }).map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-full transition-all duration-300"
                                    style={{
                                        width: i === currentStep ? 16 : 6,
                                        height: 6,
                                        backgroundColor: i === currentStep ? '#4F46E5' : i < currentStep ? '#a5b4fc' : '#e5e7eb',
                                    }}
                                />
                            ))}
                        </div>

                        <button
                            onClick={nextStep}
                            className="flex items-center gap-1 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                            {currentStep === TUTORIAL_TOTAL_STEPS - 1 ? 'Finish' : 'Next'}
                            {currentStep < TUTORIAL_TOTAL_STEPS - 1 && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Skip link */}
                    <button
                        onClick={() => setShowSkipConfirm(true)}
                        className="w-full text-center text-[11px] text-gray-300 hover:text-gray-500 transition-colors mt-3 py-1"
                    >
                        Skip tutorial (Esc)
                    </button>
                </div>
            </div>{/* end inner key-wrapper */}
            </div>{/* end outer tooltip card */}

            {/* Skip confirm banner */}
            {showSkipConfirm && (
                <SkipConfirmBanner
                    onConfirm={skipTutorial}
                    onCancel={() => setShowSkipConfirm(false)}
                />
            )}
        </>,
        document.body,
    )
}
