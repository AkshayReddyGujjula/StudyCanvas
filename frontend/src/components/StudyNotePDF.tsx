import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Font,
    type Styles,
} from '@react-pdf/renderer'

type PDFStyle = Styles[string]
import type { QANode } from '../utils/buildQATree'
import type { ChatMessage } from '../types'

// Use only built-in fonts — no network requests, instant render
Font.registerHyphenationCallback((w) => [w])

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
    text: '#1e293b',
    muted: '#64748b',
    accent: '#4f46e5',
    teal: '#0f766e',
    blue: '#0369a1',
    childAccent: '#7c3aed',
    quoteText: '#374151',
    quoteBg: '#f1f5f9',
    quoteBorder: '#94a3b8',
    divider: '#e2e8f0',
    white: '#ffffff',
    coverBg: '#f8fafc',
    tagBg: '#ede9fe',
    tagText: '#5b21b6',
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
        fontSize: 32,
        color: C.accent,
        marginBottom: 16,
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
        borderLeftColor: '#bfdbfe',
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
        color: '#0f766e',
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
        borderLeftColor: '#ddd6fe',
        paddingLeft: 12,
        paddingTop: 8,
        paddingBottom: 4,
        backgroundColor: '#faf5ff',
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
                <Text key={idx} style={[small ? s.smallPara : s.para, { fontFamily: 'Courier', color: '#374151' }]}>
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

// ─── Document ────────────────────────────────────────────────────────────────

interface Props {
    qaTree: QANode[]
    filename: string
    exportDate: string
    totalQuestions: number
    title: string
}

export default function StudyNotePDF({ qaTree, filename, exportDate, totalQuestions, title }: Props) {
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
```,oldString:
                        <Text style={s.coverTag}>{totalQuestions} Questions</Text>
                        <Text style={s.coverTag}>
                            {qaTree.reduce((n, r) => n + r.children.length, 0)} Branch Questions
                        </Text>
                        <Text style={s.coverTag}>
                            {qaTree.reduce((n, r) => n + Math.floor(r.chatHistory.length / 2), 0)} Follow-ups
                        </Text>
                    </View>
                </View>

                {/* Q&A sections */}
                {qaTree.map((node, idx) => (
                    <RootQABlock key={node.id} node={node} index={idx} />
                ))}
            </Page>
        </Document>
    )
}
