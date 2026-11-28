/**
 * Captures `goldens/java-structure-starts.json`: which structures Java starts in which chunks, for
 * one seed, as the pinned Java dedicated server's own `/locate structure` reports them.
 *
 * It runs the release's server jar in a scratch directory with the seed and types two kinds of
 * question at its console, one at a time:
 *
 * 1. From each of a few fixed positions, where the nearest start of every structure is. Each
 *    answer is a chunk Java starts that structure in.
 * 2. For every chunk near the origin that a structure set's placement offers, where the nearest
 *    start of each of the set's structures is, asked from inside that chunk. A random spread
 *    search looks at the asking chunk's own region first, so the answer is this chunk exactly
 *    when Java starts that structure here. Any other answer is a recorded absence.
 *
 * The second pass is what pins down a set's choice between its structures, the frequency rules
 * and the exclusion zones: the placement offers the chunk, and Java says which structure, if any,
 * took it. The candidate chunks come from `@jsprismarine/structures`' placement, which matches
 * Java's draw for draw; a chunk it offered wrongly would still be recorded correctly as absent.
 *
 * Run it on a Java version bump, and commit the result:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run ensure:java-server
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/parity run capture:java-structure-starts
 * ```
 *
 * It needs a JDK the jar can run on, and takes a few minutes.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { createServer } from 'vite';

import { findJdkHome, jdkBinaryPath } from '../../bedrock-data/utils/java/jdk.ts';
import { readJarVersion } from '../../bedrock-data/utils/java/release.ts';
import type { JavaStructureStarts, StructureChunk } from '../src/javaStructureStarts.ts';
import { JAVA_STRUCTURE_STARTS_PATH } from '../src/references.ts';

/** The seed the whole capture is of. */
const SEED = 1234;

/** Where the first pass asks from, in blocks. Spread out so each set answers several chunks. */
const POSITIONS = [
    [0, 0],
    [2000, 2000],
    [-3000, 1000],
    [1500, -2500],
    [-1000, -1000],
    [4000, 0],
    [0, -4000]
] as const;

/** How far from the origin chunk, on each axis, the second pass takes placement candidates. */
const WINDOW_CHUNKS = 48;

const repoRoot = new URL('../../../', import.meta.url);
const jar = join(repoRoot.pathname, 'node_modules/.cache/jsprismarine/java', javaServerCacheFolder, 'server.jar');
if (!existsSync(jar)) {
    throw new Error(`${jar} is missing; run pnpm --filter @jsprismarine/bedrock-data run ensure:java-server`);
}
const { java_version: jdk } = await readJarVersion(jar);
const java = jdkBinaryPath(findJdkHome({ minimumMajor: jdk }), 'java');

/** A port nothing listens on, for the Java server to take. */
const freePort = await new Promise<number>((done) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => done(typeof address === 'object' && address !== null ? address.port : 0));
    });
});

