/**
 * Builds a small user-land V8 snapshot and compares fresh content builds with restored inputs.
 *
 * Run `pnpm run bench:content-snapshot`. The fixture does not need Mojang's fetched packs, and
 * every restored run rebuilds its world and seed-bound registries before checking the digests.
 * Pass `--no-snapshot` to exercise the fresh-build fallback path.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rolldown } from 'rolldown';

const repositoryRoot = process.cwd();
const entry = join(repositoryRoot, 'packages/prismarine/benchmarks/contentSnapshotEntry.ts');
const workspace = mkdtempSync(join(tmpdir(), 'jsprismarine-content-snapshot-'));
const bundlePath = join(workspace, 'content-snapshot.cjs');
const blobPath = join(workspace, 'content-snapshot.blob');
const runs = 3;

interface SnapshotRun {
    readonly mode: string;
    readonly seed: string;
    readonly [field: string]: unknown;
}

/** Runs one fresh process and returns its final JSON record. */
const run = (args: readonly string[], environment: NodeJS.ProcessEnv): SnapshotRun => {
    const result = spawnSync(process.execPath, args, {
        cwd: repositoryRoot,
        env: { ...process.env, ...environment },
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000
    });
    if (result.status !== 0) {
        throw new Error(
            `Node exited with ${result.status ?? result.signal} while running ${args.join(' ')}:\n${result.stderr}\n${result.stdout}`
        );
    }

    const output = result.stdout.trim().split(/\r?\n/u).at(-1);
    if (output === undefined) throw new Error(`Node produced no content snapshot result for ${args.join(' ')}`);
    return JSON.parse(output) as SnapshotRun;
};

/** Returns the middle sample, preserving fractional milliseconds. */
const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)]!;
};

/** Whether two runs produced identical content and loot outputs. */
const sameDigest = (left: SnapshotRun, right: SnapshotRun): boolean =>
    'contentDigest' in left && 'contentDigest' in right
        ? left.contentDigest === right.contentDigest
        : 'sameContentDigest' in left && left.sameContentDigest === true;

