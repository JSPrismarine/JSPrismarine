/**
 * A dimension a script registers with `StartupEvent.dimensionRegistry` (#3624, #3291): a void
 * dimension with the Overworld's bounds, which the level has until it closes and the scripts
 * register again when it opens, as the `custom-dimensions` parity scenario recorded on BDS.
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
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID } from './DimensionType';
import type { Level } from './Level';
import LevelDB from './providers/leveldb/LevelDB';

let scratch: string;

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-script-dimensions-'));
});

afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

const openLevel = async (): Promise<Level> => {
    const server: Server = Object.assign(testEntityServer(), {
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0 })
    });
    const level = testLevel({
        name: 'dimensions',
        path: scratch,
        server,
        provider: new LevelDB(scratch, server),
        generator: { generateChunk: async (x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld) },
        spawn: new Vector3(0, 64, 0)
    });
    await level.enable();
    return level;
};

describe('a dimension a script registers', () => {
    it('is a void dimension with the Overworld’s bounds and the first custom id', async () => {
        const level = await openLevel();
        try {
            expect(level.registerScriptDimension('jsp:void')).toBe('registered');

            const type = level.dimensionTypeOf('jsp:void');
            expect(type).toMatchObject({ bedrockName: 'jsp:void', bedrockId: FIRST_CUSTOM_DIMENSION_ID, custom: true });
            expect({ min: type.minY, max: type.minY + type.height }).toEqual({ min: -64, max: 320 });
            expect(level.getStems().get('jsp:void')?.generator.type).toBe('jsprismarine:void');
            // The client hears of it when it joins.
            expect(level.customDimensionDefinitions().map((definition) => definition.dimensionType)).toEqual([
                FIRST_CUSTOM_DIMENSION_ID
            ]);
        } finally {
            await level.disable();
        }
    });

    it('is registered again by a reload, which cannot add a new one', async () => {
        const level = await openLevel();
        try {
            level.registerScriptDimension('jsp:void');
            level.sealScriptDimensions();

            expect(level.registerScriptDimension('jsp:void')).toBe('registered');
            expect(level.registerScriptDimension('jsp:new')).toBe('new-after-reload');
            expect([...level.getStems().keys()]).not.toContain('jsp:new');
        } finally {
            await level.disable();
        }
    });

    it('stays out of the save, so the next start opens without it until the scripts register it', async () => {
        const first = await openLevel();
        try {
            first.registerScriptDimension('jsp:void');
            await first.saveLevelData();
        } finally {
            await first.disable();
        }

        const second = await openLevel();
        try {
            expect([...second.getStems().keys()]).not.toContain('jsp:void');
            expect(second.registerScriptDimension('jsp:void')).toBe('registered');
            expect(second.dimensionTypeOf('jsp:void').bedrockId).toBe(FIRST_CUSTOM_DIMENSION_ID);
        } finally {
            await second.disable();
        }
    });
});
