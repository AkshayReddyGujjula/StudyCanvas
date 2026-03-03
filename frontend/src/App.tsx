import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import HomePage from './components/HomePage'
import CanvasPage from './components/CanvasPage'
import OnboardingModal from './components/OnboardingModal'
import { TutorialOverlay } from './components/tutorial'
import { useAppStore } from './store/appStore'
import { getBrowserInfo } from './utils/browserDetection'
import './index.css'

// ─── Browser detection ───────────────────────────────────────────────────────

const BROWSER_INFO = getBrowserInfo()

// ─── Hard block — browser too old / no IndexedDB ────────────────────────────

function UnsupportedBrowserModal() {
  const { browser, browserVersion, os, warningMessage, warningTip, recommendedBrowsers } = BROWSER_INFO
  const browserLinks: Record<string, string> = {
    'Google Chrome': 'https://www.google.com/chrome/',
    'Microsoft Edge': 'https://www.microsoft.com/edge',
    'Mozilla Firefox': 'https://www.mozilla.org/firefox/',
    'Brave': 'https://brave.com/',
    'Safari 10.1+': 'https://www.apple.com/safari/',
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Browser Not Supported</h2>
        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-4 font-mono">
          {browser}{browserVersion ? ` ${browserVersion}` : ''} on {os}
        </div>
        <p className="text-sm text-gray-600 mb-3">{warningMessage}</p>
        {warningTip && <p className="text-xs text-gray-500 mb-5">{warningTip}</p>}
        {recommendedBrowsers.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Recommended Browsers</p>
            <div className="flex flex-wrap justify-center gap-3">
              {recommendedBrowsers.map((name) => (
                <a
                  key={name}
                  href={browserLinks[name] ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1 text-xs text-gray-600 hover:text-indigo-600 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-base">
                    {name[0]}
                  </div>
                  {name}
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Soft info banner — IDB mode on desktop / Android ───────────────────────

function StorageModeBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('sc_banner_dismissed') === '1' } catch { return false }
  })

  if (dismissed) return null
  const { warningLevel, warningTitle, warningMessage, warningTip, browser, browserVersion, os, recommendedBrowsers } = BROWSER_INFO
  if (warningLevel !== 'info') return null

  const handleDismiss = () => {
    try { sessionStorage.setItem('sc_banner_dismissed', '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="w-full z-[9998] bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-3 shadow-sm">
      <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800">{warningTitle}</p>
        <p className="text-xs text-amber-700 mt-0.5">{warningMessage}</p>
        {warningTip && <p className="text-xs text-amber-600 mt-0.5 italic">{warningTip}</p>}
        <p className="text-xs text-amber-500 mt-1 font-mono">
          {browser}{browserVersion ? ` ${browserVersion}` : ''} on {os}
          {recommendedBrowsers.length > 0 && (
            <> &middot; Recommended: {recommendedBrowsers.join(', ')}</>
          )}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors p-0.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
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

// Root layout — wraps all routes so TutorialOverlay has access to Router context
// (useNavigate inside TutorialCompletionModal requires being inside a Router)
function RootLayout() {
  return (
    <>
      <Outlet />
      <TutorialOverlay />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <AppGate /> },
      { path: '/canvas/:canvasId', element: <CanvasPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])


export default function App() {
  const initialize = useAppStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Hard block: browser has no IndexedDB (truly ancient / exotic)
  if (BROWSER_INFO.storageMode === 'unsupported') {
    return <UnsupportedBrowserModal />
  }

  return (
    <>
      {/* Soft dismissible banner for IDB-mode desktop browsers */}
      <StorageModeBanner />
      <RouterProvider router={router} />
      <Analytics />
      <SpeedInsights />
    </>
  )
}
