import { create } from 'zustand'
import type { UsageEntry } from '../types'

const STORAGE_KEY = 'studycanvas_usage_v1'
const MAX_ENTRIES = 10_000

interface UsageState {
    entries: UsageEntry[]
    addEntry: (entry: UsageEntry) => void
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
    },
    clearAll: () => {
        localStorage.removeItem(STORAGE_KEY)
        set({ entries: [] })
    },
}))
