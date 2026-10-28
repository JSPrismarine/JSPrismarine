import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Item as ItemEntity } from '../entity/other/Item';
import { Item } from '../item/Item';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import LevelDB from './providers/leveldb/LevelDB';
import { World } from './World';

const LEGACY_ITEM_COUNT = 1744;
const NEXT_DROP_COUNT = World.ITEM_ENTITY_LIMIT - LEGACY_ITEM_COUNT + 1;

let scratch: string;
let previousDirectory: string | undefined;

const testServer = (warnings: string[]): Server =>
    stub<Server>({
        getLogger: () =>
            stub<Logger>({
                info: () => {},
                warn: (message: string) => warnings.push(message),
                error: () => {},
                debug: () => {},
                verbose: () => {}
            }),
        getConfig: () => stub({ getPreloadRadius: () => 0 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });

const generator: Generator = {
    generateChunk: async (x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
};

beforeEach(() => {
    previousDirectory = process.env.JSP_DIR;
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-persistence-'));
    process.env.JSP_DIR = scratch;
});

afterEach(() => {
    if (previousDirectory === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDirectory;

    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('world persistence', () => {
    it('does not count legacy level.json item snapshots against the live drop limit', async () => {
        const name = 'legacy-items';
        const folder = path.join(scratch, 'worlds', name);
        fs.mkdirSync(folder, { recursive: true });

        const levelPath = path.join(folder, 'level.json');
        fs.writeFileSync(
            levelPath,
            JSON.stringify({
                spawn: { x: 0, y: 64, z: 0 },
                gameRules: [],
                weather: {
                    clearWeatherTime: 0,
                    rainTime: 0,
                    thunderTime: 0,
                    raining: false,
                    thundering: false
                },
                entities: Array.from({ length: LEGACY_ITEM_COUNT }, (_, index) => ({
                    type: 'minecraft:item',
                    position: { x: index, y: 64, z: 0 }
                }))
            })
        );

        const warnings: string[] = [];
        const server = testServer(warnings);
        const provider = new LevelDB(folder, server);
        const world = new World({ name, path: folder, server, provider, seed: 1234n, generator });

        try {
            await world.enable();
            await world.dropContents(
                new Vector3(0, 64, 0),
                Array.from(
                    { length: NEXT_DROP_COUNT },
                    () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 })
                )
            );

            expect(warnings).toEqual([]);
            expect(world.getEntities().filter((entity) => entity instanceof ItemEntity)).toHaveLength(NEXT_DROP_COUNT);
            expect(fs.existsSync(levelPath)).toBe(false);

            await world.saveLevelData();

            expect(fs.existsSync(levelPath)).toBe(false);
            expect(await provider.readWorldData()).toMatchObject({
                spawn: { x: 0, y: 64, z: 0 },
                gameRules: expect.any(Array),
                weather: {
                    clearWeatherTime: 0,
                    rainTime: 0,
                    thunderTime: 0,
                    raining: false,
                    thundering: false
                }
            });
        } finally {
            await world.disable();
        }
    });
});
