/**
 * What the scripts and `/tickingarea` set on a level outlasts a restart, as on BDS (#3316): the
 * ticking areas, the overworld clock's markers and pause, `world.allowCheats` and the
 * `playerWaypoints` game rule are saved in the level's record and read back when it opens.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Server from '../Server';
import { testEntityServer } from '../testing/entityServer';
import { testLevel } from '../testing/level';
import { stub } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import type { Level } from './Level';
import LevelDB from './providers/leveldb/LevelDB';

let scratch: string;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-level-script-settings-'));
});

afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

const testServer = (): Server =>
    Object.assign(testEntityServer(), {
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0 })
    });

/** A level over the scratch folder, with no Nether, so an area there builds no world. */
const openLevel = async (): Promise<Level> => {
    const server = testServer();
    const level = testLevel({
        name: 'settings',
        path: scratch,
        server,
        provider: new LevelDB(scratch, server),
        generator: { generateChunk: async (x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld) },
        spawn: new Vector3(0, 64, 0)
    });
    await level.enable();
    return level;
};

const AREA = {
    name: 'home',
    owner: 'command',
    dimension: 'minecraft:the_nether',
    chunks: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 }
} as const;

describe('a level’s script settings and ticking areas', () => {
    it('come back after the level closes and opens again', async () => {
        const first = await openLevel();
        try {
            expect(first.getTickingAreas().add(AREA)).toBe(true);
            expect(first.getTickingAreas().setPreload('command', 'home', true)).toBe(true);
            first.getTickingAreas().add({ ...AREA, name: 'gone', owner: 'script' });
            const settings = first.getScriptSettings();
            settings.allowCheats = false;
            settings.playerWaypoints = 'Off';
            settings.timeMarkers.push({ name: 'dawn', time: 0, period: 24_000 });
            first.setDayTimePaused(true);
            await first.saveLevelData();

            // An area removed after a save is gone from the next one, not brought back by the record.
            first.getTickingAreas().remove('script', 'gone');
            await first.saveLevelData();
        } finally {
            await first.disable();
        }

        const second = await openLevel();
        try {
            expect(second.getTickingAreas().all()).toEqual([{ ...AREA, preload: true }]);
            expect(second.getScriptSettings().saved()).toEqual({
                allowCheats: false,
                playerWaypoints: 'Off',
                timeMarkers: [{ name: 'dawn', time: 0, period: 24_000 }]
            });
            expect(second.isDayTimePaused()).toBe(true);
        } finally {
            await second.disable();
        }
    });

    it('start from a new world’s defaults on a save that has none', async () => {
        const level = await openLevel();
        try {
            expect(level.getTickingAreas().all()).toEqual([]);
            expect(level.getScriptSettings().saved()).toEqual({
                allowCheats: true,
                playerWaypoints: 'Everyone',
                timeMarkers: []
            });
            expect(level.isDayTimePaused()).toBe(false);
        } finally {
            await level.disable();
        }
    });
});
