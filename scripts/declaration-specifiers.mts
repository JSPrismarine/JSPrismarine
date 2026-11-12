/**
 * Rewrites the relative imports of an emitted declaration file so Node ESM resolution can
 * follow them. tsc emits the specifiers as the source wrote them, for bundler resolution:
 * `./logger` for `logger.d.ts`. A consumer resolving with NodeNext or Node16 follows only a
 * relative specifier with its extension, so each one names the built `.js` module, which
 * TypeScript then resolves to the declaration beside it.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/** Where a line comment ends: at any ECMAScript line terminator, not only a line feed. */
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/g;

/** The index just past the last character before `end` that is not whitespace. */
const skipSpaceBack = (source: string, end: number): number => {
    let at = end;
    while (at > 0 && /\s/.test(source.charAt(at - 1))) at -= 1;
    return at;
};

/** The identifier that ends at `end`, or an empty string when none does. */
const wordBefore = (source: string, end: number): string => {
    let start = end;
    while (start > 0 && /[\w$]/.test(source.charAt(start - 1))) start -= 1;
    return source.slice(start, end);
};

/**
 * Whether what stands before a string literal makes it a module specifier: `from`, `import`,
 * `import(` or `declare module`.
 *
 * Read backward a token at a time, so any amount of whitespace may stand between the keyword and
 * the quote, or inside `import (` and `declare module`.
 * @param source - The declaration file's contents.
 * @param quoteAt - Where the literal's opening quote stands.
 */
const followsSpecifierKeyword = (source: string, quoteAt: number): boolean => {
    const end = skipSpaceBack(source, quoteAt);
    if (source.charAt(end - 1) === '(') return wordBefore(source, skipSpaceBack(source, end - 1)) === 'import';

    const word = wordBefore(source, end);
    if (word === 'from' || word === 'import') return true;
    return word === 'module' && wordBefore(source, skipSpaceBack(source, end - word.length)) === 'declare';
};

/** A relative specifier: `.` or `..`, alone or followed by a path. */
const RELATIVE = /^\.\.?(?:\/|$)/;

/**
 * Where each string literal of a source starts and ends, quotes included, skipping comments.
 * A template literal counts as one, so a string inside its `${}` is never taken for a specifier.
 */
function* stringLiterals(source: string): Generator<{ readonly start: number; readonly end: number }> {
    let at = 0;
    while (at < source.length) {
        const char = source[at];
        if (char === '/' && source[at + 1] === '/') {
            LINE_TERMINATOR.lastIndex = at;
            at = LINE_TERMINATOR.exec(source)?.index ?? source.length;
        } else if (char === '/' && source[at + 1] === '*') {
            const close = source.indexOf('*/', at + 2);
            at = close === -1 ? source.length : close + 2;
        } else if (char === "'" || char === '"' || char === '`') {
            let end = at + 1;
            while (end < source.length && source[end] !== char) end += source[end] === '\\' ? 2 : 1;
            yield { start: at, end: end + 1 };
            at = end + 1;
        } else at += 1;
    }
}

/**
 * The specifier of the module a relative import in `declarationFile` names, with its `.js`
 * extension, or the specifier unchanged when no declaration beside it matches.
 * @param declarationFile - The declaration file that holds the import.
 * @param specifier - The relative specifier as tsc emitted it.
 * @returns The specifier Node ESM resolution can follow.
 */
const withJsExtension = (declarationFile: string, specifier: string): string => {
    if (/\.[cm]?js$/.test(specifier)) return specifier;
    // TypeScript resolves `./x.js` to `x.d.ts` whether or not `x.js` exists, and Vite emits no
    // JavaScript for a module that only declares types.
    const has = (candidate: string): boolean =>
        existsSync(path.resolve(path.dirname(declarationFile), `${candidate}.d.ts`));
    const base = specifier.replace(/\.(json|ts)$/, '');
    if (base !== specifier) return has(base) ? `${base}.js` : specifier;
    if (has(specifier)) return `${specifier}.js`;
    const index = `${specifier.replace(/\/$/, '')}/index`;
    return has(index) ? `${index}.js` : specifier;
};

/**
 * Gives every relative import, re-export, `import()` type and module augmentation in a
 * declaration file the `.js` extension of the module it names.
 *
 * Only a string literal that follows one of those keywords is a specifier. Comments are skipped
 * and each string literal is read whole, so a string literal type that spells an import, such as
 * `"from './logger'"`, keeps its value.
 * @param source - The declaration file's contents.
 * @param declarationFile - The declaration file's path, which the specifiers are relative to.
 * @returns The contents with each resolvable relative specifier rewritten.
 */
export const withJsExtensions = (source: string, declarationFile: string): string => {
    let written = '';
    let copied = 0;
    for (const { start, end } of stringLiterals(source)) {
        const quote = source[start];
        if (quote === '`' || !followsSpecifierKeyword(source, start)) continue;
        const specifier = source.slice(start + 1, end - 1);
        if (!RELATIVE.test(specifier)) continue;
        written += `${source.slice(copied, start)}${quote}${withJsExtension(declarationFile, specifier)}${quote}`;
        copied = end;
    }
    return written + source.slice(copied);
};
