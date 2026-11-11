/**
 * Rewrites the relative imports of an emitted declaration file so Node ESM resolution can
 * follow them. tsc emits the specifiers as the source wrote them, for bundler resolution:
 * `./logger` for `logger.d.ts`. A consumer resolving with NodeNext or Node16 follows only a
 * relative specifier with its extension, so each one names the built `.js` module, which
 * TypeScript then resolves to the declaration beside it.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

const RELATIVE_SPECIFIER =
    /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bdeclare\s+module\s+)(['"])(\.\.?(?:\/[^'"]*)?)\2/g;

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
 * @param source - The declaration file's contents.
 * @param declarationFile - The declaration file's path, which the specifiers are relative to.
 * @returns The contents with each resolvable relative specifier rewritten.
 */
export const withJsExtensions = (source: string, declarationFile: string): string =>
    source.replace(
        RELATIVE_SPECIFIER,
        (_match, keyword: string, quote: string, specifier: string) =>
            `${keyword}${quote}${withJsExtension(declarationFile, specifier)}${quote}`
    );
