import { useState, useCallback, useEffect, useRef, memo, type CSSProperties } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CalculatorNodeData } from '../types'
import { useCanvasStore } from '../store/canvasStore'

type CalcNodeProps = NodeProps & { data: CalculatorNodeData }

// ─── History Storage (shared across all calculator nodes) ─────────────────────
const HISTORY_KEY = 'studycanvas-calc-history'
const MAX_HISTORY = 50

interface CalcHistoryEntry {
    expression: string
    result: string
    timestamp: number
}

function loadHistory(): CalcHistoryEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY)
        return raw ? (JSON.parse(raw) as CalcHistoryEntry[]) : []
    } catch {
        return []
    }
}

function saveHistory(history: CalcHistoryEntry[]) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
    } catch { /* ignore */ }
}

// ─── Math Utilities ───────────────────────────────────────────────────────────
function factorial(n: number): number {
    if (n < 0) throw new Error('Factorial undefined for negative numbers')
    if (!Number.isInteger(n)) throw new Error('Factorial requires integer input')
    if (n > 170) throw new Error('Number too large for factorial')
    if (n === 0 || n === 1) return 1
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return r
}

function formatResult(num: number): string {
    if (!isFinite(num)) return num > 0 ? 'Infinity' : '-Infinity'
    if (isNaN(num)) return 'Error'
    if (Math.abs(num) > 1e15 || (Math.abs(num) < 1e-10 && num !== 0)) {
        return num.toExponential(8)
    }
    return String(parseFloat(num.toPrecision(12)))
}

function evaluateExpression(expr: string, angleDeg: boolean): number {
    if (!expr.trim()) throw new Error('Empty expression')

    const toRad = (x: number) => angleDeg ? x * Math.PI / 180 : x
    const fromRad = (x: number) => angleDeg ? x * 180 / Math.PI : x

    // Replace display symbols
    let e = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/π/g, `(${Math.PI})`)
        // Replace standalone 'E' (Euler's number, inserted by button) not adjacent to digits (scientific notation)
        .replace(/(?<![0-9.])E(?![0-9+\-])/g, `(${Math.E})`)

    // Safety: only allow math-safe characters
    if (!/^[\d+\-*/().,\s%!a-zA-Z_^]+$/.test(e)) {
        throw new Error('Invalid characters in expression')
    }

    // Build evaluator with math functions in scope
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
        '_toRad', '_fromRad', '_fact',
        '_log', '_log2', '_log10',
        '_sqrt', '_cbrt', '_abs', '_pow', '_exp',
        '_sin', '_cos', '_tan', '_asin', '_acos', '_atan',
        '_sinh', '_cosh', '_tanh', '_asinh', '_acosh', '_atanh',
        '_floor', '_ceil', '_round', '_sign', '_trunc',
        `"use strict";
        const sin=(x)=>_sin(x),cos=(x)=>_cos(x),tan=(x)=>_tan(x);
        const asin=(x)=>_asin(x),acos=(x)=>_acos(x),atan=(x)=>_atan(x);
        const sinh=(x)=>_sinh(x),cosh=(x)=>_cosh(x),tanh=(x)=>_tanh(x);
        const asinh=(x)=>_asinh(x),acosh=(x)=>_acosh(x),atanh=(x)=>_atanh(x);
        const sqrt=(x)=>_sqrt(x),cbrt=(x)=>_cbrt(x),abs=(x)=>_abs(x);
        const ln=(x)=>_log(x),log=(x)=>_log10(x),log2=(x)=>_log2(x),log10=(x)=>_log10(x);
        const pow=(x,y)=>_pow(x,y),exp=(x)=>_exp(x);
        const floor=(x)=>_floor(x),ceil=(x)=>_ceil(x),round=(x)=>_round(x);
        const sign=(x)=>_sign(x),trunc=(x)=>_trunc(x),fact=(x)=>_fact(x);
        return (${e});`
    )

    const result = fn(
        toRad, fromRad, factorial,
        Math.log, Math.log2, Math.log10,
        Math.sqrt, Math.cbrt, Math.abs, Math.pow, Math.exp,
        (x: number) => Math.sin(toRad(x)),
        (x: number) => Math.cos(toRad(x)),
        (x: number) => Math.tan(toRad(x)),
        (x: number) => fromRad(Math.asin(x)),
        (x: number) => fromRad(Math.acos(x)),
        (x: number) => fromRad(Math.atan(x)),
        Math.sinh, Math.cosh, Math.tanh,
        Math.asinh, Math.acosh, Math.atanh,
        Math.floor, Math.ceil, Math.round, Math.sign, Math.trunc,
    ) as unknown

    if (typeof result !== 'number') throw new Error('Result is not a number')
    return result
}

