/**
 * browserDetection.ts
 *
 * Detects the user's browser, OS, and which storage APIs are available.
 * Determines the appropriate storage mode and any warning to show.
 *
 * Storage modes:
 *   'filesystem'  — Full File System Access API available (Chromium desktop)
 *   'indexeddb'   — No FS API but IndexedDB is available (Firefox, Safari, iOS, Android)
 *   'unsupported' — Neither API available (very old browser)
 */

export type StorageMode = 'filesystem' | 'indexeddb' | 'unsupported'

export type BrowserName =
    | 'Chrome'
    | 'Edge'
    | 'Brave'
    | 'Opera'
    | 'Firefox'
    | 'Safari'
    | 'Samsung Internet'
    | 'unknown'

export type OSName =
    | 'iOS'
    | 'iPadOS'
    | 'Android'
    | 'macOS'
    | 'Windows'
    | 'Linux'
    | 'unknown'

export type WarningLevel = 'none' | 'info' | 'hard'

export interface BrowserInfo {
    browser: BrowserName
    browserVersion: string
    os: OSName
    isMobile: boolean
    hasFileSystemAPI: boolean
    hasIndexedDB: boolean
    storageMode: StorageMode
    warningLevel: WarningLevel
    /** User-facing headline for the warning banner/modal (empty string if none). */
    warningTitle: string
    /** User-facing body text for the warning banner/modal (empty string if none). */
    warningMessage: string
    /** Optional per-browser tip (e.g. how to enable FS API or switch browser). */
    warningTip: string
    /** The recommended browser(s) to switch to (empty array if no hard requirement). */
    recommendedBrowsers: string[]
}

// ─── UA parsing helpers ───────────────────────────────────────────────────────

