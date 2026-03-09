import { useState, useMemo, useCallback } from 'react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid,
} from 'recharts'
import { useUsageStore } from '../store/usageStore'
import type { UsageEntry } from '../types'

// ── Pricing constants ($/token) ───────────────────────────────────────────────
const PRICING = {
    lite:  { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
    flash: { input: 0.30 / 1_000_000, output: 2.50 / 1_000_000 },
}

const MODEL_NAMES: Record<'lite' | 'flash', string> = {
    lite:  'Gemini 2.5 Flash Lite',
    flash: 'Gemini 3.1 Flash Lite',
}

const ENDPOINT_LABELS: Record<string, string> = {
    query:      'AI Q&A',
    quiz:       'Quiz Generation',
    flashcards: 'Flashcards',
    summarize:  'Page Summary',
    'page-quiz':'Page Quiz',
    grade:      'Answer Grading',
    validate:   'Answer Validation',
    ocr:        'OCR / Vision',
    transcribe: 'Audio Transcription',
    title:      'Document Titling',
    followup:   'Quiz Follow-up',
}

type TimeRange = '24h' | '3d' | '7d' | '2w' | '1m' | '1y' | 'all'
type Metric = 'input' | 'output' | 'cost'

const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
    { key: '24h', label: '24h',   ms: 24 * 60 * 60 * 1000 },
    { key: '3d',  label: '3d',    ms: 3  * 24 * 60 * 60 * 1000 },
    { key: '7d',  label: '7d',    ms: 7  * 24 * 60 * 60 * 1000 },
    { key: '2w',  label: '2w',    ms: 14 * 24 * 60 * 60 * 1000 },
    { key: '1m',  label: '1m',    ms: 30 * 24 * 60 * 60 * 1000 },
    { key: '1y',  label: '1y',    ms: 365* 24 * 60 * 60 * 1000 },
    { key: 'all', label: 'All',   ms: Infinity },
]

// Bucket size for chart data points based on range
function getBucketMs(rangeMs: number): number {
    if (rangeMs <= 24 * 3600 * 1000) return 3600 * 1000          // 1h buckets
    if (rangeMs <= 3  * 24 * 3600 * 1000) return 6 * 3600 * 1000 // 6h buckets
    if (rangeMs <= 14 * 24 * 3600 * 1000) return 24 * 3600 * 1000 // 1d buckets
    if (rangeMs <= 30 * 24 * 3600 * 1000) return 24 * 3600 * 1000 // 1d buckets
    return 7 * 24 * 3600 * 1000                                    // 1w buckets
}

function entryValue(e: UsageEntry, metric: Metric): number {
    if (metric === 'input')  return e.inputTokens
    if (metric === 'output') return e.outputTokens
    return e.inputTokens  * PRICING[e.model].input +
           e.outputTokens * PRICING[e.model].output
}

