/**
 * Checks that every changeset names only packages Changesets can release.
 *
 * Changesets skips a private workspace package with no `version`, such as an addon's scripts
 * package, and refuses a changeset that names one beside a package it releases: `changeset status`
 * and `changeset version` both fail with "Mixed changesets that contain both ignored and not
 * ignored packages are not allowed", which stops the release and nightly workflows. The dependency
 * bot names every package whose manifest a pull request changed, addons included, so its
 * changesets are the usual source.
 *
 * `--fix` drops those packages from each changeset and deletes a changeset that names nothing
 * else. The bot's workflow runs it after writing its changeset.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from './isRecord.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGESET_DIR = path.join(repoRoot, '.changeset');

/** The front matter line that names a package and its bump, quoted either way. */
const RELEASE_LINE = /^\s*(["'])(?<name>[^"']+)\1\s*:\s*(?<bump>major|minor|patch|none)\s*$/;

/** The packages a changeset names, in the order its front matter lists them. */
export const namedPackages = (text: string): string[] => releaseLines(text).map(({ name }) => name);

/**
 * The changeset without the packages Changesets skips, or undefined when it names nothing else
 * and should be deleted.
 * @param text - The changeset file.
 * @param releasable - Whether Changesets releases a package by name.
 */
export const withoutSkipped = (text: string, releasable: (name: string) => boolean): string | undefined => {
    const named = releaseLines(text);
    const dropped = new Set(named.filter(({ name }) => !releasable(name)).map(({ index }) => index));
    if (dropped.size === named.length) return undefined;
    return text
        .split('\n')
        .filter((_, index) => !dropped.has(index))
        .join('\n');
};

/** The front matter's lines that name a package, between the two `---` fences, by line index. */
const releaseLines = (text: string): { index: number; name: string }[] => {
    const lines = text.split('\n');
    if (lines[0]?.trim() !== '---') return [];
    const end = lines.indexOf('---', 1);
    if (end === -1) return [];
    return lines.slice(1, end).flatMap((line, offset) => {
        const name = RELEASE_LINE.exec(line)?.groups?.name;
        return name === undefined ? [] : [{ index: offset + 1, name }];
    });
};

/** The names of the workspace packages Changesets releases: those with a `version`. */
const releasablePackages = (): Set<string> => {
    const listed: unknown = JSON.parse(
        execFileSync('pnpm', ['-r', 'ls', '--json', '--depth', '-1'], { cwd: repoRoot, encoding: 'utf8' })
    );
    if (!Array.isArray(listed)) return new Set();
    return new Set(
        listed.flatMap((entry) =>
            isRecord(entry) && typeof entry.name === 'string' && typeof entry.version === 'string' ? [entry.name] : []
        )
    );
};

if (import.meta.main) {
    const fix = process.argv.includes('--fix');
    const releasable = releasablePackages();
    const files = fs
        .readdirSync(CHANGESET_DIR)
        .filter((file) => file.endsWith('.md') && file !== 'README.md')
        .map((file) => path.join(CHANGESET_DIR, file));

    let failed = 0;
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const skipped = namedPackages(text).filter((name) => !releasable.has(name));
        if (skipped.length === 0) continue;
        const relative = path.relative(repoRoot, file);
        if (fix) {
            const fixed = withoutSkipped(text, (name) => releasable.has(name));
            if (fixed === undefined) fs.rmSync(file);
            else fs.writeFileSync(file, fixed);
            console.log(`${relative}: dropped ${skipped.join(', ')}${fixed === undefined ? ' and the file' : ''}`);
            continue;
        }
        failed += 1;
        console.error(
            `${relative} names ${skipped.join(', ')}, which Changesets does not release: a private package ` +
                'with no version, or no workspace package. Remove the line, or run ' +
                '`node scripts/check-changesets.mts --fix`.'
        );
    }
    if (failed > 0) process.exit(1);
    if (!fix) console.log(`Every changeset names only released packages (${files.length} checked).`);
}
