import {
    Document,
    Page,
    Text,
    View,
    Image,
    StyleSheet,
    Font,
    type Styles,
} from '@react-pdf/renderer'

type PDFStyle = Styles[string]
import type { QANode, PageQuizEntry } from '../utils/buildQATree'
import type { ChatMessage, QuizQuestionNodeData } from '../types'

// ─── Extra data types for enriched PDF export ────────────────────────────────

export interface StickyNoteEntry {
    content: string
    color: string
    pageIndex?: number
}

export interface CustomPromptEntry {
    chatHistory: ChatMessage[]
    pageIndex?: number
}

export interface ImageEntry {
    imageDataUrl: string
    imageName: string
    pageIndex?: number
}

export interface SummaryEntry {
    summary: string
    sourcePage: number
}

// Use only built-in fonts — no network requests, instant render
Font.registerHyphenationCallback((w) => [w])

// ─── Palette ────────────────────────────────────────────────────────────────
// Aligned with Tailwind config - StudyCanvas Minimalist Palette
const C = {
    text: '#1E3A5F',        // primary-500 (Deep Navy)
    muted: '#6B7280',       // neutral-400 (Slate)
    accent: '#1E3A5F',      // primary-500
    teal: '#2D9CDB',        // secondary-500 (Soft Teal)
    blue: '#2D9CDB',        // secondary-500
    childAccent: '#2D9CDB', // secondary-500
    quoteText: '#1E3A5F',   // primary-500
    quoteBg: '#E8EEF4',     // primary-50
    quoteBorder: '#A3BBD3', // primary-200
    divider: '#D1D5DB',     // gray-200
    white: '#ffffff',
    coverBg: '#E8EEF4',     // primary-50
    tagBg: '#E6F4FA',       // secondary-50
    tagText: '#1E3A5F',     // primary-500
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        backgroundColor: C.white,
        paddingTop: 54,
        paddingBottom: 48,
        paddingHorizontal: 48,
        fontSize: 10,
        color: C.text,
        lineHeight: 1.55,
    },

    // ── fixed header/footer ──
    pageHeader: {
        position: 'absolute',
        top: 18,
        left: 48,
        right: 48,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 0.5,
        borderBottomColor: C.divider,
        paddingBottom: 6,
    },
    pageHeaderLeft: {
        fontSize: 8,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    pageHeaderRight: {
        fontSize: 8,
        color: C.muted,
    },
    pageFooter: {
        position: 'absolute',
        bottom: 18,
        left: 48,
        right: 48,
        textAlign: 'center',
        fontSize: 8,
        color: C.muted,
        borderTopWidth: 0.5,
        borderTopColor: C.divider,
        paddingTop: 6,
    },

    // ── cover section ──
    coverSection: {
        marginBottom: 28,
        paddingBottom: 20,
        borderBottomWidth: 1.5,
        borderBottomColor: C.accent,
    },
    coverTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 28,
        fontWeight: 'bold' as const,
        color: C.accent,
        paddingVertical: 8,
        lineHeight: 1.4,
    },
    coverSubtitle: {
        fontSize: 14,
        color: C.text,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 4,
    },
    coverMeta: {
        fontSize: 9,
        color: C.muted,
    },
    coverTagRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 8,
    },
    coverTag: {
        backgroundColor: C.tagBg,
        color: C.tagText,
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },

    // ── Q&A blocks ──
    qaBlock: {
        marginBottom: 20,
    },
    qaDivider: {
        height: 0.5,
        backgroundColor: C.divider,
        marginBottom: 14,
    },
    qaIndex: {
        fontSize: 8,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 6,
    },

    // ── quoted highlight ──
    quoteBlock: {
        backgroundColor: C.quoteBg,
        borderLeftWidth: 3,
        borderLeftColor: C.quoteBorder,
        paddingHorizontal: 10,
        paddingVertical: 7,
        marginBottom: 10,
        borderRadius: 3,
    },
    quoteLabel: {
        fontSize: 7.5,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 3,
    },
    quoteText: {
        fontSize: 9.5,
        color: C.quoteText,
        fontFamily: 'Helvetica-Oblique',
        lineHeight: 1.5,
    },

    // ── question row ──
    questionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
        gap: 8,
    },
    questionLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.accent,
        minWidth: 18,
        paddingTop: 0.5,
    },
    questionText: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.text,
        flex: 1,
        lineHeight: 1.5,
    },

    // ── answer ──
    answerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
        gap: 8,
    },
    answerLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.teal,
        minWidth: 18,
        paddingTop: 0.5,
    },
    answerBody: {
        flex: 1,
    },

    // ── follow-ups (in-node chatHistory) ──
    followUpSection: {
        marginTop: 8,
        marginLeft: 24,
        borderLeftWidth: 2,
        borderLeftColor: '#A3BBD3',
        paddingLeft: 10,
    },
    followUpHeader: {
        fontSize: 7.5,
        color: C.blue,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    followUpQRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
        gap: 6,
    },
    followUpQLabel: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: C.blue,
        minWidth: 20,
    },
    followUpQText: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: C.text,
        flex: 1,
        lineHeight: 1.45,
    },
    followUpARow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
        gap: 6,
    },
    followUpALabel: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: C.teal,
        minWidth: 20,
    },
    followUpABody: {
        flex: 1,
    },

    // ── child branch nodes ──
    childBlock: {
        marginTop: 10,
        marginLeft: 20,
        borderLeftWidth: 2,
        borderLeftColor: '#A3BBD3',
        paddingLeft: 12,
        paddingTop: 8,
        paddingBottom: 4,
        backgroundColor: '#E8EEF4',
        borderRadius: 4,
    },
    childLabel: {
        fontSize: 7.5,
        color: C.childAccent,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    childQRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
        gap: 6,
    },
    childQLabel: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: C.childAccent,
        minWidth: 18,
    },
    childQText: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: C.text,
        flex: 1,
        lineHeight: 1.45,
    },
    childALabel: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: C.teal,
        minWidth: 18,
    },
    childARow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
        gap: 6,
    },
    childABody: {
        flex: 1,
    },

    // ── quiz section ──
    quizSectionHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 13,
        color: C.accent,
        marginBottom: 10,
        marginTop: 16,
        paddingBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: '#A3BBD3',
    },
    quizPageHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10,
        color: C.accent,
        marginBottom: 6,
        marginTop: 10,
        letterSpacing: 0.6,
        textTransform: 'uppercase' as const,
    },
    quizBlock: {
        marginBottom: 14,
        paddingLeft: 0,
    },
    quizQRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 5,
        gap: 6,
    },
    quizQLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.accent,
        minWidth: 22,
    },
    quizQText: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.text,
        flex: 1,
        lineHeight: 1.5,
    },
    quizAnswerBlock: {
        marginLeft: 22,
        marginBottom: 4,
        backgroundColor: '#E8EEF4',
        borderLeftWidth: 3,
        borderLeftColor: C.teal,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 3,
    },
    quizAnswerLabel: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: C.accent,
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
        marginBottom: 3,
    },
    quizAnswerText: {
        fontSize: 9.5,
        color: C.text,
        lineHeight: 1.5,
    },
    quizFeedbackBlock: {
        marginLeft: 22,
        marginBottom: 4,
        backgroundColor: '#E8EEF4',
        borderLeftWidth: 3,
        borderLeftColor: C.teal,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 3,
    },
    quizFeedbackBlockCorrect: {
        marginLeft: 22,
        marginBottom: 4,
        backgroundColor: '#E8F5EC',
        borderLeftWidth: 3,
        borderLeftColor: '#27AE60',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 3,
    },
    quizFeedbackBlockIncorrect: {
        marginLeft: 22,
        marginBottom: 4,
        backgroundColor: '#FCEEEE',
        borderLeftWidth: 3,
        borderLeftColor: '#EB5757',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 3,
    },
    quizFeedbackLabel: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: C.accent,
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
        marginBottom: 3,
    },
    quizFeedbackLabelCorrect: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: '#27AE60',
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
        marginBottom: 3,
    },
    quizFeedbackLabelIncorrect: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: '#EB5757',
        letterSpacing: 0.5,
        textTransform: 'uppercase' as const,
        marginBottom: 3,
    },
    quizFeedbackText: {
        fontSize: 9.5,
        color: C.text,
        lineHeight: 1.5,
    },
    quizNoAnswer: {
        marginLeft: 22,
        fontSize: 9,
        color: C.muted,
        fontFamily: 'Helvetica-Oblique',
        marginBottom: 4,
    },

    // ── paragraph text ──
    para: {
        fontSize: 10,
        color: C.text,
        lineHeight: 1.6,
        marginBottom: 4,
    },
    paraBold: {
        fontFamily: 'Helvetica-Bold',
    },
    paraItalic: {
        fontFamily: 'Helvetica-Oblique',
    },
    smallPara: {
        fontSize: 9,
        color: C.text,
        lineHeight: 1.55,
        marginBottom: 3,
    },
    bullet: {
        fontSize: 10,
        color: C.text,
        lineHeight: 1.55,
        marginBottom: 2,
        marginLeft: 6,
    },
    smallBullet: {
        fontSize: 9,
        color: C.text,
        lineHeight: 1.55,
        marginBottom: 2,
        marginLeft: 6,
    },
    heading1: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 12,
        color: C.text,
        marginBottom: 5,
        marginTop: 4,
    },
    heading2: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 11,
        color: C.text,
        marginBottom: 4,
        marginTop: 3,
    },
    heading3: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10.5,
        color: C.text,
        marginBottom: 3,
        marginTop: 2,
    },

    // ── sticky notes ──
    notesSectionHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 13,
        color: C.accent,
        marginBottom: 10,
        marginTop: 16,
        paddingBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: '#A3BBD3',
    },
    noteBlock: {
        marginBottom: 12,
        borderLeftWidth: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 3,
    },
    notePageLabel: {
        fontSize: 7.5,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase' as const,
        marginBottom: 4,
    },
    noteContent: {
        fontSize: 10,
        color: C.text,
        lineHeight: 1.55,
    },

    // ── custom prompts / AI chat ──
    promptSectionHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 13,
        color: '#4338CA', // indigo accent
        marginBottom: 10,
        marginTop: 16,
        paddingBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: '#A3BBD3',
    },
    promptBlock: {
        marginBottom: 16,
    },
    promptDivider: {
        height: 0.5,
        backgroundColor: C.divider,
        marginBottom: 10,
    },
    promptIndex: {
        fontSize: 8,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.8,
        textTransform: 'uppercase' as const,
        marginBottom: 6,
    },
    promptUserRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
        gap: 8,
    },
    promptUserLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: '#4338CA',
        minWidth: 22,
        paddingTop: 0.5,
    },
    promptUserText: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.text,
        flex: 1,
        lineHeight: 1.5,
    },
    promptAiRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
        gap: 8,
    },
    promptAiLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: C.teal,
        minWidth: 22,
        paddingTop: 0.5,
    },
    promptAiBody: {
        flex: 1,
    },

    // ── images section ──
    imagesSectionHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 13,
        color: C.accent,
        marginBottom: 10,
        marginTop: 16,
        paddingBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: '#A3BBD3',
    },
    imageBlock: {
        marginBottom: 16,
    },
    imageLabel: {
        fontSize: 8,
        color: C.muted,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    imageElement: {
        maxWidth: 460,
        maxHeight: 500,
        objectFit: 'contain' as const,
    },

    // ── summary section ──
    summarySectionHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 13,
        color: C.accent,
        marginBottom: 10,
        marginTop: 16,
        paddingBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: '#A3BBD3',
    },
    summaryBlock: {
        marginBottom: 14,
        backgroundColor: '#E8EEF4',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: C.accent,
    },
    summaryPageLabel: {
        fontSize: 8,
        color: C.accent,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.6,
        textTransform: 'uppercase' as const,
        marginBottom: 6,
    },
})

