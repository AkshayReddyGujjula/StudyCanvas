import { memo } from 'react'
import type { ProgressCounts } from '../types'

interface Props {
    progressCounts: ProgressCounts | undefined
    className?: string
}

const ProgressBar = memo(function ProgressBar({ progressCounts, className = '' }: Props) {
    // No data yet or no tracked nodes — show a white placeholder bar
    if (!progressCounts || progressCounts.total === 0) {
        return <div className={`flex w-full h-1 bg-white ${className}`} />
    }

    const { understood, struggling, total } = progressCounts
    const unread = total - understood - struggling

    const understoodPct = (understood / total) * 100
    const strugglingPct = (struggling / total) * 100
    const unreadPct = (unread / total) * 100

    return (
        <div className={`flex w-full h-1 overflow-hidden ${className}`} title={`${understood} understood · ${struggling} struggling · ${unread} unmarked`}>
            {understoodPct > 0 && (
                <span className="bg-success-500" style={{ width: `${understoodPct}%` }} />
            )}
            {strugglingPct > 0 && (
                <span className="bg-accent-500" style={{ width: `${strugglingPct}%` }} />
            )}
            {unreadPct > 0 && (
                <span className="bg-gray-300" style={{ width: `${unreadPct}%` }} />
            )}
        </div>
    )
})

export default ProgressBar