// ─── Button type definitions ──────────────────────────────────────────────────
type BtnType = 'digit' | 'op' | 'equals' | 'clear' | 'clearEntry' | 'negate' | 'percent'
    | 'decimal' | 'paren' | 'sciFn' | 'angleToggle' | 'power' | 'constant' | 'nthRoot'

interface CalcButton {
    label: string
    type: BtnType
    value?: string   // raw string to insert into expression
    wide?: boolean   // double width
    color?: 'red' | 'teal' | 'navy' | 'operator' | 'sci'
}

const NORMAL_ROWS: CalcButton[][] = [
    [
        { label: 'C', type: 'clear', color: 'red' },
        { label: '±', type: 'negate' },
        { label: '%', type: 'percent' },
        { label: '÷', type: 'op', value: '/', color: 'operator' },
    ],
    [
        { label: '7', type: 'digit' },
        { label: '8', type: 'digit' },
        { label: '9', type: 'digit' },
        { label: '×', type: 'op', value: '*', color: 'operator' },
    ],
    [
        { label: '4', type: 'digit' },
        { label: '5', type: 'digit' },
        { label: '6', type: 'digit' },
        { label: '−', type: 'op', value: '-', color: 'operator' },
    ],
    [
        { label: '1', type: 'digit' },
        { label: '2', type: 'digit' },
        { label: '3', type: 'digit' },
        { label: '+', type: 'op', value: '+', color: 'operator' },
    ],
    [
        { label: '0', type: 'digit', wide: true },
        { label: '.', type: 'decimal' },
        { label: '=', type: 'equals', color: 'teal' },
    ],
]

// Scientific rows shown above the normal pad
const SCI_ROWS: CalcButton[][] = [
    [
        { label: 'DEG', type: 'angleToggle', color: 'navy' },
        { label: 'sin', type: 'sciFn', value: 'sin(' },
        { label: 'cos', type: 'sciFn', value: 'cos(' },
        { label: 'tan', type: 'sciFn', value: 'tan(' },
        { label: 'π', type: 'constant', value: 'π' },
    ],
    [
        { label: 'asin', type: 'sciFn', value: 'asin(' },
        { label: 'acos', type: 'sciFn', value: 'acos(' },
        { label: 'atan', type: 'sciFn', value: 'atan(' },
        { label: 'sinh', type: 'sciFn', value: 'sinh(' },
        { label: 'cosh', type: 'sciFn', value: 'cosh(' },
    ],
    [
        { label: 'tanh', type: 'sciFn', value: 'tanh(' },
        { label: '√', type: 'sciFn', value: 'sqrt(' },
        { label: 'ⁿ√', type: 'nthRoot', value: 'nthRoot' },
        { label: 'x²', type: 'power', value: '**2' },
        { label: 'x³', type: 'power', value: '**3' },
    ],
    [
        { label: 'log', type: 'sciFn', value: 'log(' },
        { label: 'ln', type: 'sciFn', value: 'ln(' },
        { label: 'log2', type: 'sciFn', value: 'log2(' },
        { label: '10ˣ', type: 'sciFn', value: '10**(' },
        { label: 'eˣ', type: 'sciFn', value: 'exp(' },
    ],
    [
        { label: '(', type: 'paren', value: '(' },
        { label: ')', type: 'paren', value: ')' },
        { label: '|x|', type: 'sciFn', value: 'abs(' },
        { label: 'n!', type: 'sciFn', value: 'fact(' },
        { label: '1/x', type: 'sciFn', value: '1/(' },
    ],
    [
        { label: 'E', type: 'constant', value: 'E' },
        { label: 'xⁿ', type: 'power', value: '**' },
        { label: 'log₂', type: 'sciFn', value: 'log2(' },
        { label: '⌊x⌋', type: 'sciFn', value: 'floor(' },
        { label: '⌈x⌉', type: 'sciFn', value: 'ceil(' },
    ],
]

