/**
 * Markdown inline text as plain text: link labels kept, code and bold marks dropped, backslash
 * escapes such as `\*` read as the character they escape, and a first word raised unless it is code.
 * Code keeps its backslashes, since Markdown reads none of them inside a code span.
 */
export function plainText(markdown: string) {
    const text = markdown
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(
            /(`+)([\s\S]*?)\1|\\([!-/:-@[-`{-~])|\*\*/g,
            (_match, _ticks: string | undefined, code: string | undefined, escaped: string | undefined) =>
                code ?? escaped ?? ''
        )
        .replace(/\s+/g, ' ')
        .trim();
    return markdown.trimStart().startsWith('`') ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
