import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The docblock tag that marks a test file as one that boots an in-process server. */
export const INTEGRATION_TAG = 'integration';

/** Matches the tag the way Vitest's own docblock reader does, as a `//` or `*` comment line. */
const TAGGED = new RegExp(String.raw`(?://|\*)\s*@module-tag\s+${INTEGRATION_TAG}(?![\w/-])`);

/**
 * Whether a test file's source carries `@module-tag integration`.
 *
 * @param code - The test file's source.
 */
export const isIntegrationFile = (code: string): boolean => TAGGED.test(code);

/**
 * The tracked test files tagged `@module-tag integration`, relative to `root` with forward slashes.
 *
 * Vitest reads a file's docblock tags only once it has transformed and imported the file, so
 * `--tagsFilter='!integration'` still pays each tagged file's import before skipping it. Listing the
 * files here lets the config exclude them before anything loads.
 *
 * @param root - The repository root.
 */
export const integrationFiles = (root: string): string[] => {
    const listed = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.mts'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    return listed
        .split('\0')
        .filter((file) => file !== '')
        .filter((file) => {
            try {
                return isIntegrationFile(readFileSync(path.join(root, file), 'utf8'));
            } catch {
                // A file deleted from the work tree but still in the index runs nowhere.
                return false;
            }
        });
};