try {
    const bundle = await rolldown({
        input: entry,
        platform: 'node',
        resolve: { alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' } }
    });
    await bundle.write({ file: bundlePath, format: 'cjs', codeSplitting: false });
    await bundle.close();

    const forceFreshFallback = process.argv.includes('--no-snapshot');
    const snapshotBuild = forceFreshFallback
        ? undefined
        : spawnSync(process.execPath, [`--snapshot-blob=${blobPath}`, '--build-snapshot', bundlePath], {
              cwd: repositoryRoot,
              encoding: 'utf8',
              maxBuffer: 16 * 1024 * 1024,
              timeout: 120_000
          });
    let snapshotAvailable = snapshotBuild?.status === 0;
    let snapshotFailure =
        snapshotBuild === undefined
            ? 'snapshot disabled by --no-snapshot'
            : snapshotAvailable
              ? undefined
              : (snapshotBuild.stderr || snapshotBuild.stdout).trim().slice(-2000);

    const reports: {
        readonly seed: string;
        readonly freshContentDigest: string;
        readonly freshStaticDigest: string;
        readonly restoredContentDigest?: string;
        readonly restoredStaticDigest?: string;
        readonly freshStartupMs: readonly number[];
        readonly freshMs: readonly number[];
        readonly restoredMs?: readonly number[];
        readonly lateBoundMs?: readonly number[];
        readonly snapshotBuildMs?: number;
        readonly noHandlesOrWorkers: boolean | null;
        readonly freshBuildStable: boolean;
        readonly contentEquivalent: boolean | null;
    }[] = [];

    for (const seed of ['0', '1']) {
        const fresh = Array.from({ length: runs }, () => run([bundlePath], { JSP_CONTENT_SNAPSHOT_SEED: seed }));
        let restored: SnapshotRun[] | undefined;
        if (snapshotAvailable) {
            try {
                restored = Array.from({ length: runs }, () =>
                    run([`--snapshot-blob=${blobPath}`], { JSP_CONTENT_SNAPSHOT_SEED: seed })
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes('"mode":"snapshot-restore"')) throw error;
                snapshotAvailable = false;
                snapshotFailure = `Snapshot restore failed; using fresh-build fallback:\n${message.slice(-2000)}`;
            }
        }
        const freshDigests = new Set(fresh.map((sample) => sample.contentDigest));
        const freshBuildStable = freshDigests.size === 1;
        const contentEquivalent =
            restored === undefined
                ? null
                : freshBuildStable &&
                  restored.every((sample) => sample.sameContentDigest === true && sample.sameStaticDigest === true);
        const noHandlesOrWorkers =
            restored === undefined
                ? null
                : restored.every((sample) => sample.snapshotGenerationOpenedNoHandlesOrWorkers === true);

        reports.push({
            seed,
            freshContentDigest: String(fresh[0]?.contentDigest),
            freshStaticDigest: String(fresh[0]?.staticDigest),
            ...(restored?.[0] === undefined
                ? {}
                : {
                      restoredContentDigest: String(restored[0].restoredContentDigest),
                      restoredStaticDigest: String(restored[0].restoredStaticDigest)
                  }),
            freshStartupMs: fresh.map((sample) => Number(sample.processStartupMs)),
            freshMs: fresh.map((sample) => Number(sample.contentBuildMs)),
            ...(restored === undefined
                ? {}
                : {
                      restoredMs: restored.map((sample) => Number(sample.snapshotRestoreToCallbackMs)),
                      lateBoundMs: restored.map((sample) => Number(sample.lateBoundBuildMs))
                  }),
            ...(restored?.[0] === undefined ? {} : { snapshotBuildMs: Number(restored[0].snapshotBuildMs) }),
            noHandlesOrWorkers,
            freshBuildStable,
            contentEquivalent
        });
    }

    let customFallback: SnapshotRun | undefined;
    if (snapshotAvailable) {
        try {
            customFallback = run([`--snapshot-blob=${blobPath}`], {
                JSP_CONTENT_SNAPSHOT_SEED: '0',
                JSP_CONTENT_SNAPSHOT_CUSTOM: '1'
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('"mode":"snapshot-restore"')) throw error;
            snapshotAvailable = false;
            snapshotFailure = `Snapshot restore failed; using fresh-build fallback:\n${message.slice(-2000)}`;
        }
    }
    const customFresh = run([bundlePath], {
        JSP_CONTENT_SNAPSHOT_SEED: '0',
        JSP_CONTENT_SNAPSHOT_CUSTOM: '1'
    });
    const customInvalidates =
        customFallback === undefined
            ? undefined
            : customFallback.cacheHit === false && customFallback.sameContentDigest === true;

    const [firstSeed, secondSeed] = reports;
    const seedIndependentDataMatches =
        firstSeed === undefined || secondSeed === undefined
            ? undefined
            : firstSeed.freshStaticDigest === secondSeed.freshStaticDigest &&
              (firstSeed.restoredStaticDigest === undefined ||
                  firstSeed.restoredStaticDigest === secondSeed.restoredStaticDigest);
    const seedBoundLootChanges =
        firstSeed === undefined || secondSeed === undefined || !snapshotAvailable
            ? undefined
            : firstSeed.freshContentDigest !== secondSeed.freshContentDigest &&
              firstSeed.restoredContentDigest !== undefined &&
              secondSeed.restoredContentDigest !== undefined &&
              firstSeed.restoredContentDigest !== secondSeed.restoredContentDigest;

    const failedChecks =
        reports.some(
            (report) =>
                !report.freshBuildStable || report.contentEquivalent === false || report.noHandlesOrWorkers === false
        ) ||
        customInvalidates === false ||
        seedIndependentDataMatches === false ||
        seedBoundLootChanges === false;
    const output = {
        node: process.version,
        v8: process.versions.v8,
        snapshotAvailable,
        ...(snapshotFailure === undefined ? {} : { snapshotFailure }),
        runsPerMode: runs,
        reports: reports.map((report) => ({
            ...report,
            freshStartupMedianMs: median(report.freshStartupMs),
            freshMedianMs: median(report.freshMs),
            ...(report.restoredMs === undefined
                ? {}
                : {
                      snapshotRestoreMedianMs: median(report.restoredMs),
                      lateBoundMedianMs: median(report.lateBoundMs ?? [])
                  })
        })),
        customPackInvalidatesSnapshot: customInvalidates ?? null,
        customSnapshotFallbackDigestMatchesFresh:
            customFallback === undefined ? null : sameDigest(customFallback, customFresh),
        seedIndependentDataMatches: seedIndependentDataMatches ?? null,
        seedBoundLootChanges: seedBoundLootChanges ?? null,
        sharedRuntimeContent: false
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (failedChecks) process.exitCode = 1;
} finally {
    rmSync(workspace, { recursive: true, force: true });
}
