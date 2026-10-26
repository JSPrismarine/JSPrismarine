import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { DATA_ENTITY_TAG, dataEntityRecordIn, dataEntityRecordOf, writeDataEntityRecord } from './persistence';
import { entityFixture, FLOOR_Y } from './testing';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A compound carrying one entity's record, the way a saved actor does. */
const written = (record: ReturnType<typeof dataEntityRecordOf>): NBTTagCompound => {
    const nbt = new NBTTagCompound('');
    nbt.addValue('UniqueID', new Types.LongVal(7n));
    writeDataEntityRecord(nbt, record);
    return nbt;
};

describe('the data entity record', () => {
    it('carries the component groups, properties, attributes and body state', () => {
        const { runtime } = entityFixture();
        const hatchling = runtime.spawn('jsprismarine:hatchling', GROUND);
        if (hatchling === undefined) throw new Error('the fixture declares no jsprismarine:hatchling');

        hatchling.instance.attributes.set('health', 1);
        hatchling.body.carried = 'minecraft:wheat';
        hatchling.body.sitting = true;
        hatchling.body.loveTicks = 300;
        hatchling.body.fuseTicks = 41;

        const record = dataEntityRecordOf(hatchling, 'animal');

        expect(record).toMatchObject({
            identifier: 'jsprismarine:hatchling',
            pool: 'animal',
            componentGroups: ['hatched'],
            attributes: { health: 1 },
            carried: 'minecraft:wheat',
            sitting: true,
            loveTicks: 300,
            fuseTicks: 41
        });
    });

    it('reads back what it wrote, leaving the actor’s other tags alone', () => {
        const { runtime } = entityFixture();
        const cow = runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });
        if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
        cow.instance.attributes.set('health', 6);

        const nbt = written(dataEntityRecordOf(cow, 'animal'));

        expect(dataEntityRecordIn(nbt)).toEqual(dataEntityRecordOf(cow, 'animal'));
        expect(nbt.getLong('UniqueID', 0n)).toBe(7n);
    });

    it('restores entity-specific spawn data from the saved record', () => {
        const { runtime } = entityFixture();
        const data = { variant: 'warm', fuse: 37 };
        const original = runtime.spawn('minecraft:cow', GROUND, { data });
        if (original === undefined) throw new Error('the fixture declares no minecraft:cow');
        const record = dataEntityRecordIn(written(dataEntityRecordOf(original, undefined)));
        if (record === undefined) throw new Error('the cow record could not be read back');

        const restored = runtime.restore(record, GROUND);

        expect(restored?.spawnData).toEqual(data);
    });

    it('reports no record for an actor the written classes saved', () => {
        const nbt = new NBTTagCompound('');
        nbt.addValue('identifier', new Types.StringVal('minecraft:item'));

        expect(dataEntityRecordIn(nbt)).toBeUndefined();
    });

    it('refuses a tag that is not this server’s record rather than throwing', () => {
        const unparseable = new NBTTagCompound('');
        unparseable.addValue(DATA_ENTITY_TAG, new Types.StringVal('{not json'));

        const nameless = new NBTTagCompound('');
        nameless.addValue(DATA_ENTITY_TAG, new Types.StringVal('{"yaw":90}'));

        expect(dataEntityRecordIn(unparseable)).toBeUndefined();
        expect(dataEntityRecordIn(nameless)).toBeUndefined();
    });

    it('fills in a default for every field an older record left out', () => {
        const partial = new NBTTagCompound('');
        partial.addValue(DATA_ENTITY_TAG, new Types.StringVal('{"identifier":"minecraft:cow"}'));

        expect(dataEntityRecordIn(partial)).toEqual({
            identifier: 'minecraft:cow',
            componentGroups: [],
            properties: {},
            attributes: {},
            yaw: 0,
            pitch: 0,
            inventory: [],
            sitting: false,
            sleeping: false,
            loveTicks: 0,
            breedCooldown: 0
        });
    });
});
