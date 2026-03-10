import { create } from 'zustand'
import type { UsageEntry } from '../types'
import { saveUsageStats } from '../services/fileSystemService'

const STORAGE_KEY = 'studycanvas_usage_v1'
const MAX_ENTRIES = 10_000

interface UsageState {
    entries: UsageEntry[]
    addEntry: (entry: UsageEntry) => void
    /** Merge stats loaded from the workspace file, deduplicating by timestamp. */
    mergeFromFile: (fileEntries: UsageEntry[]) => void
    clearAll: () => void
}

function loadEntries(): UsageEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export const useUsageStore = create<UsageState>((set, get) => ({
    entries: loadEntries(),

    addEntry: (entry: UsageEntry) => {
        const entries = [...get().entries, entry].slice(-MAX_ENTRIES)
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
        } catch {
            // localStorage full — trim further
        }
        set({ entries })

        // Also persist to workspace file for cross-device sync (fire-and-forget)
        // Import appStore lazily to avoid circular dependency at module load time
        import('./appStore').then(({ useAppStore }) => {
            const { directoryHandle } = useAppStore.getState()
            if (directoryHandle) {
                saveUsageStats(directoryHandle, entries).catch(() => {})
            }
        }).catch(() => {})
    },

    mergeFromFile: (fileEntries: UsageEntry[]) => {
        // Merge local + file entries, deduplicate by timestamp, keep newest MAX_ENTRIES
        const map = new Map<number, UsageEntry>()
        for (const e of [...get().entries, ...fileEntries]) {
            map.set(e.timestamp, e)
        }
        const merged = [...map.values()]
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-MAX_ENTRIES)
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        } catch {
            // ignore
        }
        set({ entries: merged })
    },

    clearAll: () => {
        localStorage.removeItem(STORAGE_KEY)
        set({ entries: [] })
    },
}))
