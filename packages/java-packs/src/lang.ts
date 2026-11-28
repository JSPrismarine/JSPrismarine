/**
 * Bedrock `.lang` files, which become Java language JSON. Keys stay Bedrock's, so a server names a
 * converted string with the same key on both editions.
 */

/**
 * Reads a `.lang` file: one `key=value` a line. A line starting `##` is a comment, and so is
 * whatever follows a tab and `##` on a line. Everything else, `%s` and `%d` included, stays as
 * written.
 */
export const parseLang = (text: string): Map<string, string> => {
    const entries = new Map<string, string>();
    for (const rawLine of text.replace(/^﻿/, '').split('\n')) {
        // Scanned with indexOf and trimEnd rather than a pattern, which a long run of tabs and
        // spaces in a pack's file would make backtrack.
        const comment = rawLine.indexOf('\t##');
        const line = (comment === -1 ? rawLine : rawLine.slice(0, comment)).trimEnd();
        if (line === '' || line.startsWith('##')) continue;
        const equals = line.indexOf('=');
        if (equals <= 0) continue;
        entries.set(line.slice(0, equals), line.slice(equals + 1));
    }
    return entries;
};

/**
 * The Java locale a Bedrock language file is for: `texts/en_US.lang` is `en_us`. Undefined for a
 * file that is not a language file at the top of `texts/`.
 */
export const javaLocaleOf = (path: string): string | undefined => {
    const match = /^texts\/([A-Za-z]{2,3}_[A-Za-z]{2,4})\.lang$/.exec(path);
    return match === null ? undefined : match[1]!.toLowerCase();
};