// ─── Markdown → PDF helpers ──────────────────────────────────────────────────

type TextSegment = { text: string; bold?: boolean; italic?: boolean }

/** Parse inline **bold**, *italic*, `code` from a single line of text */
function parseInline(line: string): TextSegment[] {
    const segments: TextSegment[] = []
    // Match **bold**, *italic*, `code`
    const rx = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g
    let last = 0
    let m: RegExpExecArray | null

    // eslint-disable-next-line no-cond-assign
    while ((m = rx.exec(line)) !== null) {
        if (m.index > last) segments.push({ text: line.slice(last, m.index) })
        const raw = m[0]
        if (raw.startsWith('**')) {
            segments.push({ text: raw.slice(2, -2), bold: true })
        } else if (raw.startsWith('*')) {
            segments.push({ text: raw.slice(1, -1), italic: true })
        } else {
            // backtick code — render as slightly muted
            segments.push({ text: raw.slice(1, -1) })
        }
        last = m.index + raw.length
    }
    if (last < line.length) segments.push({ text: line.slice(last) })
    return segments
}

/** Render inline-parsed segments as nested <Text> inside a parent <Text> */
function InlineText({
    segments,
    style,
}: {
    segments: TextSegment[]
    style?: PDFStyle | PDFStyle[]
}) {
    return (
        <Text style={style}>
            {segments.map((seg, i) => (
                <Text
                    key={i}
                    style={
                        seg.bold
                            ? s.paraBold
                            : seg.italic
                            ? s.paraItalic
                            : undefined
                    }
                >
                    {seg.text}
                </Text>
            ))}
        </Text>
    )
}

