// ─── Tutorial step definitions ────────────────────────────────────────────────

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TutorialStep {
    /** Unique identifier */
    id: string
    /** Phase badge label (e.g., "AI Tools") */
    phaseLabel: string
    /** Icon key — mapped to an SVG in TutorialOverlay's PhaseIcon component */
    phaseIconKey: string
    /** Card title */
    title: string
    /** Main description — keep to 2-3 short sentences */
    description: string
    /** One-line power-user tip */
    proTip: string
    /** CSS selector to spotlight — null = full-screen centre card */
    targetSelector: string | null
    /** Which side of the spotlight to place the tooltip */
    tooltipPosition: TooltipPosition
    /** Extra px padding around the spotlight rectangle */
    highlightPadding: number
}

export const tutorialSteps: TutorialStep[] = [
    // ── 0 ──────────────────────────────────────────────────────────
    {
        id: 'welcome',
        phaseLabel: 'Welcome',
        phaseIconKey: 'graduation-cap',
        title: 'Welcome to Your Study Canvas!',
        description:
            'This is your infinite learning space. Drag to pan, scroll to zoom. A Tutorial Canvas has been set up so you can explore every feature safely before using your own material.',
        proTip: 'Press F at any time to fit all nodes into view',
        targetSelector: null,
        tooltipPosition: 'center',
        highlightPadding: 0,
    },

    // ── 1 ──────────────────────────────────────────────────────────
    {
        id: 'content-node',
        phaseLabel: 'Content',
        phaseIconKey: 'file-text',
        title: 'Your Study Material',
        description:
            'This Content Node holds your PDF or notes. After uploading a PDF you can toggle between PDF View and Text View using the buttons in its toolbar. Drag the corner handles to resize.',
        proTip: 'Click the expand icon in the header to switch between compact and full-page views',
        targetSelector: '[data-tutorial="content-node"]',
        tooltipPosition: 'right',
        highlightPadding: 12,
    },

    // ── 2 ──────────────────────────────────────────────────────────
    {
        id: 'page-nav',
        phaseLabel: 'Navigation',
        phaseIconKey: 'layers',
        title: 'Navigate Your Pages',
        description:
            'Use the page bar to jump between pages of your PDF. Each page has its own workspace — nodes you create are pinned to a specific page so your canvas stays organised.',
        proTip: 'Any node can be "pinned" to appear on every page — great for timers or key notes',
        targetSelector: '[data-tutorial="page-nav"]',
        tooltipPosition: 'top',
        highlightPadding: 10,
    },

    // ── 3 ──────────────────────────────────────────────────────────
    {
        id: 'ask-gemini',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'sparkle',
        title: 'Ask Gemini — Instant AI Answers',
        description:
            'Select any text inside the Content Node and an "Ask Gemini" button appears near your cursor. Click it, type your question, and Gemini creates a linked Answer Node with a streaming response.',
        proTip: 'Each Answer Node has its own follow-up chat — keep the conversation going!',
        targetSelector: '[data-tutorial="content-node"]',
        tooltipPosition: 'right',
        highlightPadding: 12,
    },

    // ── 4 ──────────────────────────────────────────────────────────
    {
        id: 'test-me',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'flask',
        title: 'Test Yourself',
        description:
            'Click "Test me on this page" (the purple button at the bottom of the Content Node) to instantly generate AI quiz questions from the current page. Perfect for active recall!',
        proTip: 'Mark questions as Understood or Struggling to personalise your revision list',
        targetSelector: '[data-tutorial="content-node"]',
        tooltipPosition: 'right',
        highlightPadding: 12,
    },

    // ── 5 ──────────────────────────────────────────────────────────
    {
        id: 'revision',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'refresh-cw',
        title: 'Revision Mode & Flashcards',
        description:
            'Open the Revision menu to generate full revision quizzes and flashcard sets — either from topics you marked as "Struggling" or from the entire current page. Spaced repetition built in!',
        proTip: 'Use Export Canvas to save your notes and Q&A as a PDF to review offline',
        targetSelector: '[data-tutorial="revision-btn"]',
        tooltipPosition: 'left',
        highlightPadding: 10,
    },

    // ── 6 ──────────────────────────────────────────────────────────
    {
        id: 'quiz-history',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'refresh-cw',
        title: 'Quiz History — Track Your Progress',
        description:
            'After completing a quiz, your results are automatically saved in Quiz History (inside the Revision menu). Review past scores, see which questions you missed, and retake any quiz with one click.',
        proTip: 'If you scored less than 100%, a "Make Flashcards" button appears — it auto-generates personalised flashcards from every question you got wrong!',
        targetSelector: '[data-tutorial="revision-btn"]',
        tooltipPosition: 'left',
        highlightPadding: 10,
    },

    // ── 7 ──────────────────────────────────────────────────────────
    {
        id: 'all-flashcards',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'refresh-cw',
        title: 'All Flashcards — Your Revision Hub',
        description:
            'The "All Flashcards" button in the Revision menu opens a hub showing every flashcard across all pages. Search, filter by page, and launch an Anki-style spaced-repetition session to drill the cards you find hardest.',
        proTip: 'Cards marked as "Struggling" are automatically prioritised in revision sessions',
        targetSelector: '[data-tutorial="revision-btn"]',
        tooltipPosition: 'left',
        highlightPadding: 10,
    },

    // ── 8 ──────────────────────────────────────────────────────────
    {
        id: 'ai-chat',
        phaseLabel: 'AI Tools',
        phaseIconKey: 'bot',
        title: 'AI Chat — Custom Prompts',
        description:
            'Click the "AI" button to open a custom Gemini chat window. Have a full conversation with context from your current page. Great for the Feynman Technique — try explaining a concept and ask Gemini to poke holes!',
        proTip: 'Toggle "Include Context" to send the full current page text with your message',
        targetSelector: '[data-tutorial="ai-btn"]',
        tooltipPosition: 'right',
        highlightPadding: 10,
    },

    // ── 7 ──────────────────────────────────────────────────────────
    {
        id: 'tools',
        phaseLabel: 'Study Tools',
        phaseIconKey: 'wrench',
        title: 'Smart Study Toolkit',
        description:
            'The left toolbar has everything: Snipping Tool, Image upload, Custom Flashcards, Sticky Notes, Voice Recorder, and AI Summary Generator. Click the small rectangular button at the bottom to collapse the toolbar to the edge — hover near the left side to peek it back.',
        proTip: 'Ctrl+Shift+S activates the Snipping Tool — ask Gemini about any diagram or chart on screen',
        targetSelector: '[data-tutorial="left-toolbar"]',
        tooltipPosition: 'right',
        highlightPadding: 8,
    },

    // ── 8 ──────────────────────────────────────────────────────────
    {
        id: 'code-editor',
        phaseLabel: 'Study Tools',
        phaseIconKey: 'code',
        title: 'Code Editor — Write Clean Code',
        description:
            'Click the code-brackets icon in the left toolbar to open a Code Editor node. Choose Java, Python, or C from the language menu — you get full syntax highlighting, line numbers, and auto-indentation, just like a real IDE. Perfect for annotating algorithms alongside your study notes.',
        proTip: 'Drag any edge or corner of the node to resize it to your preferred width and height',
        targetSelector: '[data-tutorial="code-editor-btn"]',
        tooltipPosition: 'right',
        highlightPadding: 10,
    },

    // ── 9 ──────────────────────────────────────────────────────────
    {
        id: 'timer',
        phaseLabel: 'Productivity',
        phaseIconKey: 'timer',
        title: 'Pomodoro Timer',
        description:
            'Add a Timer node to your canvas and use the Pomodoro technique: 25 min focus → 5 min break → repeat. Research shows this optimises concentration and prevents mental fatigue.',
        proTip: 'You can fully customise the focus and break durations in the timer settings',
        targetSelector: '[data-tutorial="timer-btn"]',
        tooltipPosition: 'right',
        highlightPadding: 8,
    },

    // ── 9 ──────────────────────────────────────────────────────────
    {
        id: 'whiteboard',
        phaseLabel: 'Creativity',
        phaseIconKey: 'paintbrush',
        title: 'Whiteboard & Drawing',
        description:
            'Use the right toolbar to switch to whiteboard tools: Pen, Highlighter, Eraser, and Text. Draw diagrams, annotate your notes — all on the canvas. Collapse the toolbar with the small rectangular button at the bottom; hover near the right edge to bring it back.',
        proTip: 'Drawings are page-scoped — switch to another page for a completely fresh whiteboard',
        targetSelector: '[data-tutorial="drawing-toolbar"]',
        tooltipPosition: 'left',
        highlightPadding: 8,
    },

    // ── 10 ─────────────────────────────────────────────────────────
    {
        id: 'minimap',
        phaseLabel: 'Navigation',
        phaseIconKey: 'layers',
        title: 'Minimap — Click to Navigate',
        description:
            'The minimap in the bottom-right corner shows a bird\'s-eye view of your entire canvas. Click any node thumbnail in the minimap to instantly fly to that node — the viewport centres on it with a smooth animation at your current zoom level. You can also pan and zoom directly inside the minimap.',
        proTip: 'Press F to fit all nodes into view at once — great after a long study session',
        targetSelector: '.react-flow__minimap',
        tooltipPosition: 'left',
        highlightPadding: 12,
    },

    // ── 11 ─────────────────────────────────────────────────────────
    {
        id: 'canvas-search',
        phaseLabel: 'Navigation',
        phaseIconKey: 'layers',
        title: 'Ctrl+F — Search Your Entire Canvas',
        description:
            'Press Ctrl+F (or Cmd+F on Mac) to open the canvas-wide search bar. It instantly searches every node — answers, flashcards, sticky notes, code, summaries — and every page of your PDF. Click any result to jump straight to it.',
        proTip: 'PDF text results highlight the matched word in yellow for 10 seconds so you can spot it instantly',
        targetSelector: null,
        tooltipPosition: 'center',
        highlightPadding: 0,
    },

    // ── 12 ─────────────────────────────────────────────────────────
    {
        id: 'save',
        phaseLabel: 'Organisation',
        phaseIconKey: 'save',
        title: 'Save, Menu & Settings',
        description:
            'Use the Menu (top left) to save, go home, upload a PDF, or access your study context settings. Your canvas auto-saves every 30 seconds, and Ctrl+S saves immediately.',
        proTip: 'Set your name and education level in "Tools (Context)" so Gemini personalises every response',
        targetSelector: '[data-tutorial="menu-btn"]',
        tooltipPosition: 'right',
        highlightPadding: 10,
    },
]
