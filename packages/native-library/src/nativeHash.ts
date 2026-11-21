import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// `build:native` loads this file under plain `node`, which cannot follow an extensionless relative
// import, so it imports only Node.js modules and takes the naming answers from its caller.

/**
 * Every file the native build reads, relative to the package, sorted: `native/` but its manifest,
 * and the files outside it the package names.
 */
const buildInputs = (packageDir: string, buildScripts: readonly string[]): string[] => {
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name !== 'manifest.json') files.push(relative(packageDir, path).split(sep).join('/'));
        }
    };
    walk(join(packageDir, 'native'));
    files.push(...buildScripts);
    return files.sort();
};

/**
 * Whether a package directory holds the native sources, which a checkout does and a published
 * package does not.
 * @param packageDir - The package's directory.
 * @returns True in a checkout.
 */
export const hasNativeSources = (packageDir: string): boolean => existsSync(join(packageDir, 'native', 'sources.json'));

/**
 * The hash that names a build of a native library. A release of builds is tagged with it, and the
 * manifest records the hash its builds were made from, so a checkout can tell whether its native
 * sources still match the published builds. Every change it sees publishes a new set of builds,
 * so it covers what can change a build and nothing else: the build's input files, and what the
 * shared naming helpers answer rather than their source.
 * @param packageDir - The package's directory, holding `native/`.
 * @param buildScripts - The files outside `native/` the build reads, relative to the package,
 *   such as its build script.
 * @param naming - What the shared naming helpers answer, from `namingAnswers` in `./platform`.
 * @returns The first 16 hex digits of the SHA-256 over the build's inputs.
 */
export const nativeSourceHash = (packageDir: string, buildScripts: readonly string[], naming: string): string => {
    const hash = createHash('sha256');
    for (const file of buildInputs(packageDir, buildScripts)) {
        // Line endings are normalized, so a Windows checkout hashes the same.
        const text = readFileSync(join(packageDir, file), 'utf8').replace(/\r\n/g, '\n');
        hash.update(file).update('\0').update(text).update('\0');
    }
    hash.update(naming);
    return hash.digest('hex').slice(0, 16);
};
