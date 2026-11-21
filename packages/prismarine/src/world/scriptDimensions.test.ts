/**
 * A dimension a script registers with `StartupEvent.dimensionRegistry` (#3624, #3291): a void
 * dimension with the Overworld's bounds, as the `custom-dimensions` parity scenario recorded on
 * BDS, which the scripts register again each time the level opens and each reload. Unlike BDS, a
 * reload adds a new one and drops one it no longer registers.
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

/** The dimension numbers the save keeps, read before the level opens, as the world manager reads them. */
const savedNumbers = async (server: Server) => {
    const provider = new LevelDB(scratch, server);
    provider.setLevel({ name: 'dimensions', seed: 1234n });
    await provider.enable();
    try {
        return (await provider.readWorldData())?.dimensionNumbers;
    } finally {
        await provider.disable();
    }
};

const openLevel = async (): Promise<Level> => {
    const server: Server = Object.assign(testEntityServer(), {
        getConfig: () => stub<Config>({ getPreloadRadius: () => 0 })
    });
    const dimensionNumbers = await savedNumbers(server);
    const level = testLevel({
        name: 'dimensions',
        path: scratch,
        server,
        ...(dimensionNumbers === undefined ? {} : { dimensionNumbers }),
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

    it('is added by a reload too, and dropped by one that does not register it', async () => {
        const level = await openLevel();
        try {
            level.registerScriptDimension('jsp:void');
            expect(level.settleScriptDimensions(['jsp:void'])).toEqual({ added: ['jsp:void'], removed: [], kept: [] });

            // The reload registers a new dimension and not the old one.
            expect(level.registerScriptDimension('jsp:new')).toBe('registered');
            expect(level.settleScriptDimensions(['jsp:new'])).toEqual({
                added: ['jsp:new'],
                removed: ['jsp:void'],
                kept: []
            });
            expect([...level.getStems().keys()]).toContain('jsp:new');
            expect([...level.getStems().keys()]).not.toContain('jsp:void');
            expect(level.dimensionTypeOf('jsp:new').bedrockId).toBe(FIRST_CUSTOM_DIMENSION_ID + 1);
        } finally {
            await level.disable();
        }
    });

    it('saves and closes the world of a dimension a reload drops, and builds it anew when registered again', async () => {
        const level = await openLevel();
        try {
            level.registerScriptDimension('jsp:void');
            level.settleScriptDimensions(['jsp:void']);
            const before = await level.world('jsp:void');

            level.settleScriptDimensions([]);
            level.registerScriptDimension('jsp:void');
            level.settleScriptDimensions(['jsp:void']);
            const after = await level.world('jsp:void');

            expect(after).not.toBe(before);
            expect(level.dimensionTypeOf('jsp:void').bedrockId).toBe(FIRST_CUSTOM_DIMENSION_ID);
        } finally {
            await level.disable();
        }
    });

    it('keeps its id from one start to the next, whatever order the scripts register in', async () => {
        const first = await openLevel();
        try {
            first.registerScriptDimension('jsp:a');
            first.registerScriptDimension('jsp:b');
            first.registerScriptDimension('jsp:gone');
            first.settleScriptDimensions(['jsp:a', 'jsp:b', 'jsp:gone']);
            await first.saveLevelData();
        } finally {
            await first.disable();
        }

        const second = await openLevel();
        try {
            second.registerScriptDimension('jsp:b');
            second.registerScriptDimension('jsp:new');
            second.registerScriptDimension('jsp:a');
            second.settleScriptDimensions(['jsp:b', 'jsp:new', 'jsp:a']);

            const ids = ['jsp:a', 'jsp:b', 'jsp:new'].map((id) => second.dimensionTypeOf(id).bedrockId);
            // jsp:new never takes jsp:gone's id, which the gone dimension's chunks are under.
            expect(ids).toEqual([
                FIRST_CUSTOM_DIMENSION_ID,
                FIRST_CUSTOM_DIMENSION_ID + 1,
                FIRST_CUSTOM_DIMENSION_ID + 3
            ]);
        } finally {
            await second.disable();
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