function formatBucketLabel(ts: number, bucketMs: number): string {
    const d = new Date(ts)
    if (bucketMs <= 6 * 3600 * 1000) {
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatY(value: number, metric: Metric): string {
    if (metric === 'cost') {
        if (value === 0) return '$0'
        if (value < 0.0001) return `$${value.toFixed(6)}`
        if (value < 0.01)   return `$${value.toFixed(4)}`
        return `$${value.toFixed(2)}`
    }
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}k`
    return String(Math.round(value))
}

function calcCost(entries: UsageEntry[]): number {
    return entries.reduce((sum, e) =>
        sum + e.inputTokens * PRICING[e.model].input + e.outputTokens * PRICING[e.model].output, 0)
}

function formatCost(cost: number): string {
    if (cost === 0) return '$0.00'
    if (cost < 0.0001) return `$${cost.toFixed(6)}`
    if (cost < 0.01)   return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
    return n.toLocaleString()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export default function UsageModal({ onClose }: Props) {
    const entries = useUsageStore(s => s.entries)

    const [range, setRange]   = useState<TimeRange>('7d')
    const [metric, setMetric] = useState<Metric>('input')

    // ── Filter entries to selected range ──────────────────────────────────────
    const rangeConfig = TIME_RANGES.find(r => r.key === range)!
    const now = Date.now()
    const cutoff = rangeConfig.ms === Infinity ? 0 : now - rangeConfig.ms
    const filtered = useMemo(() => entries.filter(e => e.timestamp >= cutoff), [entries, cutoff])

    // ── Overall totals ────────────────────────────────────────────────────────
    const totalInput  = useMemo(() => entries.reduce((s, e) => s + e.inputTokens,  0), [entries])
    const totalOutput = useMemo(() => entries.reduce((s, e) => s + e.outputTokens, 0), [entries])
    const totalCost   = useMemo(() => calcCost(entries), [entries])
    const totalCalls  = entries.length

    // ── Per-model totals (all time) ───────────────────────────────────────────
    const liteEntries  = useMemo(() => entries.filter(e => e.model === 'lite'),  [entries])
    const flashEntries = useMemo(() => entries.filter(e => e.model === 'flash'), [entries])

    // ── Chart data ────────────────────────────────────────────────────────────
    const chartData = useMemo(() => {
        if (filtered.length === 0) return []

        const bucketMs = getBucketMs(rangeConfig.ms === Infinity ? (now - (filtered[0]?.timestamp ?? now)) : rangeConfig.ms)
        const buckets = new Map<number, { lite: number; flash: number }>()

        for (const e of filtered) {
            const bucket = Math.floor(e.timestamp / bucketMs) * bucketMs
            const prev = buckets.get(bucket) ?? { lite: 0, flash: 0 }
            const val = entryValue(e, metric)
            if (e.model === 'lite')  prev.lite  += val
            else                     prev.flash += val
            buckets.set(bucket, prev)
        }

        return Array.from(buckets.entries())
            .sort(([a], [b]) => a - b)
            .map(([ts, vals]) => ({
                label: formatBucketLabel(ts, bucketMs),
                lite:  metric === 'cost' ? parseFloat(vals.lite.toFixed(6))  : Math.round(vals.lite),
                flash: metric === 'cost' ? parseFloat(vals.flash.toFixed(6)) : Math.round(vals.flash),
            }))
    }, [filtered, metric, rangeConfig.ms])

    // ── Monthly cost projection ───────────────────────────────────────────────
    const monthlyProjection = useMemo(() => {
        if (entries.length === 0) return null
        const oldest = entries[0].timestamp
        const daysSince = Math.max(1, (now - oldest) / (24 * 3600 * 1000))
        const dailyRate = totalCost / daysSince
        return dailyRate * 30
    }, [entries, totalCost])

    // ── Endpoint breakdown ────────────────────────────────────────────────────
    const endpointBreakdown = useMemo(() => {
        const map = new Map<string, number>()
        for (const e of entries) {
            const tokens = e.inputTokens + e.outputTokens
            map.set(e.endpoint, (map.get(e.endpoint) ?? 0) + tokens)
        }
        const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1
        return Array.from(map.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([ep, tokens]) => ({
                endpoint: ep,
                label: ENDPOINT_LABELS[ep] ?? ep,
                tokens,
                pct: Math.round((tokens / total) * 100),
            }))
    }, [entries])

    // ── Export CSV ────────────────────────────────────────────────────────────
    const exportCsv = useCallback(() => {
        const header = 'timestamp,datetime,model,endpoint,input_tokens,output_tokens,cost_usd'
        const rows = entries.map(e => {
            const pricing = PRICING[e.model as 'lite' | 'flash']
            const cost = e.inputTokens * pricing.input + e.outputTokens * pricing.output
            return `${e.timestamp},${new Date(e.timestamp).toISOString()},${e.model},${e.endpoint},${e.inputTokens},${e.outputTokens},${cost.toFixed(8)}`
        })
        const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `studycanvas-usage-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }, [entries])

    const tooltipFormatter = useCallback((value: number | string | undefined) => {
        const num = typeof value === 'number' ? value : 0
        return metric === 'cost' ? formatCost(num) : formatTokens(num)
    }, [metric])

    const yTickFormatter = useCallback((v: number) => formatY(v, metric), [metric])

    const hasData = entries.length > 0

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <h2 className="text-base font-semibold text-gray-900">API Usage & Costs</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            { label: 'Input Tokens',  value: formatTokens(totalInput),  sub: 'all time' },
                            { label: 'Output Tokens', value: formatTokens(totalOutput), sub: 'all time' },
                            { label: 'Est. Cost',     value: formatCost(totalCost),     sub: 'all time' },
                            { label: 'API Calls',     value: totalCalls.toLocaleString(), sub: 'all time' },
                        ].map(card => (
                            <div key={card.label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                                <p className="text-lg font-semibold text-gray-900 leading-tight">{card.value}</p>
                                <p className="text-xs text-gray-400">{card.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Model breakdown */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Model Breakdown</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {([['lite', liteEntries], ['flash', flashEntries]] as const).map(([model, mEntries]) => (
                                <div key={model} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: model === 'lite' ? '#1E3A5F' : '#2D9CDB' }} />
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{MODEL_NAMES[model]}</p>
                                            <p className="text-xs text-gray-400">
                                                {formatTokens(mEntries.reduce((s, e) => s + e.inputTokens, 0))} in
                                                {' / '}
                                                {formatTokens(mEntries.reduce((s, e) => s + e.outputTokens, 0))} out
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-gray-900">{formatCost(calcCost(mEntries))}</p>
                                        <p className="text-xs text-gray-400">{mEntries.length} calls</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Chart section */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                        {/* Metric toggles */}
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex gap-1">
                                {(['input', 'output', 'cost'] as Metric[]).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMetric(m)}
                                        className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                                            metric === m
                                                ? 'bg-[#1E3A5F] text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {m === 'input' ? 'Input Tokens' : m === 'output' ? 'Output Tokens' : 'Est. Cost'}
                                    </button>
                                ))}
                            </div>
                            {/* Time range toggles */}
                            <div className="flex gap-1">
                                {TIME_RANGES.map(r => (
                                    <button
                                        key={r.key}
                                        onClick={() => setRange(r.key)}
                                        className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                                            range === r.key
                                                ? 'bg-[#2D9CDB] text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chart */}
                        <div className="p-4">
                            {!hasData ? (
                                <div className="h-48 flex flex-col items-center justify-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                    </svg>
                                    <p className="text-sm">No usage data yet</p>
                                    <p className="text-xs mt-1">Start using AI features to track your usage</p>
                                </div>
                            ) : chartData.length === 0 ? (
                                <div className="h-48 flex items-center justify-center text-gray-400">
                                    <p className="text-sm">No data in selected time range</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                            tickLine={false}
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={yTickFormatter}
                                            width={50}
                                        />
                                        <Tooltip
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            formatter={tooltipFormatter as any}
                                            labelStyle={{ fontSize: 11, color: '#374151' }}
                                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                                        />
                                        <Legend
                                            formatter={(value) => value === 'lite' ? MODEL_NAMES.lite : MODEL_NAMES.flash}
                                            wrapperStyle={{ fontSize: 11 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="lite"
                                            name="lite"
                                            stroke="#1E3A5F"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="flash"
                                            name="flash"
                                            stroke="#2D9CDB"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Feature breakdown */}
                    {hasData && endpointBreakdown.length > 0 && (
                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Features by Token Usage</p>
                            </div>
                            <div className="px-4 py-3 space-y-2.5">
                                {endpointBreakdown.map(({ endpoint, label, tokens, pct }) => (
                                    <div key={endpoint}>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-xs text-gray-700">{label}</span>
                                            <span className="text-xs text-gray-500">{formatTokens(tokens)} ({pct}%)</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{ width: `${pct}%`, background: '#2D9CDB' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Projection + actions */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
                        <div>
                            {monthlyProjection !== null && monthlyProjection > 0 ? (
                                <p className="text-xs text-gray-500">
                                    Projected monthly cost at current rate:{' '}
                                    <span className="font-semibold text-gray-700">{formatCost(monthlyProjection)}</span>
                                </p>
                            ) : (
                                <p className="text-xs text-gray-400">No usage recorded yet.</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {hasData && (
                                <button
                                    onClick={exportCsv}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    Export CSV
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Pricing note */}
                    <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                        Costs are estimates based on public pricing: Gemini 2.5 Flash Lite $0.10/$0.40 per 1M tokens (in/out) · Gemini 3.1 Flash Lite $0.30/$2.50 per 1M tokens (in/out). Actual charges may vary.
                    </p>
                </div>
            </div>
        </div>
    )
}
