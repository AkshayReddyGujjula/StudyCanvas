import { create } from 'zustand'

// ─── Tutorial store — manages the first-time user walkthrough ─────────────────

export const TUTORIAL_DONE_KEY = 'studycanvas_tutorial_done'
export const TUTORIAL_CANVAS_KEY = 'studycanvas_tutorial_canvas_id'

/** Clear all tutorial-related localStorage keys (called on logout / new workspace). */
export function clearTutorialStorage() {
    try { localStorage.removeItem(TUTORIAL_DONE_KEY) } catch { /* ignore */ }
    try { localStorage.removeItem(TUTORIAL_CANVAS_KEY) } catch { /* ignore */ }
}

/** Total number of spotlight steps in the tutorial (not counting the completion screen). */
export const TUTORIAL_TOTAL_STEPS = 11

function loadCompleted(): boolean {
    try {
        return localStorage.getItem(TUTORIAL_DONE_KEY) === 'true'
    } catch {
        return false
    }
}

interface TutorialState {
    /** Whether the step-by-step spotlight tour is active */
    isTutorialActive: boolean
    /** 0-indexed current step */
    currentStep: number
    /** Total number of steps */
    totalSteps: number
    /** Whether the tutorial has been completed or skipped (persisted in localStorage) */
    tutorialCompleted: boolean
    /** Canvas ID of the auto-created tutorial canvas */
    tutorialCanvasId: string | null
    /** Whether the end-of-tutorial completion modal is shown */
    showCompletion: boolean
}

interface TutorialActions {
    /** Begin the tour for a given tutorial canvas ID */
    startTutorial: (canvasId: string) => void
    /** Advance to the next step (calls completeTutorial on last step) */
    nextStep: () => void
    /** Go back to the previous step */
    prevStep: () => void
    /** Skip the entire tutorial */
    skipTutorial: () => void
    /** Mark tutorial as complete and show the completion screen */
    completeTutorial: () => void
    /** Dismiss the completion modal */
    dismissCompletion: () => void
    /** Allow the user to replay from the Settings menu */
    replayTutorial: () => void
}

export const useTutorialStore = create<TutorialState & TutorialActions>((set, get) => ({
    isTutorialActive: false,
    currentStep: 0,
    totalSteps: TUTORIAL_TOTAL_STEPS,
    tutorialCompleted: loadCompleted(),
    tutorialCanvasId: (() => {
        try { return localStorage.getItem(TUTORIAL_CANVAS_KEY) } catch { return null }
    })(),
    showCompletion: false,

    startTutorial: (canvasId) => {
        try { localStorage.setItem(TUTORIAL_CANVAS_KEY, canvasId) } catch { /* ignore */ }
        set({
            isTutorialActive: true,
            currentStep: 0,
            tutorialCanvasId: canvasId,
            showCompletion: false,
        })
    },

    nextStep: () => {
        const { currentStep, totalSteps } = get()
        if (currentStep < totalSteps - 1) {
            set({ currentStep: currentStep + 1 })
        } else {
            get().completeTutorial()
        }
    },

    prevStep: () => {
        const { currentStep } = get()
        if (currentStep > 0) {
            set({ currentStep: currentStep - 1 })
        }
    },

    skipTutorial: () => {
        try { localStorage.setItem(TUTORIAL_DONE_KEY, 'true') } catch { /* ignore */ }
        set({ isTutorialActive: false, tutorialCompleted: true, showCompletion: false })
    },

    completeTutorial: () => {
        try { localStorage.setItem(TUTORIAL_DONE_KEY, 'true') } catch { /* ignore */ }
        set({ isTutorialActive: false, tutorialCompleted: true, showCompletion: true })
    },

    dismissCompletion: () => {
        set({ showCompletion: false })
    },

    replayTutorial: () => {
        try { localStorage.removeItem(TUTORIAL_DONE_KEY) } catch { /* ignore */ }
        try { localStorage.removeItem(TUTORIAL_CANVAS_KEY) } catch { /* ignore */ }
        set({ tutorialCompleted: false, isTutorialActive: false, currentStep: 0, showCompletion: false, tutorialCanvasId: null })
    },
}))
