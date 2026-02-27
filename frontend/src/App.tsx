import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import HomePage from './components/HomePage'
import CanvasPage from './components/CanvasPage'
import OnboardingModal from './components/OnboardingModal'
import { useAppStore } from './store/appStore'
import './index.css'

/** Returns true when the browser supports the APIs StudyCanvas requires. */
function isBrowserCompatible(): boolean {
  return 'showDirectoryPicker' in window
}

function BrowserWarning() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Unsupported Browser</h2>
        <p className="text-sm text-gray-600 mb-4">
          StudyCanvas requires the <strong>File System Access API</strong>, which is only available in Chromium-based browsers.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Please switch to one of the following browsers for the best experience:
        </p>
        <div className="flex justify-center gap-6 mb-6">
          <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-lg">G</div>
            Google Chrome
          </a>
          <a href="https://brave.com/" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-lg">B</div>
            Brave
          </a>
          <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 text-xs text-gray-600 hover:text-primary-600 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-lg">E</div>
            Microsoft Edge
          </a>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="px-5 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Continue anyway
        </button>
      </div>
    </div>
  )
}


function AppGate() {
  const isOnboarded = useAppStore((s) => s.isOnboarded)
  const isLoading = useAppStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isOnboarded) {
    return <OnboardingModal />
  }

  return <HomePage />
}

const router = createBrowserRouter([
  { path: '/', element: <AppGate /> },
  { path: '/canvas/:canvasId', element: <CanvasPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])


export default function App() {
  const initialize = useAppStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      {!isBrowserCompatible() && <BrowserWarning />}
      <RouterProvider router={router} />
      <Analytics />
      <SpeedInsights />
    </>
  )
}