// ─── Main Component ───────────────────────────────────────────────────────────
function CalculatorNode({ id, data }: CalcNodeProps) {
    const setNodes = useCanvasStore((s) => s.setNodes)
    const setEdges = useCanvasStore((s) => s.setEdges)
    const updateNodeData = useCanvasStore((s) => s.updateNodeData)
    const persistToLocalStorage = useCanvasStore((s) => s.persistToLocalStorage)

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isScientific, setIsScientific] = useState(data.isScientific ?? false)
    const [angleDeg, setAngleDeg] = useState(true)  // DEG=true, RAD=false

    // Expression state
    const [expr, setExpr] = useState('')           // expression being built
    const [display, setDisplay] = useState('0')    // main display (result or current number)
    const [afterEquals, setAfterEquals] = useState(false)
    const [hasError, setHasError] = useState(false)

    // History
    const [history, setHistory] = useState<CalcHistoryEntry[]>(loadHistory)
    const [showHistory, setShowHistory] = useState(false)
    const historyRef = useRef<HTMLDivElement>(null)

    // Nth root
    const [rootDeg, setRootDeg] = useState(4)
    const [showRootPrompt, setShowRootPrompt] = useState(false)

    // Close history panel on outside click
    useEffect(() => {
        if (!showHistory) return
        const handler = (e: MouseEvent) => {
            if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
                setShowHistory(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [showHistory])

    // Sync isScientific to node data when changed
    const toggleScientific = useCallback(() => {
        const next = !isScientific
        setIsScientific(next)
        updateNodeData(id, { isScientific: next })
        persistToLocalStorage()
    }, [isScientific, id, updateNodeData, persistToLocalStorage])

    // ── Calculator Logic ──────────────────────────────────────────────────────
    const addToExpr = useCallback((str: string) => {
        setExpr((prev) => {
            const next = afterEquals ? str : prev + str
            return next
        })
        setDisplay((prev) => afterEquals ? str : prev + str)
        if (afterEquals) setAfterEquals(false)
        setHasError(false)
    }, [afterEquals])

    const handleDigit = useCallback((d: string) => {
        if (hasError) { setExpr(d); setDisplay(d); setHasError(false); setAfterEquals(false); return }
        if (afterEquals) {
            setExpr(d); setDisplay(d); setAfterEquals(false)
        } else {
            setExpr((p) => p + d)
            setDisplay((p) => (p === '0' && d !== '.') ? d : p + d)
        }
    }, [hasError, afterEquals])

    const handleDecimal = useCallback(() => {
        if (hasError) { setExpr('.'); setDisplay('0.'); setHasError(false); setAfterEquals(false); return }
        if (afterEquals) {
            setExpr('0.'); setDisplay('0.'); setAfterEquals(false); return
        }
        // Only add decimal if current segment doesn't have one
        const parts = expr.split(/[+\-*/()]/)
        const lastPart = parts[parts.length - 1]
        if (lastPart.includes('.')) return
        setExpr((p) => p + '.')
        setDisplay((p) => {
            if (!p || p === '0' || /[+\-×÷*/]$/.test(p)) return p + '0.'
            return p + '.'
        })
    }, [hasError, afterEquals, expr])

    const handleOp = useCallback((op: string, _displayOp: string) => {
        if (hasError) return
        const base = afterEquals ? display : expr
        const cleanBase = base.trimEnd()
        // Replace trailing operator if present
        const newExpr = /[+\-*/]$/.test(cleanBase)
            ? cleanBase.slice(0, -1) + op
            : cleanBase + op
        setExpr(newExpr)
        setDisplay(newExpr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−'))
        setAfterEquals(false)
    }, [hasError, afterEquals, display, expr])

    const handleNegate = useCallback(() => {
        if (hasError) return
        try {
            const val = evaluateExpression(afterEquals ? display : expr, angleDeg)
            const negated = formatResult(-val)
            setExpr(negated)
            setDisplay(negated)
            setAfterEquals(false)
        } catch { /* ignore */ }
    }, [hasError, afterEquals, display, expr, angleDeg])

    const handlePercent = useCallback(() => {
        if (hasError) return
        try {
            const val = evaluateExpression(afterEquals ? display : expr, angleDeg)
            const pct = formatResult(val / 100)
            setExpr(pct)
            setDisplay(pct)
            setAfterEquals(false)
        } catch { /* ignore */ }
    }, [hasError, afterEquals, display, expr, angleDeg])

    const handleClear = useCallback(() => {
        setExpr('')
        setDisplay('0')
        setAfterEquals(false)
        setHasError(false)
    }, [])

    const handleClearEntry = useCallback(() => {
        if (hasError) { handleClear(); return }
        if (afterEquals) { setDisplay('0'); setExpr(''); setAfterEquals(false); return }
        setExpr((p) => {
            const next = p.slice(0, -1)
            setDisplay(next || '0')
            return next
        })
    }, [hasError, afterEquals, handleClear])

    const handleEquals = useCallback(() => {
        const exprToEval = afterEquals ? display : expr
        if (!exprToEval.trim()) return
        try {
            const result = evaluateExpression(exprToEval, angleDeg)
            const resultStr = formatResult(result)

            const entry: CalcHistoryEntry = {
                expression: exprToEval.trim(),
                result: resultStr,
                timestamp: Date.now(),
            }
            const newHistory = [entry, ...history].slice(0, MAX_HISTORY)
            setHistory(newHistory)
            saveHistory(newHistory)

            setDisplay(resultStr)
            setExpr(exprToEval)   // keep the expression visible in top line
            setAfterEquals(true)
            setHasError(false)

            updateNodeData(id, { lastResult: resultStr })
            persistToLocalStorage()
        } catch {
            setDisplay('Error')
            setHasError(true)
            setAfterEquals(false)
        }
    }, [afterEquals, display, expr, angleDeg, history, id, updateNodeData, persistToLocalStorage])

    const handleSciFn = useCallback((value: string) => {
        if (hasError) { setExpr(value); setDisplay(value); setHasError(false); setAfterEquals(false); return }
        if (afterEquals) {
            // Wrap last result in function call
            const wrapped = value + display + ')'
            setExpr(wrapped)
            setDisplay(wrapped)
            setAfterEquals(false)
        } else {
            setExpr((p) => p + value)
            setDisplay((p) => p + value)
        }
    }, [hasError, afterEquals, display])

    const handlePower = useCallback((value: string) => {
        // **2, **3, ** (for xⁿ)
        setExpr((p) => {
            const base = afterEquals ? display : p
            return base + value
        })
        setDisplay((p) => {
            const base = afterEquals ? display : p
            return base + value
        })
        if (afterEquals) setAfterEquals(false)
        setHasError(false)
    }, [afterEquals, display])

    const handleConstant = useCallback((value: string) => {
        if (hasError) { setExpr(value); setDisplay(value); setHasError(false); setAfterEquals(false); return }
        if (afterEquals) {
            setExpr(value); setDisplay(value); setAfterEquals(false)
        } else {
            setExpr((p) => p + value)
            setDisplay((p) => p + value)
        }
    }, [hasError, afterEquals])

    const handleParen = useCallback((p: string) => {
        addToExpr(p)
    }, [addToExpr])

    const confirmNthRoot = useCallback(() => {
        setShowRootPrompt(false)
        const n = Math.max(2, Math.floor(rootDeg || 4))
        if (n === 2) handleSciFn('sqrt(')
        else handlePower(`**(1/${n})`)
    }, [rootDeg, handleSciFn, handlePower])

    const handleDelete = useCallback(() => {
        if (!confirmDelete) { setConfirmDelete(true); return }
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
        persistToLocalStorage()
    }, [confirmDelete, id, setNodes, setEdges, persistToLocalStorage])


    // ── Render helper ─────────────────────────────────────────────────────────
    const getButtonStyle = (btn: CalcButton) => {
        const base = 'flex items-center justify-center rounded-lg text-xs font-semibold transition-all duration-100 active:scale-95 select-none cursor-pointer nodrag nopan'
        switch (btn.color) {
            case 'red':     return `${base} bg-red-50 text-red-600 hover:bg-red-100`
            case 'teal':    return `${base} text-white hover:brightness-110`
            case 'operator': return `${base} bg-blue-50 text-blue-700 hover:bg-blue-100`
            case 'navy':    return `${base} text-white hover:brightness-110`
            case 'sci':     return `${base} bg-slate-50 text-slate-700 hover:bg-slate-100`
            default:        return `${base} bg-gray-50 text-gray-700 hover:bg-gray-100`
        }
    }

    const handleButtonClick = useCallback((btn: CalcButton) => {
        switch (btn.type) {
            case 'digit':       handleDigit(btn.label); break
            case 'decimal':     handleDecimal(); break
            case 'op':          handleOp(btn.value!, btn.label); break
            case 'equals':      handleEquals(); break
            case 'clear':       handleClear(); break
            case 'clearEntry':  handleClearEntry(); break
            case 'negate':      handleNegate(); break
            case 'percent':     handlePercent(); break
            case 'paren':       handleParen(btn.value!); break
            case 'sciFn':       handleSciFn(btn.value!); break
            case 'power':       handlePower(btn.value!); break
            case 'constant':    handleConstant(btn.value!); break
            case 'angleToggle': setAngleDeg((d) => !d); break
            case 'nthRoot':     setShowRootPrompt(true); break
        }
    }, [handleDigit, handleDecimal, handleOp, handleEquals, handleClear, handleClearEntry,
        handleNegate, handlePercent, handleParen, handleSciFn, handlePower, handleConstant])

    // ── Display expression (convert operators to display symbols) ─────────────
    const exprDisplay = expr
        .replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−')
        .replace(/\bsin\(/g, 'sin(').replace(/\bcos\(/g, 'cos(').replace(/\btan\(/g, 'tan(')

    const NORMAL_WIDTH = 260
    const SCI_WIDTH = 320

    // ── Minimized view ────────────────────────────────────────────────────────
    if (data.isMinimized) {
        return (
            <div
                className="rounded-lg shadow-md border border-gray-200 bg-white"
                style={{ width: NORMAL_WIDTH, borderTop: '3px solid #2D9CDB' }}
            >
                <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#2D9CDB' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M9 7V4a1 1 0 011-1h5l4 4v3a1 1 0 01-1 1h-3M9 7h6" />
                        </svg>
                        <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: '#1E3A5F' }}>Calculator</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-sm font-mono font-semibold" style={{ color: '#1E3A5F' }}>
                            {data.lastResult ?? display}
                        </span>
                        <button
                            onClick={() => { updateNodeData(id, { isMinimized: false }); persistToLocalStorage() }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </div>
                <Handle type="source" position={Position.Top} id="top" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
                <Handle type="source" position={Position.Bottom} id="bottom" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
                <Handle type="source" position={Position.Left} id="left" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
                <Handle type="source" position={Position.Right} id="right" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
            </div>
        )
    }

    const nodeWidth = isScientific ? SCI_WIDTH : NORMAL_WIDTH

    return (
        <div
            className="rounded-xl shadow-lg border border-gray-200 bg-white flex flex-col"
            style={{ width: nodeWidth, borderTop: '3px solid #2D9CDB', userSelect: 'none', overflow: 'visible' }}
        >
            {/* ── Toolbar ── */}
            <div
                className="flex items-center justify-between px-2 py-1.5 shrink-0 rounded-t-xl"
                style={{ backgroundColor: '#1E3A5F' }}
            >
                {/* Left: icon + label + mode toggle */}
                <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-white opacity-80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M9 7V4a1 1 0 011-1h5l4 4v3a1 1 0 01-1 1h-3M9 7h6" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-widest text-white uppercase opacity-90">Calc</span>
                    <div className="w-px h-3 bg-white/20 mx-0.5" />
                    {/* Mode toggle */}
                    <button
                        onClick={toggleScientific}
                        className="nodrag nopan flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide transition-all"
                        style={{
                            backgroundColor: isScientific ? '#2D9CDB' : 'rgba(255,255,255,0.15)',
                            color: 'white',
                        }}
                        title={isScientific ? 'Switch to Normal mode' : 'Switch to Scientific mode'}
                    >
                        {isScientific ? 'SCI' : 'NORM'}
                    </button>
                </div>

                {/* Right: history, pin, delete, minimize */}
                <div className="flex items-center gap-0.5">
                    {/* History button */}
                    <div ref={historyRef} className="relative">
                        <button
                            onClick={() => setShowHistory((v) => !v)}
                            className="nodrag nopan p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Calculation history"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                        {/* History dropdown */}
                        {showHistory && (
                            <div
                                className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-gray-200 shadow-2xl overflow-hidden nodrag nopan"
                                style={{ width: 240, backgroundColor: '#fff', maxHeight: 300 }}
                            >
                                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                                    <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: '#1E3A5F' }}>History</span>
                                    {history.length > 0 && (
                                        <button
                                            onClick={() => { const cleared: CalcHistoryEntry[] = []; setHistory(cleared); saveHistory(cleared) }}
                                            className="text-[9px] text-red-400 hover:text-red-600 transition-colors"
                                        >
                                            Clear all
                                        </button>
                                    )}
                                </div>
                                <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                                    {history.length === 0 ? (
                                        <p className="px-3 py-4 text-[10px] text-gray-400 text-center">No calculations yet</p>
                                    ) : (
                                        history.map((entry, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setDisplay(entry.result)
                                                    setExpr(entry.expression)
                                                    setAfterEquals(true)
                                                    setHasError(false)
                                                    setShowHistory(false)
                                                }}
                                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                                            >
                                                <div className="text-[9px] text-gray-400 truncate font-mono">{entry.expression}</div>
                                                <div className="text-[11px] font-semibold font-mono" style={{ color: '#2D9CDB' }}>= {entry.result}</div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pin */}
                    <button
                        title={data.isPinned ? 'Unpin from all pages' : 'Pin to all pages'}
                        onClick={() => { updateNodeData(id, { isPinned: !data.isPinned }); persistToLocalStorage() }}
                        className={`nodrag nopan p-1 rounded-md transition-colors ${data.isPinned ? 'text-cyan-300 bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={data.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                            <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4L15 4.5z" />
                            <path d="M9 15l-4.5 4.5" /><path d="M14.5 9l1 1" />
                        </svg>
                    </button>

                    {/* Delete */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-0.5" onMouseLeave={() => setConfirmDelete(false)}>
                            <span className="text-[9px] text-red-300 font-semibold whitespace-nowrap">Delete?</span>
                            <button onClick={handleDelete} className="nodrag nopan p-1 text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <button onClick={() => setConfirmDelete(false)} className="nodrag nopan p-1 text-white/60 hover:text-white rounded-md hover:bg-white/10 transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleDelete} className="nodrag nopan p-1 text-white/50 hover:text-red-300 rounded-md hover:bg-white/10 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}

                    {/* Minimize */}
                    <button
                        onClick={() => { updateNodeData(id, { isMinimized: true }); persistToLocalStorage() }}
                        className="nodrag nopan p-1 text-white/50 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                        title="Minimize"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Display ── */}
            <div className="px-3 pt-2 pb-1" style={{ backgroundColor: '#F0F4F8' }}>
                {/* Expression line */}
                <div className="text-right min-h-[16px] text-[10px] text-gray-400 font-mono truncate">
                    {exprDisplay || '\u00A0'}
                </div>
                {/* Main display */}
                <div
                    className="text-right font-mono font-semibold overflow-hidden text-ellipsis"
                    style={{
                        fontSize: display.length > 14 ? '14px' : display.length > 10 ? '18px' : '24px',
                        color: hasError ? '#EB5757' : '#1E3A5F',
                        lineHeight: 1.2,
                        paddingBottom: 6,
                    }}
                >
                    {display}
                </div>
            </div>

            {/* ── Nth-root degree prompt ── */}
            {isScientific && showRootPrompt && (
                <div className="px-2 py-1.5 flex items-center gap-1.5 nodrag nopan bg-blue-50 border-b border-blue-200">
                    <span className="text-[10px] font-semibold text-primary-700">Root degree:</span>
                    <input
                        type="number"
                        min={2}
                        max={99}
                        value={rootDeg}
                        title="Root degree"
                        aria-label="Root degree"
                        onChange={(e) => setRootDeg(Math.max(2, parseInt(e.target.value) || 4))}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmNthRoot(); if (e.key === 'Escape') setShowRootPrompt(false) }}
                        className="w-12 text-center text-xs font-mono border border-blue-300 rounded px-1 py-0.5 nodrag nopan text-primary-700"
                        autoFocus
                    />
                    <button type="button" onClick={confirmNthRoot} className="nodrag nopan px-2 py-0.5 text-[10px] font-bold rounded text-white bg-secondary-500 hover:bg-secondary-600">√</button>
                    <button type="button" onClick={() => setShowRootPrompt(false)} className="nodrag nopan text-[10px] text-gray-400 hover:text-gray-600 px-1">✕</button>
                </div>
            )}

            {/* ── Scientific rows ── */}
            {isScientific && (
                <div className="px-1.5 pt-1.5 pb-0" style={{ backgroundColor: '#F8FAFB' }}>
                    <div className="grid grid-cols-5 gap-1">
                        {SCI_ROWS.flat().map((btn, i) => {
                            const label = btn.type === 'angleToggle' ? (angleDeg ? 'DEG' : 'RAD') : btn.type === 'nthRoot' ? `${rootDeg}√` : btn.label
                            const sciClass = 'flex items-center justify-center rounded-md text-[10px] font-semibold transition-all duration-100 active:scale-95 select-none cursor-pointer nodrag nopan py-1.5'
                            let btnStyle: CSSProperties = {}
                            let cls = sciClass
                            if (btn.type === 'angleToggle') {
                                cls += ' text-white'
                                btnStyle = { backgroundColor: angleDeg ? '#1E3A5F' : '#2D9CDB' }
                            } else if (btn.color === 'navy') {
                                cls += ' text-white'
                                btnStyle = { backgroundColor: '#1E3A5F' }
                            } else {
                                cls += ' bg-blue-50 text-blue-800 hover:bg-blue-100'
                            }
                            return (
                                <button
                                    key={i}
                                    className={cls}
                                    style={btnStyle}
                                    onClick={() => handleButtonClick(btn)}
                                    title={btn.value ?? btn.label}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                    <div className="h-px bg-gray-200 mx-0 mt-1.5" />
                </div>
            )}

            {/* ── Standard button pad ── */}
            <div className="p-1.5 rounded-b-xl overflow-hidden" style={{ backgroundColor: '#F8FAFB' }}>
                {NORMAL_ROWS.map((row, ri) => (
                    <div key={ri} className="flex gap-1 mb-1 last:mb-0">
                        {row.map((btn, bi) => {
                            const isWide = btn.wide
                            const isTeal = btn.color === 'teal'
                            const baseH = 'h-10'
                            const cls = `${getButtonStyle(btn)} ${baseH} ${isWide ? 'flex-[2]' : 'flex-1'}`
                            const style: CSSProperties = isTeal ? { backgroundColor: '#2D9CDB' } : {}
                            return (
                                <button
                                    key={bi}
                                    className={cls}
                                    style={style}
                                    onClick={() => handleButtonClick(btn)}
                                >
                                    {btn.label}
                                </button>
                            )
                        })}
                    </div>
                ))}
            </div>

            {/* ── ReactFlow Handles ── */}
            <Handle type="source" position={Position.Top} id="top" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
            <Handle type="source" position={Position.Left} id="left" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
            <Handle type="source" position={Position.Right} id="right" className="!w-2.5 !h-2.5 !border-2 !border-white" style={{ backgroundColor: '#2D9CDB' }} />
        </div>
    )
}

export default memo(CalculatorNode)
