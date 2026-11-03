/**
 * Prototype Node's built-in TypeScript stripping with extensionless relative import resolution.
 *
 * Bare workspace package imports pass through Node's package exports unchanged. Relative
 * specifiers resolve to the same source file TSX would select, with common TypeScript and
 * JavaScript extensions tried before directory index files.
 */
import { statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const extensions = ['.ts', '.mts', '.js', '.mjs', '.json'];

/** Whether an existing path names a regular file. */
const isFile = (path) => {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
};

/** Resolves one extensionless relative specifier beside its importing module. */
const resolveRelativeFile = (specifier, parentURL) => {
    const targetURL = new URL(specifier, parentURL);
    if (targetURL.search || targetURL.hash) return undefined;

    const targetPath = fileURLToPath(targetURL);
    if (extname(targetPath) !== '' || isFile(targetPath)) return undefined;

    for (const extension of extensions) {
        const candidate = `${targetPath}${extension}`;
        if (isFile(candidate)) return candidate;
    }

    for (const extension of extensions) {
        const candidate = resolve(targetPath, `index${extension}`);
        if (isFile(candidate)) return candidate;
    }

    return undefined;
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith('.') || context.parentURL === undefined || !context.parentURL.startsWith('file:')) {
            return nextResolve(specifier, context);
        }

        const candidate = resolveRelativeFile(specifier, context.parentURL);
        return candidate === undefined
            ? nextResolve(specifier, context)
            : nextResolve(pathToFileURL(candidate).href, context);
    }
});
