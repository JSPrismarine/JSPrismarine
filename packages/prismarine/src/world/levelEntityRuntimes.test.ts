/**
 * Two levels on one booted server, each with an Overworld.
 *
 * The entity runtime holds the store whose change log carries a world's block writes, and each
 * world hears its own ticks seal there and installs its own inverse writer on it. When the
 * runtime was keyed by dimension alone, both Overworlds shared one: a block placed in one level
 * reached the other's change sink, a mob spawned in one walked the other's chunks, and an undo
 * in one was answered first by the other's writer.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import Server from '../Server';
import { Config } from '../config/Config';
import type { UnitOutcome } from '../entity/data/EntityStore';
import { stubRakNetListener } from '../testing/rakNetListener.test.helper';
import type { ChangeEntry } from './changelog/ChangeEntry';
import type { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

stubRakNetListener();

const DEFAULT_LEVEL = 'alpha';
const OTHER_LEVEL = 'beta';

/** Two flat levels, so neither waits on noise generation. */
const twoLevelConfig = () =>
    new (class TwoLevelConfig extends Config {
        public override async enable() {}
        public override getServerIp() {
            return '0.0.0.0';
        }
        public override getLevelName() {
            return DEFAULT_LEVEL;
        }
        public override getWorlds() {
            return {
                [DEFAULT_LEVEL]: { preset: 'minecraft:flat', provider: 'LevelDB', seed: 1 },
                [OTHER_LEVEL]: { preset: 'minecraft:flat', provider: 'LevelDB', seed: 2 }
            };
        }
        public override getPreloadRadius() {
            return 0;
        }
        public override getMaxPlayers() {
            return 1;
        }
        public override getGamemode() {
            return 'creative';
        }
        public override getMotd() {
            return 'CI';
        }
        public override getViewDistance() {
            return 4;
        }
        public override getOnlineMode() {
            return false;
        }
        public override getEnableTicking() {
            return false;
        }
        public override getEnableProcessTitle() {
            return false;
        }
    })();

/** A behavior pack declaring the one mob the spawn case needs. */
const writeBehaviorPack = (at: string): void => {
    const files: Record<string, unknown> = {
        'manifest.json': {
            format_version: 2,
            header: {
                name: 'levelfixture',
                uuid: '2f3c1f00-0000-4000-8000-0000000000b2',
                version: [1, 0, 0],
                min_engine_version: [1, 26, 50]
            },
            modules: [{ type: 'data', uuid: '2f3c1f00-0000-4000-8001-0000000000b2', version: [1, 0, 0] }]
        },
        'entities/pig.json': {
            format_version: '1.21.0',
            'minecraft:entity': {
                description: { identifier: 'minecraft:pig', is_spawnable: true, is_summonable: true },
                components: {
                    'minecraft:health': { value: 10, max: 10 },
                    'minecraft:type_family': { family: ['pig', 'mob'] }
                }
            }
        }
    };
    for (const [relative, data] of Object.entries(files)) {
        const absolute = path.join(at, ...relative.split('/'));
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, JSON.stringify(data));
    }
};

/** The block field entries of one sealed tick. */
const blockWrites = (entries: readonly ChangeEntry[]) =>
    entries.filter((entry) => entry.kind === 'field' && entry.field === 'block');

