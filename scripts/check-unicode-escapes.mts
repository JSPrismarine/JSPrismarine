/**
 * Fails when a tracked text file spells a readable character as an escape
 * sequence, such as `Sandström` instead of `Sandström`. Tools that
 * serialize with ASCII-only output (some JSON writers, changelog generators)
 * introduce these; the repository stores UTF-8 and wants the characters
 * themselves. Escapes for control and invisible characters stay allowed,
 * which keeps patterns like the ANSI escape `\u001b` legal.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** File endings this check never reads, either binary or generated data. */
const SKIPPED =
    /\.(png|ico|jpg|jpeg|gif|woff2?|ttf|nbt|dat|bin|blob|zip|gz|lock)$|^packages\/bedrock-data\/src\/(resources|generated|jsp)\//;

const ESCAPE = /\\u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/g;

/** Readable characters: letters, marks, digits and visible punctuation outside ASCII. */
const READABLE = /[\p{L}\p{M}\p{N}\p{Sc}]/u;

const files = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !SKIPPED.test(file));

let failures = 0;
for (const file of files) {
    const target = path.join(repoRoot, file);
    // Tracked symlinks such as .claude/skills/* can point at directories.
    if (!statSync(target, { throwIfNoEntry: false })?.isFile()) continue;
    const text = readFileSync(target, 'utf8');
    for (const match of text.matchAll(ESCAPE)) {
        const codepoint = Number.parseInt(match[1] ?? match[2]!, 16);
        if (codepoint < 0x80) continue; // ASCII escapes are pointless but never hide a name.
        const character = String.fromCodePoint(codepoint);
        if (!READABLE.test(character)) continue;
        const line = text.slice(0, match.index).split('\n').length;
        console.error(`${file}:${line} write "${character}" directly instead of the escape ${match[0]}`);
        failures += 1;
    }
}

if (failures > 0) {
    console.error(
        `\n${failures} readable characters are hidden behind escape sequences. The repository stores UTF-8; write the characters themselves.`
    );
    process.exit(1);
}
console.log(`No readable characters hidden behind escapes (${files.length} files checked).`);
