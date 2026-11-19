/**
 * Script dynamic properties and scoreboards against the pinned Bedrock Dedicated Server (BDS), in
 * both directions.
 *
 * One pack, `compat/persistence`, runs on each server in turn. It reads what the last server
 * saved, logs it, and writes the next generation of every value: the world's properties, an
 * armor stand's properties, and the `compat` objective's scores, its stand included, and sidebar.
 *
 * 1. BDS starts a new flat world and writes generation 1.
 * 2. JSPrismarine loads that world, must read generation 1 as the pack wrote it, and saves
 *    generation 2.
 * 3. BDS loads the world JSPrismarine saved and must read generation 2.
 *
 * It boots BDS twice, so it runs only when asked: `JSP_BEDROCK_SERVER_TESTS=1`, with the pinned
 * server fetched by `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`, and the script
 * host's library built (`pnpm --filter @jsprismarine/script-host run build:native`).
 *
 * ```sh
 * JSP_BEDROCK_SERVER_TESTS=1 pnpm exec vitest run packages/parity/src/scripting/persistenceCompat.test.ts
 * ```
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { scriptHostAvailable } from '../../../script-host/src/testing/library.test-utils.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stageBehaviorPacks } from '../../../bedrock-data/utils/bedrock-dump/pack.ts';
import { spawnProbe } from '../../../bedrock-data/utils/bedrock-dump/probe.ts';
import { launcherForHost } from '../../../bedrock-data/utils/bedrock-dump/runner.ts';
import {
    READY_LINE,
    SERVER_BINARY,
    stageServer,
    startServer
} from '../../../bedrock-data/utils/bedrock-dump/server.ts';
import { bedrockServerPath } from '../../../bedrock-data/utils/fetch/bds.ts';
import { cacheRoot } from '../../../bedrock-data/utils/fetch/paths.ts';
import { readScenarioPackIdentity } from './scenarios.ts';
import { runPacksOnHeadlessServer } from './jspHost.ts';

const enabled = process.env.JSP_BEDROCK_SERVER_TESTS === '1';

/** Budgets for a native run; a container that emulates x86-64 multiplies them. */
const BOOT_MS = 600_000;
const RUN_MS = 600_000;
const STOP_MS = 120_000;
const STEP_MS = 40 * 60_000;

const PACK = join(import.meta.dirname, '..', '..', 'compat', 'persistence');

/** What the pack logs as it reads. */
const READ_LINE = /COMPAT read (\{.*\})/;

/** The line the pack logs once it has written its generation. */
const WRITTEN_LINE = 'COMPAT written';

/** What a run of the pack reads after the run before it wrote generation `gen`. */
const generation = (gen: number) => ({
    gen,
    world: {
        'jsp:bool': gen % 2 === 1,
        'jsp:gen': gen,
        [`jsp:only${gen}`]: gen,
        'jsp:str': `generation ${gen} é😀`,
        'jsp:vec': { x: gen, y: Math.fround(0.1), z: -gen }
    },
    stand: { 'jsp:e': gen * 10, 'jsp:ev': { x: 1, y: gen, z: 3 } },
    objective: {
        displayName: 'Compat',
        scores: [
            { type: 'FakePlayer', name: 'counter', score: gen * 100, isStand: false },
            { type: 'Entity', name: 'the stand', score: gen, isStand: true }
        ]
    },
    sidebar: { objective: 'compat', sortOrder: gen % 2 === 1 ? 1 : 0 }
});

/** The pack's read, from the lines a server logged. */
const readOf = (lines: readonly string[]): unknown => {
    for (const line of lines) {
        const found = READ_LINE.exec(line);
        if (found?.[1] !== undefined) return JSON.parse(found[1]);
    }
    throw new Error(`The pack logged no read:\n${lines.slice(-30).join('\n')}`);
};

describe.skipIf(!enabled || !scriptHostAvailable())(
    'dynamic properties and scoreboards against the pinned Bedrock Dedicated Server',
    { tags: ['bedrock-server'] },
    () => {
        const scratch = mkdtempSync(join(tmpdir(), 'jsp-persistence-bds-'));
        afterAll(() => rmSync(scratch, { recursive: true, force: true }));

        /** Runs the pack on BDS, from `world` or a new flat world, and keeps the world it saved. */
        const runOnBds = async (keep: string, world?: string): Promise<readonly string[]> => {
            const unpacked = await bedrockServerPath();
            if (!existsSync(join(unpacked, SERVER_BINARY))) {
                throw new Error(
                    `No Bedrock Dedicated Server at ${unpacked}. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\`.`
                );
            }
            const launcher = launcherForHost(spawnProbe);
            launcher.ensureImage();
            const scale = launcher.timeoutScale;
            const staged = await stageServer({
                unpacked,
                // Its own run directory, so this never stages over a capture's.
                root: join(cacheRoot, 'bds-run', `${basename(dirname(unpacked))}-persistence`),
                levelName: 'jsp-persistence',
                properties: { 'level-type': 'FLAT', 'server-port': '29252', 'server-portv6': '29253' }
            });
            if (world !== undefined) {
                rmSync(staged.worldDirectory, { recursive: true, force: true });
                cpSync(world, staged.worldDirectory, { recursive: true });
            }
            await stageBehaviorPacks(staged.root, staged.worldDirectory, [
                { ...readScenarioPackIdentity(PACK), source: PACK, directory: 'jsp-persistence-compat' }
            ]);
            const server = startServer({ ...launcher.launch(staged.root), cwd: staged.root });
            try {
                await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', BOOT_MS * scale);
                await server.waitForLine((line) => line.includes(WRITTEN_LINE), 'the written line', RUN_MS * scale);
                expect(await server.stop(STOP_MS * scale)).toBe(0);
            } finally {
                // stop() returns at once when the server has already exited.
                await server.stop(STOP_MS * scale);
                launcher.cleanup();
            }
            cpSync(staged.worldDirectory, keep, { recursive: true });
            return server.lines;
        };

        let first: unknown;
        let jsp: unknown;
        let back: unknown;

        // Each step boots a server and runs the pack to its write, minutes on BDS, so the three run
        // here, one after another, and the test reads what each read.
        beforeAll(async () => {
            const fromBds = join(scratch, 'bds');
            first = readOf(await runOnBds(fromBds));

            const fromJsp = join(scratch, 'jsp');
            jsp = readOf(
                await runPacksOnHeadlessServer({
                    packDirectories: [PACK],
                    world: fromBds,
                    keepWorld: fromJsp,
                    ended: (lines) => lines.some((line) => line.includes(WRITTEN_LINE))
                })
            );

            back = readOf(await runOnBds(join(scratch, 'back'), fromJsp));
        }, STEP_MS);

        it('reads on JSPrismarine what a BDS script saved, and BDS reads what a JSPrismarine script saved', () => {
            expect(first).toEqual({ gen: 0, world: {}, stand: null, objective: null, sidebar: null });
            expect(jsp).toEqual(generation(1));
            expect(back).toEqual(generation(2));
        });
    }
);