const vite = await createServer({
    configFile: false,
    root: repoRoot.pathname,
    server: { middlewareMode: true },
    appType: 'custom',
    // As in `capture-corpus.ts`: the workspace packages are TypeScript source Vite has to transform.
    ssr: { noExternal: [/@jsprismarine\//] }
});

/** Every structure and every placement candidate the two passes ask about, from the Java datapack. */
const questions = async (): Promise<{
    structures: string[];
    candidates: Array<StructureChunk & { offsetX: number; offsetZ: number }>;
}> => {
    // Vite's SSR loader returns an untyped namespace; `typeof import` is each module's real type.
    const sources = (await vite.ssrLoadModule(
        '/packages/prismarine/src/world/generators/datadriven/javaWorldgenSources.ts'
    )) as typeof import('../../prismarine/src/world/generators/datadriven/javaWorldgenSources.ts');
    const data = (await vite.ssrLoadModule(
        '/packages/prismarine/src/world/generators/datadriven/javaWorldgenData.ts'
    )) as typeof import('../../prismarine/src/world/generators/datadriven/javaWorldgenData.ts');
    const sets = (await vite.ssrLoadModule(
        '/packages/structures/src/structureSets.ts'
    )) as typeof import('../../structures/src/structureSets.ts');

    const found = sources.findJavaWorldgenSources();
    if (found === undefined) {
        throw new Error(
            'No Java world generation data in this checkout. Run `pnpm --filter @jsprismarine/bedrock-data run ' +
                'fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.'
        );
    }
    const registries = data.loadJavaWorldgenRegistries(found);

    const candidates: Array<StructureChunk & { offsetX: number; offsetZ: number }> = [];
    for (const [, document] of registries.structureSets) {
        const set = sets.parseStructureSet(document);
        // A ring placement is snapped to a biome after it is drawn, so its drawn chunks are not
        // where it starts; the first pass covers it.
        if (set.placement.type !== 'minecraft:random_spread') continue;

        const chunks = sets.structureSetCandidates(set.placement, BigInt(SEED), {
            minChunkX: -WINDOW_CHUNKS,
            minChunkZ: -WINDOW_CHUNKS,
            maxChunkX: WINDOW_CHUNKS,
            maxChunkZ: WINDOW_CHUNKS
        });
        for (const chunk of chunks) {
            for (const { structure } of set.structures) {
                candidates.push({
                    structure,
                    chunkX: chunk.x,
                    chunkZ: chunk.z,
                    offsetX: set.placement.locateOffset[0],
                    offsetZ: set.placement.locateOffset[2]
                });
            }
        }
    }
    return { structures: [...registries.structures.keys()].sort(), candidates };
};

/** A running Java server that answers one console command at a time. */
const startServer = async (dir: string) => {
    const server = spawn(java, ['-Xmx3G', '-jar', jar, 'nogui'], { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] });
    let pending: ((line: string) => void) | undefined;
    let buffered = '';
    let ready: (() => void) | undefined;
    server.stdout.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8');
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
            const line = buffered.slice(0, newline);
            buffered = buffered.slice(newline + 1);
            if (line.includes('Done (')) ready?.();
            // `/locate` answers with exactly one of these two lines.
            if (/System chat: (The nearest|Could not find)/.test(line)) pending?.(line);
            newline = buffered.indexOf('\n');
        }
    });
    await new Promise<void>((done, failed) => {
        ready = done;
        server.once('exit', (code) => failed(new Error(`the Java server exited with ${code} before it was ready`)));
    });

    return {
        /** Where the nearest start of a structure is from a block position, or undefined for none. */
        locate: (structure: string, x: number, z: number): Promise<{ x: number; z: number } | undefined> =>
            new Promise((answered) => {
                pending = (line) => {
                    pending = undefined;
                    const match = /is at \[(-?\d+), [^,]+, (-?\d+)\]/.exec(line);
                    answered(match === null ? undefined : { x: Number(match[1]), z: Number(match[2]) });
                };
                server.stdin.write(`execute positioned ${x} 0 ${z} run locate structure ${structure}\n`);
            }),
        stop: async (): Promise<void> => {
            server.stdin.end('stop\n');
            await new Promise((stopped) => server.once('exit', stopped));
        }
    };
};

const keyOf = (chunk: StructureChunk): string => `${chunk.structure}@${chunk.chunkX},${chunk.chunkZ}`;
const byKey = (left: StructureChunk, right: StructureChunk): number => keyOf(left).localeCompare(keyOf(right), 'en');

const dir = mkdtempSync(join(tmpdir(), 'jsp-java-structure-starts-'));
try {
    const { structures, candidates } = await questions();

    writeFileSync(join(dir, 'eula.txt'), 'eula=true\n');
    writeFileSync(
        join(dir, 'server.properties'),
        [
            `level-seed=${SEED}`,
            'online-mode=false',
            `server-port=${freePort}`,
            'server-ip=127.0.0.1',
            'sync-chunk-writes=false'
        ].join('\n') + '\n'
    );
    const server = await startServer(dir);

    const starts = new Map<string, StructureChunk>();
    const absent = new Map<string, StructureChunk>();
    try {
        for (const [x, z] of POSITIONS) {
            for (const structure of structures) {
                const at = await server.locate(structure, x, z);
                if (at === undefined) continue;
                const start = { structure, chunkX: at.x >> 4, chunkZ: at.z >> 4 };
                starts.set(keyOf(start), start);
            }
        }
        console.error(`First pass: ${starts.size} starts from ${POSITIONS.length} positions`);

        for (const { offsetX, offsetZ, ...chunk } of candidates) {
            const at = await server.locate(chunk.structure, chunk.chunkX * 16 + offsetX, chunk.chunkZ * 16 + offsetZ);
            const here =
                at !== undefined && (at.x - offsetX) >> 4 === chunk.chunkX && (at.z - offsetZ) >> 4 === chunk.chunkZ;
            if (here) starts.set(keyOf(chunk), chunk);
            else absent.set(keyOf(chunk), chunk);
        }
        console.error(`Second pass: ${candidates.length} candidates asked`);
    } finally {
        await server.stop();
    }

    const golden: JavaStructureStarts = {
        provenance: {
            edition: 'java',
            version: javaServerCacheFolder,
            seed: SEED,
            dimension: 'minecraft:overworld',
            source: 'pnpm --filter @jsprismarine/parity run capture:java-structure-starts'
        },
        starts: [...starts.values()].sort(byKey),
        absent: [...absent.values()].filter((chunk) => !starts.has(keyOf(chunk))).sort(byKey)
    };
    const path = join(repoRoot.pathname, JAVA_STRUCTURE_STARTS_PATH);
    writeFileSync(path, `${JSON.stringify(golden, null, 4)}\n`);
    console.error(
        `Wrote ${JAVA_STRUCTURE_STARTS_PATH}: ${golden.starts.length} starts, ${golden.absent.length} absences`
    );
} finally {
    await vite.close();
    rmSync(dir, { recursive: true, force: true });
}
