import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

let scratch: string | undefined;

afterEach(() => {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
});

/**
 * Runs the merge over the saved block names and the described ones.
 *
 * The merge writes beside itself, under `snapshot/`, so it runs as a copy in a scratch
 * directory with the real manifest, and a regression cannot overwrite a committed capture.
 * The manifest finds the output directory by Minecraft version, and 1.26.60 is 2225's.
 */
const runMerge = (saved: readonly string[], described: readonly string[]) => {
    scratch = mkdtempSync(join(tmpdir(), 'jsp-merge-palette-'));
    for (const file of ['merge-block-palette.mjs', 'manifest.json']) {
        copyFileSync(join(import.meta.dirname, file), join(scratch, file));
    }
    mkdirSync(join(scratch, 'snapshot', 'v2225'), { recursive: true });

    const states = join(scratch, 'states.json');
    const domains = join(scratch, 'domains.jsonl');
    writeFileSync(states, JSON.stringify(Object.fromEntries(saved.map((name) => [name, {}]))));
    writeFileSync(domains, described.map((name) => JSON.stringify({ name, props: {} })).join('\n'));

    const result: SpawnSyncReturns<string> = spawnSync(
        process.execPath,
        [join(scratch, 'merge-block-palette.mjs'), states, domains, '1.26.60', 'bedrock-server-test'],
        { encoding: 'utf8', cwd: scratch }
    );
    return { result, written: existsSync(join(scratch, 'snapshot', 'v2225', 'block-palette.json')) };
};

/**
 * Under load the palette pass once placed its blocks before their ticking area had loaded, so
 * the world saved none, and the merge still wrote a golden of 0 or 413 blocks and exited 0
 * (#3254). A capture whose world saved fewer block types than the game describes is refused.
 */
describe('merge-block-palette', () => {
    it('writes nothing and fails when the world saved fewer block types than the game describes', () => {
        const { result, written } = runMerge(['minecraft:stone'], ['minecraft:stone', 'minecraft:dirt']);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('minecraft:dirt');
        expect(written).toBe(false);
    });

    it('writes the capture when the world saved every block type the game describes', () => {
        const { result, written } = runMerge(['minecraft:stone'], ['minecraft:stone']);

        expect(result.status).toBe(0);
        expect(written).toBe(true);
    });
});