function detectOS(ua: string, platform: string): OSName {
    // iPadOS 13+ reports itself as macOS in the UA; detect via touch + platform
    if (/iPad/.test(ua)) return 'iPadOS'
    if (/iPhone|iPod/.test(ua)) return 'iOS'
    // iPad 13+ masquerades as Mac — detect by maxTouchPoints
    if (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'iPadOS'
    if (/Android/.test(ua)) return 'Android'
    if (/Win/.test(platform) || /Windows/.test(ua)) return 'Windows'
    if (/Mac/.test(platform) || /Mac OS X/.test(ua)) return 'macOS'
    if (/Linux/.test(platform) || /Linux/.test(ua)) return 'Linux'
    return 'unknown'
}

function detectBrowser(ua: string): { name: BrowserName; version: string } {
    // Order matters — Edge and Brave both include Chrome in their UA
    if (/Edg\//.test(ua)) {
        const match = ua.match(/Edg\/(\d+)/)
        return { name: 'Edge', version: match?.[1] ?? '' }
    }
    // Samsung Internet
    if (/SamsungBrowser\//.test(ua)) {
        const match = ua.match(/SamsungBrowser\/(\d+)/)
        return { name: 'Samsung Internet', version: match?.[1] ?? '' }
    }
    // Opera (new OPR/ UA)
    if (/OPR\//.test(ua)) {
        const match = ua.match(/OPR\/(\d+)/)
        return { name: 'Opera', version: match?.[1] ?? '' }
    }
    // Firefox
    if (/Firefox\//.test(ua)) {
        const match = ua.match(/Firefox\/(\d+)/)
        return { name: 'Firefox', version: match?.[1] ?? '' }
    }
    // Chrome (and Brave — we check window.navigator.brave below)
    if (/Chrome\//.test(ua)) {
        const match = ua.match(/Chrome\/(\d+)/)
        return { name: 'Chrome', version: match?.[1] ?? '' }
    }
    // Safari (must come after Chrome because Chrome on iOS includes Safari/)
    if (/Safari\//.test(ua)) {
        const match = ua.match(/Version\/(\d+)/)
        return { name: 'Safari', version: match?.[1] ?? '' }
    }
    return { name: 'unknown', version: '' }
}

// ─── Main detection function ─────────────────────────────────────────────────

let _cached: BrowserInfo | null = null

export function getBrowserInfo(): BrowserInfo {
    if (_cached) return _cached

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const platform = typeof navigator !== 'undefined' ? (navigator.platform ?? '') : ''

    const os = detectOS(ua, platform)
    const { name: detectedBrowser, version } = detectBrowser(ua)

    // Brave exposes window.navigator.brave (async API, but the object presence is sync)
    const isBrave =
        detectedBrowser === 'Chrome' &&
        typeof window !== 'undefined' &&
        !!(window.navigator as any).brave

    const browser: BrowserName = isBrave ? 'Brave' : detectedBrowser
    const isMobile = os === 'iOS' || os === 'iPadOS' || os === 'Android'

    const hasFileSystemAPI = typeof window !== 'undefined' && 'showDirectoryPicker' in window
    const hasIndexedDB = typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null

    let storageMode: StorageMode
    if (hasFileSystemAPI) {
        storageMode = 'filesystem'
    } else if (hasIndexedDB) {
        storageMode = 'indexeddb'
    } else {
        storageMode = 'unsupported'
    }

    // ─── Determine warning level and messages ────────────────────────────────

    let warningLevel: WarningLevel = 'none'
    let warningTitle = ''
    let warningMessage = ''
    let warningTip = ''
    let recommendedBrowsers: string[] = []

    if (storageMode === 'unsupported') {
        warningLevel = 'hard'
        warningTitle = 'Browser Not Supported'
        warningMessage = `You're using ${browser}${version ? ` ${version}` : ''} on ${os}. StudyCanvas requires IndexedDB storage, which is not available in your browser.`
        warningTip = 'Please upgrade your browser or switch to a modern browser to use StudyCanvas.'
        recommendedBrowsers = ['Google Chrome', 'Microsoft Edge', 'Mozilla Firefox', 'Safari 10.1+']
    } else if (storageMode === 'indexeddb') {
        // iOS / iPadOS: fully seamless — no warning at all
        if (os === 'iOS' || os === 'iPadOS') {
            warningLevel = 'none'
        }
        // Android: soft info banner
        else if (os === 'Android') {
            warningLevel = 'info'
            warningTitle = 'Browser Storage Mode'
            warningMessage = `You're using ${browser} on Android. Your canvases are saved in your browser's local storage on this device.`
            warningTip = 'Your data stays on this device. For file-based sync across devices, use Chrome or Edge on Windows/macOS.'
            recommendedBrowsers = ['Google Chrome (desktop)', 'Microsoft Edge (desktop)']
        }
        // Desktop Firefox
        else if (browser === 'Firefox') {
            warningLevel = 'info'
            warningTitle = 'Using Browser Storage'
            warningMessage = `You're using Firefox on ${os}. Firefox doesn't support the File System Access API, so your canvases are saved in browser storage.`
            warningTip = 'Your canvases persist across sessions in Firefox. To save directly to your hard drive, switch to Chrome, Edge, or Brave.'
            recommendedBrowsers = ['Google Chrome', 'Microsoft Edge', 'Brave']
        }
        // Desktop Safari (macOS)
        else if (browser === 'Safari' && os === 'macOS') {
            warningLevel = 'info'
            warningTitle = 'Using Browser Storage'
            warningMessage = `You're using Safari on macOS. Safari doesn't support the File System Access API, so your canvases are saved in browser storage.`
            warningTip = 'Your canvases persist across sessions. For direct file system access, switch to Chrome or Edge on macOS.'
            recommendedBrowsers = ['Google Chrome', 'Microsoft Edge', 'Brave']
        }
        // Samsung Internet or unknown mobile
        else if (browser === 'Samsung Internet') {
            warningLevel = 'info'
            warningTitle = 'Using Browser Storage'
            warningMessage = `You're using Samsung Internet. Your canvases are saved in your browser's local storage on this device.`
            warningTip = 'Try Google Chrome on Android for the best experience.'
            recommendedBrowsers = ['Google Chrome']
        }
        // Other unknown browsers / OS combos
        else if (browser === 'unknown' || os === 'unknown') {
            warningLevel = 'info'
            warningTitle = 'Limited Storage Mode'
            warningMessage = `Your browser doesn't support the File System Access API. Canvases will be saved in browser storage.`
            warningTip = 'For the full experience with file system access, use Google Chrome, Microsoft Edge, or Brave on Windows or macOS.'
            recommendedBrowsers = ['Google Chrome', 'Microsoft Edge', 'Brave']
        }
        // Chromium-based but somehow no FS API (unusual, e.g. old Opera, old Edge)
        else {
            warningLevel = 'info'
            warningTitle = 'Using Browser Storage'
            warningMessage = `${browser}${version ? ` ${version}` : ''} on ${os} doesn't have File System Access enabled. Canvases are saved in browser storage.`
            warningTip =
                browser === 'Chrome' || browser === 'Edge' || browser === 'Brave'
                    ? `Try updating ${browser} to the latest version to enable direct file saving.`
                    : 'Switch to Chrome, Edge, or Brave for direct file system access.'
            recommendedBrowsers =
                browser === 'Chrome' || browser === 'Edge' || browser === 'Brave'
                    ? [`Update ${browser}`]
                    : ['Google Chrome', 'Microsoft Edge', 'Brave']
        }
    }
    // 'filesystem' mode — no warning needed
    // (Chrome / Edge / Brave / Opera on Windows/macOS/Linux)

    _cached = {
        browser,
        browserVersion: version,
        os,
        isMobile,
        hasFileSystemAPI,
        hasIndexedDB,
        storageMode,
        warningLevel,
        warningTitle,
        warningMessage,
        warningTip,
        recommendedBrowsers,
    }

    return _cached
}

/** Convenience: just returns the storage mode. */
export function getStorageMode(): StorageMode {
    return getBrowserInfo().storageMode
}

/** Returns true if the File System Access API is available. */
export function hasFileSystemAccess(): boolean {
    return getBrowserInfo().hasFileSystemAPI
}
