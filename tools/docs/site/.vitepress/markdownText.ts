/**
 * Markdown inline text as plain text: link labels kept, code and bold marks dropped, and backslash
 * escapes such as `\*` read as the character they escape. Code keeps its backslashes, since Markdown
 * reads none of them inside a code span.
 */
export function inlineText(markdown: string) {
    return markdown
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(
            /(`+)([\s\S]*?)\1|\\([!-/:-@[-`{-~])|\*\*/g,
            (_match, _ticks: string | undefined, code: string | undefined, escaped: string | undefined) =>
                code ?? escaped ?? ''
        )
        .replace(/\s+/g, ' ')
        .trim();
}

/** Markdown prose as plain text, as {@link inlineText} reads it, with its first word raised unless it is code. */
export function plainText(markdown: string) {
    const text = inlineText(markdown);
    return markdown.trimStart().startsWith('`') ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
