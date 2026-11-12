/**
 * Rewrites the relative imports of an emitted declaration file so Node ESM resolution can
 * follow them. tsc emits the specifiers as the source wrote them, for bundler resolution:
 * `./logger` for `logger.d.ts`. A consumer resolving with NodeNext or Node16 follows only a
 * relative specifier with its extension, so each one names the built `.js` module, which
 * TypeScript then resolves to the declaration beside it.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/** What comes right before a module specifier: `from`, `import`, `import(` or `declare module`. */
const BEFORE_SPECIFIER = /(?:\bfrom|\bimport\s*\(|\bimport|\bdeclare\s+module)\s*$/;

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
            const newline = source.indexOf('\n', at);
            at = newline === -1 ? source.length : newline;
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
        // The keyword stands just before the quote, so a short look back finds it.
        if (quote === '`' || !BEFORE_SPECIFIER.test(source.slice(Math.max(copied, start - 64), start))) continue;
        const specifier = source.slice(start + 1, end - 1);
        if (!RELATIVE.test(specifier)) continue;
        written += `${source.slice(copied, start)}${quote}${withJsExtension(declarationFile, specifier)}${quote}`;
        copied = end;
    }
    return written + source.slice(copied);
};