/** Render a full markdown string as a series of PDF views/paragraphs */
function MarkdownBody({
    text,
    small = false,
}: {
    text: string
    small?: boolean
}) {
    const lines = text.split('\n')
    const elements: React.ReactElement[] = []
    let inCodeBlock = false

    lines.forEach((rawLine, idx) => {
        const line = rawLine

        // Code fences
        if (line.trimStart().startsWith('```')) {
            inCodeBlock = !inCodeBlock
            return
        }
        if (inCodeBlock) {
            elements.push(
                <Text key={idx} style={[small ? s.smallPara : s.para, { fontFamily: 'Courier', color: C.text }]}>
                    {'  ' + line}
                </Text>
            )
            return
        }

        // Blank lines → small spacer
        if (line.trim() === '') {
            elements.push(<View key={idx} style={{ height: 4 }} />)
            return
        }

        // Headings
        const h3 = line.match(/^###\s+(.+)/)
        if (h3) {
            elements.push(<Text key={idx} style={s.heading3}>{h3[1]}</Text>)
            return
        }
        const h2 = line.match(/^##\s+(.+)/)
        if (h2) {
            elements.push(<Text key={idx} style={s.heading2}>{h2[1]}</Text>)
            return
        }
        const h1 = line.match(/^#\s+(.+)/)
        if (h1) {
            elements.push(<Text key={idx} style={s.heading1}>{h1[1]}</Text>)
            return
        }

        // Bullet list items: - text or * text
        const bullet = line.match(/^[\s]*[-*]\s+(.+)/)
        if (bullet) {
            const segs = parseInline(bullet[1])
            elements.push(
                <InlineText
                    key={idx}
                    segments={[{ text: '• ' }, ...segs]}
                    style={small ? s.smallBullet : s.bullet}
                />
            )
            return
        }

        // Numbered list items: 1. text
        const numbered = line.match(/^(\d+)\.\s+(.+)/)
        if (numbered) {
            const segs = parseInline(numbered[2])
            elements.push(
                <InlineText
                    key={idx}
                    segments={[{ text: `${numbered[1]}. ` }, ...segs]}
                    style={small ? s.smallPara : s.para}
                />
            )
            return
        }

        // Regular paragraph
        const segs = parseInline(line)
        elements.push(
            <InlineText key={idx} segments={segs} style={small ? s.smallPara : s.para} />
        )
    })

    return <View>{elements}</View>
}

// ─── Follow-up thread rendering ──────────────────────────────────────────────

function FollowUpSection({ chatHistory }: { chatHistory: ChatMessage[] }) {
    if (!chatHistory || chatHistory.length === 0) return null
    // chatHistory alternates user/model
    const pairs: Array<{ q: string; a: string }> = []
    for (let i = 0; i < chatHistory.length - 1; i += 2) {
        if (chatHistory[i].role === 'user' && chatHistory[i + 1]?.role === 'model') {
            pairs.push({ q: chatHistory[i].content, a: chatHistory[i + 1].content })
        }
    }
    if (pairs.length === 0) return null

    return (
        <View style={s.followUpSection}>
            <Text style={s.followUpHeader}>
                ↳ Follow-up Questions ({pairs.length})
            </Text>
            {pairs.map((pair, idx) => (
                <View key={idx}>
                    <View style={s.followUpQRow}>
                        <Text style={s.followUpQLabel}>Q{idx + 1}.</Text>
                        <Text style={s.followUpQText}>{pair.q}</Text>
                    </View>
                    <View style={s.followUpARow}>
                        <Text style={s.followUpALabel}>A{idx + 1}.</Text>
                        <View style={s.followUpABody}>
                            <MarkdownBody text={pair.a} small />
                        </View>
                    </View>
                </View>
            ))}
        </View>
    )
}

// ─── Single child Q&A block ───────────────────────────────────────────────────

function ChildQABlock({ node, depth = 0 }: { node: QANode; depth?: number }) {
    return (
        <View style={s.childBlock}>
            <Text style={s.childLabel}>↳ Follow-on Question</Text>

            {node.highlightedText?.trim() && (
                <View style={[s.quoteBlock, { marginBottom: 8 }]}>
                    <Text style={s.quoteLabel}>Selected context</Text>
                    <Text style={s.quoteText}>{node.highlightedText}</Text>
                </View>
            )}

            <View style={s.childQRow}>
                <Text style={s.childQLabel}>Q.</Text>
                <Text style={s.childQText}>{node.question}</Text>
            </View>
            <View style={s.childARow}>
                <Text style={s.childALabel}>A.</Text>
                <View style={s.childABody}>
                    <MarkdownBody text={node.answer} small />
                </View>
            </View>

            {node.chatHistory.length > 0 && (
                <FollowUpSection chatHistory={node.chatHistory} />
            )}

            {/* Recursively render child-of-child nodes (capped at depth 2 for readability) */}
            {depth < 2 && node.children.map((child) => (
                <ChildQABlock key={child.id} node={child} depth={depth + 1} />
            ))}
        </View>
    )
}

// ─── Root Q&A block ──────────────────────────────────────────────────────────

function RootQABlock({ node, index }: { node: QANode; index: number }) {
    return (
        // wrap=true (default) so long answers can flow onto the next page
        <View style={s.qaBlock}>
            {/* Keep the divider + index label + context quote + question pinned together */}
            <View wrap={false}>
                <View style={s.qaDivider} />
                <Text style={s.qaIndex}>Question {index + 1}</Text>

                {node.highlightedText?.trim() && (
                    <View style={s.quoteBlock}>
                        <Text style={s.quoteLabel}>Context from document</Text>
                        <Text style={s.quoteText}>{node.highlightedText}</Text>
                    </View>
                )}

                <View style={s.questionRow}>
                    <Text style={s.questionLabel}>Q.</Text>
                    <Text style={s.questionText}>{node.question}</Text>
                </View>
            </View>

            {/* Answer and follow-ons are free to break across pages */}
            <View style={s.answerRow}>
                <Text style={s.answerLabel}>A.</Text>
                <View style={s.answerBody}>
                    <MarkdownBody text={node.answer} />
                </View>
            </View>

            {node.chatHistory.length > 0 && (
                <FollowUpSection chatHistory={node.chatHistory} />
            )}

            {node.children.map((child) => (
                <ChildQABlock key={child.id} node={child} />
            ))}
        </View>
    )
}

// ─── Quiz Page Section ───────────────────────────────────────────────────────

function QuizQuestionBlock({ q, idx }: { q: QuizQuestionNodeData; idx: number }) {
    const followUpPairs: Array<{ question: string; answer: string }> = []
    const history = q.chatHistory ?? []
    for (let i = 0; i < history.length - 1; i += 2) {
        if (history[i].role === 'user' && history[i + 1]?.role === 'model') {
            followUpPairs.push({ question: history[i].content, answer: history[i + 1].content })
        }
    }

    // Derive verdict from feedback text (same logic as in QuizQuestionNode)
    const verdict: 'correct' | 'partial' | 'incorrect' | null = q.feedback
        ? (() => {
            const lower = q.feedback.toLowerCase()
            if (/\bpartially correct\b/.test(lower)) return 'partial'
            if (/\bincorrect\b|\bwrong\b|\bnot correct\b/.test(lower)) return 'incorrect'
            if (/\bcorrect\b/.test(lower)) return 'correct'
            return null
        })()
        : null

    const feedbackBlockStyle =
        verdict === 'correct' ? s.quizFeedbackBlockCorrect
        : verdict === 'incorrect' ? s.quizFeedbackBlockIncorrect
        : s.quizFeedbackBlock

    const feedbackLabelStyle =
        verdict === 'correct' ? s.quizFeedbackLabelCorrect
        : verdict === 'incorrect' ? s.quizFeedbackLabelIncorrect
        : s.quizFeedbackLabel

    const feedbackLabelText =
        verdict === 'correct' ? 'Correct'
        : verdict === 'incorrect' ? 'Incorrect'
        : verdict === 'partial' ? 'Partially Correct'
        : 'Gemini Feedback'

    return (
        <View style={s.quizBlock}>
            <View style={s.quizQRow}>
                <Text style={s.quizQLabel}>Q{idx + 1}.</Text>
                <Text style={s.quizQText}>{q.question}</Text>
            </View>

            {q.userAnswer ? (
                <View style={s.quizAnswerBlock}>
                    <Text style={s.quizAnswerLabel}>Your Answer</Text>
                    <Text style={s.quizAnswerText}>{q.userAnswer}</Text>
                </View>
            ) : (
                <Text style={s.quizNoAnswer}>— Not answered</Text>
            )}

            {q.feedback ? (
                <View style={feedbackBlockStyle}>
                    <Text style={feedbackLabelStyle}>{feedbackLabelText}</Text>
                    <Text style={s.quizFeedbackText}>{q.feedback}</Text>
                </View>
            ) : null}

            {followUpPairs.length > 0 && (
                <View style={[s.followUpSection, { marginLeft: 22 }]}>
                    <Text style={s.followUpHeader}>↳ Follow-up Questions ({followUpPairs.length})</Text>
                    {followUpPairs.map((pair, fIdx) => (
                        <View key={fIdx}>
                            <View style={s.followUpQRow}>
                                <Text style={s.followUpQLabel}>Q{fIdx + 1}.</Text>
                                <Text style={s.followUpQText}>{pair.question}</Text>
                            </View>
                            <View style={s.followUpARow}>
                                <Text style={s.followUpALabel}>A{fIdx + 1}.</Text>
                                <View style={s.followUpABody}>
                                    <MarkdownBody text={pair.answer} small />
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

function QuizSection({ pageQuizzes }: { pageQuizzes: PageQuizEntry[] }) {
    if (!pageQuizzes || pageQuizzes.length === 0) return null
    return (
        <View>
            <Text style={s.quizSectionHeader}>Page Quizzes</Text>
            {pageQuizzes.map((entry) => (
                <View key={entry.pageIndex}>
                    <Text style={s.quizPageHeader}>Page {entry.pageIndex} Quiz</Text>
                    {entry.questions.map((q, idx) => (
                        <QuizQuestionBlock key={q.questionNumber} q={q} idx={idx} />
                    ))}
                </View>
            ))}
        </View>
    )
}

// ─── Sticky Notes Section ────────────────────────────────────────────────────

function StickyNotesSection({ notes }: { notes: StickyNoteEntry[] }) {
    if (!notes || notes.length === 0) return null

    // Color map for left-border tones
    const borderColor = (hex: string) => {
        const map: Record<string, string> = {
            '#FFF9C4': '#F9A825', // yellow
            '#FFCDD2': '#E57373', // pink
            '#C8E6C9': '#66BB6A', // green
            '#BBDEFB': '#42A5F5', // blue
            '#E1BEE7': '#AB47BC', // purple
            '#FFE0B2': '#FFA726', // orange
        }
        return map[hex] ?? '#A3BBD3'
    }

    return (
        <View>
            <Text style={s.notesSectionHeader}>Notes</Text>
            {notes.map((note, idx) => (
                <View
                    key={idx}
                    style={[
                        s.noteBlock,
                        {
                            borderLeftColor: borderColor(note.color),
                            backgroundColor: note.color + '66',
                        },
                    ]}
                >
                    {note.pageIndex && (
                        <Text style={s.notePageLabel}>Page {note.pageIndex}</Text>
                    )}
                    <Text style={s.noteContent}>{note.content || '(empty note)'}</Text>
                </View>
            ))}
        </View>
    )
}

// ─── Custom Prompts / AI Chat Section ────────────────────────────────────────

function CustomPromptsSection({ prompts }: { prompts: CustomPromptEntry[] }) {
    if (!prompts || prompts.length === 0) return null

    return (
        <View>
            <Text style={s.promptSectionHeader}>AI Conversations</Text>
            {prompts.map((prompt, pIdx) => {
                // Build Q/A pairs from chat history
                const pairs: Array<{ q: string; a: string }> = []
                const history = prompt.chatHistory ?? []
                for (let i = 0; i < history.length; i++) {
                    if (history[i].role === 'user') {
                        const answer = history[i + 1]?.role === 'model' ? history[i + 1].content : ''
                        pairs.push({ q: history[i].content, a: answer })
                        if (answer) i++ // skip the model message
                    }
                }
                if (pairs.length === 0) return null

                return (
                    <View key={pIdx} style={s.promptBlock}>
                        <View style={s.promptDivider} />
                        <Text style={s.promptIndex}>
                            AI Chat {pIdx + 1}{prompt.pageIndex ? ` — Page ${prompt.pageIndex}` : ''}
                        </Text>
                        {pairs.map((pair, qIdx) => (
                            <View key={qIdx}>
                                <View style={s.promptUserRow}>
                                    <Text style={s.promptUserLabel}>Q{qIdx + 1}.</Text>
                                    <Text style={s.promptUserText}>{pair.q}</Text>
                                </View>
                                {pair.a ? (
                                    <View style={s.promptAiRow}>
                                        <Text style={s.promptAiLabel}>AI.</Text>
                                        <View style={s.promptAiBody}>
                                            <MarkdownBody text={pair.a} />
                                        </View>
                                    </View>
                                ) : null}
                            </View>
                        ))}
                    </View>
                )
            })}
        </View>
    )
}

// ─── Images Section ──────────────────────────────────────────────────────────

function ImagesSection({ images }: { images: ImageEntry[] }) {
    if (!images || images.length === 0) return null
    return (
        <View>
            <Text style={s.imagesSectionHeader}>Uploaded Images</Text>
            {images.map((img, idx) => (
                <View key={idx} style={s.imageBlock} wrap={false}>
                    <Text style={s.imageLabel}>
                        {img.imageName}{img.pageIndex ? ` — Page ${img.pageIndex}` : ''}
                    </Text>
                    <Image src={img.imageDataUrl} style={s.imageElement} />
                </View>
            ))}
        </View>
    )
}

// ─── Summary Section ─────────────────────────────────────────────────────────

function SummarySection({ summaries }: { summaries: SummaryEntry[] }) {
    if (!summaries || summaries.length === 0) return null
    // Sort by page
    const sorted = [...summaries].sort((a, b) => a.sourcePage - b.sourcePage)
    return (
        <View>
            <Text style={s.summarySectionHeader}>Page Summaries</Text>
            {sorted.map((entry, idx) => (
                <View key={idx} style={s.summaryBlock}>
                    <Text style={s.summaryPageLabel}>Page {entry.sourcePage} Summary</Text>
                    <MarkdownBody text={entry.summary} />
                </View>
            ))}
        </View>
    )
}

// ─── Document ────────────────────────────────────────────────────────────────

interface Props {
    qaTree: QANode[]
    pageQuizzes: PageQuizEntry[]
    stickyNotes?: StickyNoteEntry[]
    customPrompts?: CustomPromptEntry[]
    images?: ImageEntry[]
    summaries?: SummaryEntry[]
    filename: string
    exportDate: string
    totalQuestions: number
    title: string
}

export default function StudyNotePDF({
    qaTree,
    pageQuizzes,
    stickyNotes = [],
    customPrompts = [],
    images = [],
    summaries = [],
    filename,
    exportDate,
    totalQuestions,
    title,
}: Props) {
    return (
        <Document
            title="StudyCanvas Study Notes"
            author="StudyCanvas"
            creator="StudyCanvas"
        >
            <Page size="A4" style={s.page}>
                {/* Fixed header */}
                <View style={s.pageHeader} fixed>
                    <Text style={s.pageHeaderLeft}>StudyCanvas</Text>
                    <Text style={s.pageHeaderRight}>{filename}</Text>
                </View>

                {/* Fixed footer */}
                <Text
                    style={s.pageFooter}
                    render={({ pageNumber, totalPages }) =>
                        `Page ${pageNumber} of ${totalPages}`
                    }
                    fixed
                />

                {/* Cover section */}
                <View style={[s.coverSection, { marginTop: 12 }]}>
                    <View>
                        <Text style={s.coverTitle}>{title}</Text>
                    </View>
                    <View style={{ marginTop: 4 }}>
                        <Text style={s.coverSubtitle}>{filename}</Text>
                    </View>
                    <View style={{ marginTop: 2 }}>
                        <Text style={s.coverMeta}>Exported: {exportDate}</Text>
                    </View>
                    <View style={s.coverTagRow}>
                        {totalQuestions > 0 && (
                            <Text style={s.coverTag}>{totalQuestions} Questions</Text>
                        )}
                        {qaTree.reduce((n, r) => n + r.children.length, 0) > 0 && (
                            <Text style={s.coverTag}>
                                {qaTree.reduce((n, r) => n + r.children.length, 0)} Branch Questions
                            </Text>
                        )}
                        {qaTree.reduce((n, r) => n + Math.floor(r.chatHistory.length / 2), 0) > 0 && (
                            <Text style={s.coverTag}>
                                {qaTree.reduce((n, r) => n + Math.floor(r.chatHistory.length / 2), 0)} Follow-ups
                            </Text>
                        )}
                        {pageQuizzes.length > 0 && (
                            <Text style={s.coverTag}>
                                {pageQuizzes.reduce((n, p) => n + p.questions.length, 0)} Quiz Questions
                            </Text>
                        )}
                        {stickyNotes.length > 0 && (
                            <Text style={s.coverTag}>{stickyNotes.length} Notes</Text>
                        )}
                        {customPrompts.length > 0 && (
                            <Text style={s.coverTag}>{customPrompts.length} AI Chats</Text>
                        )}
                        {images.length > 0 && (
                            <Text style={s.coverTag}>{images.length} Images</Text>
                        )}
                        {summaries.length > 0 && (
                            <Text style={s.coverTag}>{summaries.length} Summaries</Text>
                        )}
                    </View>
                </View>

                {/* Q&A sections */}
                {qaTree.map((node, idx) => (
                    <RootQABlock key={node.id} node={node} index={idx} />
                ))}

                {/* Sticky Notes */}
                <StickyNotesSection notes={stickyNotes} />

                {/* Custom AI Prompts & Answers */}
                <CustomPromptsSection prompts={customPrompts} />

                {/* Page Quizzes section */}
                <QuizSection pageQuizzes={pageQuizzes} />

                {/* Uploaded Images — after quizzes */}
                <ImagesSection images={images} />

                {/* Page Summaries — at the very end */}
                <SummarySection summaries={summaries} />
            </Page>
        </Document>
    )
}