describe('two levels that share a dimension', () => {
    let root: string;
    let server: Server;
    let alpha: World;
    let beta: World;
    /** What each Overworld's change sink was handed, by level. */
    const sunk = new Map<World, ChangeEntry[]>();
    let previousDir: string | undefined;

    /** Runs one tick of each world's change log around `work`, as `Level.update` would. */
    const tick = (work: () => void): void => {
        for (const world of [alpha, beta]) world.getEntityStore().beginTick();
        try {
            work();
        } finally {
            for (const world of [alpha, beta]) world.getEntityStore().sealTick();
        }
    };

    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-two-levels-'));
        writeBehaviorPack(path.join(root, 'behaviorpack'));
        writeFileSync(
            path.join(root, 'config.json'),
            `${JSON.stringify({
                'content-strict': false,
                'content-world-packs': [path.join(root, 'behaviorpack')],
                'content-datapacks': []
            })}\n`
        );
        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;

        server = new Server({ logger: new Logger(), config: twoLevelConfig(), headless: true });
        vi.spyOn(server, 'shutdown').mockResolvedValue(undefined);
        // Port 0, so the OS picks a free one and two checkouts running this file at once do not
        // collide (#3000).
        await server.bootstrap('127.0.0.1', 0);

        const manager = server.getWorldManager();
        alpha = manager.getDefaultWorld();
        const other = manager.getWorldByName(OTHER_LEVEL);
        if (other === null) throw new Error(`level ${OTHER_LEVEL} loaded no Overworld`);
        beta = other;
        await alpha.getChunkAt(0, 0);
        await beta.getChunkAt(0, 0);

        for (const world of [alpha, beta]) {
            const entries: ChangeEntry[] = [];
            sunk.set(world, entries);
            world.attachChangeSink({
                ...NULL_WORLD_CHANGE_SINK,
                tickSealed: (sealed) => void entries.push(...sealed.entries)
            });
        }
    }, 120_000);

    afterAll(async () => {
        await alpha?.getProvider().disable();
        await beta?.getProvider().disable();
        rmSync(root, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
    });

    it('gives each level its own entity runtime and store', () => {
        expect(alpha.getDimension().name).toBe(beta.getDimension().name);
        expect(beta.dataEntities()).not.toBe(alpha.dataEntities());
        expect(beta.getEntityStore()).not.toBe(alpha.getEntityStore());
    });

    it('logs a block write in one level and hands it to that level’s sink only', () => {
        for (const entries of sunk.values()) entries.length = 0;

        tick(() => {
            expect(beta.setBlockByName(3, 70, 3, 'minecraft:stone')).toBe(true);
        });

        expect(blockWrites(sunk.get(beta) ?? [])).toHaveLength(1);
        expect(blockWrites(sunk.get(alpha) ?? [])).toHaveLength(0);
        expect(
            alpha
                .getEntityStore()
                .lastSealed()
                ?.entries.filter((entry) => entry.kind === 'field')
        ).toEqual([]);
        expect(beta.loadedBlockAt(3, 70, 3)?.name).toBe('minecraft:stone');
        expect(alpha.loadedBlockAt(3, 70, 3)?.name).toBe('minecraft:air');
    });

    it('writes a block placed through the content block world into the level it names', () => {
        const dimension = beta.getDimension().name;
        const blocks = server.getContent().world.blockWorld;

        tick(() => {
            blocks.at(dimension, OTHER_LEVEL).setBlock({ x: 4, y: 70, z: 4 }, 'minecraft:stone');
            blocks.at(dimension, DEFAULT_LEVEL).setBlock({ x: 5, y: 70, z: 5 }, 'minecraft:stone');
        });

        expect(beta.loadedBlockAt(4, 70, 4)?.name).toBe('minecraft:stone');
        expect(alpha.loadedBlockAt(4, 70, 4)?.name).toBe('minecraft:air');
        expect(alpha.loadedBlockAt(5, 70, 5)?.name).toBe('minecraft:stone');
        expect(beta.loadedBlockAt(5, 70, 5)?.name).toBe('minecraft:air');
    });

    it('spawns a mob into the level that asked for it', () => {
        const spawned = beta.dataEntities().runtime.spawn('minecraft:pig', { x: 5.5, y: 70, z: 5.5 });
        if (spawned === undefined) throw new Error('the pig did not spawn');

        expect(beta.dataEntities().runtime.byId(spawned.id)).toBe(spawned);
        expect(alpha.dataEntities().runtime.byId(spawned.id)).toBeUndefined();
        expect(beta.dataEntities().actors.actorOf(spawned.id)?.getWorld()).toBe(beta);
        expect(alpha.getActors().some((actor) => actor.getType() === 'minecraft:pig')).toBe(false);
    });

    it('undoes a block write in the level that made it and leaves the other level’s chunk', () => {
        tick(() => {
            expect(alpha.setBlockByName(7, 70, 7, 'minecraft:gold_block')).toBe(true);
        });
        for (const entries of sunk.values()) entries.length = 0;

        let outcome: UnitOutcome | undefined;
        tick(() => {
            outcome = beta.getEntityStore().unit(() => {
                beta.setBlockByName(7, 70, 7, 'minecraft:stone');
                throw new Error('the unit fails after its write');
            });
        });

        expect(outcome?.failed).toBe(true);
        expect(beta.loadedBlockAt(7, 70, 7)?.name).toBe('minecraft:air');
        expect(alpha.loadedBlockAt(7, 70, 7)?.name).toBe('minecraft:gold_block');
        expect(beta.getEntityStore().broken).toBeUndefined();
        expect(alpha.getEntityStore().broken).toBeUndefined();
        expect(blockWrites(sunk.get(alpha) ?? [])).toHaveLength(0);
    });
});
