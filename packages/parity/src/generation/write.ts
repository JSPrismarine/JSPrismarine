/**
 * Writes the generation corpus golden, provenance and all.
 *
 * Separate from `capture.ts` because capturing is what the comparison rows do on every run and
 * writing is what one script does when a generation change is deliberate. Keeping the write out
 * of the capture path means no test can overwrite the recording it is supposed to be checking.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { GENERATION_CORPUS_PATH, pinnedJavaDataVersion } from '../references.ts';
import type { GenerationEnvironment } from './capture.ts';
import { CAPTURE_PROTOCOL, captureCorpus } from './capture.ts';
import type { GenerationCorpusGolden } from './golden.ts';
import { GENERATION_CORPUS_FORMAT } from './golden.ts';

// This file is `packages/parity/src/generation/write.ts`, so the repository root is four up.
const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');

/**
 * The packages whose code decides what a chunk holds.
 *
 * The golden records which of their files were uncommitted when the capture ran, because a
 * corpus taken over a half-finished edit is not the corpus of the commit it names. Test files
 * are left out: they place no block, and a monorepo almost always has one open.
 */
const GENERATION_PATHS = [
    'packages/prismarine/src/world',
    'packages/features/src',
    'packages/worldgen/src',
    'packages/structures/src',
    'packages/mapping/src'
];

const git = (...args: string[]): string => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' });

/**
 * The paths `git status --porcelain` reports, with its two status columns removed.
 *
 * The output is not trimmed as a whole: an unstaged change starts its line with a space, and
 * trimming would eat the first line's and take a character off its path with it.
 */
const changedPaths = (paths: readonly string[]): string[] =>
    git('status', '--porcelain', '--', ...paths)
        .split('\n')
        .filter((line) => line.length > 3)
        .map((line) => line.slice(3));

/** What the write produced, for the script that prints it. */
export interface CorpusWriteResult {
    readonly path: string;
    readonly golden: GenerationCorpusGolden;
    readonly elapsedMs: number;
}

/**
 * Captures the corpus and writes it to {@link GENERATION_CORPUS_PATH}.
 *
 * @param environment - The Java data, from `openGeneration`.
 * @param onChunk - Called with each chunk's id and how long it took, for progress output.
 * @throws {Error} When `packages/bedrock-data/sources.json` pins no Java version, which would
 *   leave the golden with no vintage and no way to tell it had gone stale.
 */
export const writeCorpusGolden = async (
    environment: GenerationEnvironment,
    onChunk?: (id: string, elapsedMs: number) => void
): Promise<CorpusWriteResult> => {
    const javaVersion = pinnedJavaDataVersion();
    if (javaVersion === undefined) {
        throw new Error('packages/bedrock-data/sources.json pins no Java version, so the capture has no vintage');
    }

    const captured = await captureCorpus(environment, (entry, elapsedMs) => onChunk?.(entry.id, elapsedMs));

    const golden: GenerationCorpusGolden = {
        formatVersion: GENERATION_CORPUS_FORMAT,
        provenance: {
            commit: git('rev-parse', 'HEAD').trim(),
            capturedAt: new Date().toISOString().slice(0, 10),
            javaVersion,
            uncommitted: changedPaths(GENERATION_PATHS).filter((path) => !path.endsWith('.test.ts')),
            protocol: CAPTURE_PROTOCOL
        },
        dimension: captured.dimension,
        chunks: captured.chunks,
        samples: captured.samples,
        structures: captured.structures,
        unbuiltStructureTypes: captured.unbuiltStructureTypes,
        blockCounts: captured.blockCounts
    };

    const path = join(repoRoot, GENERATION_CORPUS_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(golden)}\n`);

    return { path, golden, elapsedMs: captured.elapsedMs };
};
