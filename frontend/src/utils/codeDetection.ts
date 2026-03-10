import type { CodeEditorLanguage } from '../types'

export interface CodeBlock {
    language: CodeEditorLanguage
    code: string
}

/**
 * Extracts fenced code blocks for Python, Java, and C from markdown text.
 * Only matches ```python, ```java, and ```c — not c++, c#, cpp, etc.
 * Returns all detected blocks in order of appearance.
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
    // Negative lookahead on `c` prevents matching c++, c#, cpp, csharp
    const re = /```(python|java|c(?![\w+#]))\s*\n([\s\S]*?)```/gi
    const blocks: CodeBlock[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        blocks.push({
            language: m[1].toLowerCase() as CodeEditorLanguage,
            code: m[2].trim(),
        })
    }
    return blocks
}
