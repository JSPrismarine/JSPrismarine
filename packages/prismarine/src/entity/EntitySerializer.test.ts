import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { Dimensions } from '../world/DimensionType';
import { EntitySerializer } from './EntitySerializer';
import { storeWorld } from '../testing/storeWorld.test.helper';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import { ItemActor } from './data/itemActor';
import type { LiveEntityRuntime } from './data/live';
import { dataEntityRecordIn, dataEntityRecordOf, writeDataEntityRecord } from './data/persistence';
import { INERT_ACTOR } from './data/storeActors';
import type { StoreActor } from './data/storeActors';

/** Loads an actor record as a save loads one no pack declares, and gives its actor. */
const loaded = (nbt: NBTTagCompound, { live } = storeWorld()): StoreActor => {
    const entity = live.restoreInert(EntitySerializer.fromNBT(nbt));
    const actor = entity === undefined ? undefined : live.actors.actorOf(entity.id);
    if (actor === undefined) throw new Error('the actor was not restored');
    return actor;
};

/** What a save writes for an actor record that was loaded. */
const roundTrip = (nbt: NBTTagCompound, at = storeWorld()): NBTTagCompound => EntitySerializer.toNBT(loaded(nbt, at));

const bytesOf = (compound: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(compound);
    return stream.getBuffer();
};

const floats = (values: number[]) => new Set(values.map((value) => new Types.FloatVal(value)));

const actor = (identifier: string, build: (root: NBTTagCompound) => void = () => {}) => {
    const root = new NBTTagCompound('');
    root.addValue('identifier', new Types.StringVal(identifier));
    root.addValue('Pos', floats([10.5, -60.25, -3.5]));
    root.addValue('Rotation', floats([90, 45]));
    root.addValue('OnGround', new Types.ByteVal(1));
    root.addValue('Fire', new Types.ShortVal(-20));
    build(root);
    return root;
};

const keysOf = (compound: NBTTagCompound) => [...compound.entries()].map(([key]) => key).sort();

describe('entity', () => {
    describe('EntitySerializer', () => {
        it('reads TNT with the fuse the data runtime starts it on', () => {
            const tnt = EntitySerializer.fromNBT(actor('minecraft:tnt'));

            expect(tnt.identifier).toBe('minecraft:tnt');
            expect(tnt.fuse).toBe(80);
        });

        it('reads any identifier, so an actor still says what it is', () => {
            // Every mob loads this way, because the runtime drives it through its components
            // and the record only has to say which mob it is.
            const cow = EntitySerializer.fromNBT(actor('minecraft:cow'));

            expect(cow.identifier).toBe('minecraft:cow');
            expect(cow.fuse).toBeUndefined();
        });

        it('restores the position, including below y=0', () => {
            expect(EntitySerializer.fromNBT(actor('minecraft:cow')).position).toEqual({ x: 10.5, y: -60.25, z: -3.5 });
        });

        it('restores the rotation', () => {
            const cow = EntitySerializer.fromNBT(actor('minecraft:cow'));

            expect(cow.yaw).toBe(90);
            expect(cow.pitch).toBe(45);
        });

        describe('an actor no loaded pack declares', () => {
            it('comes back as an inert store entity that says what it was saved as', () => {
                const at = storeWorld();
                const llama = loaded(actor('minecraft:llama'), at);

                expect(llama.entity.identifier).toBe(INERT_ACTOR);
                expect(llama.getType()).toBe('minecraft:llama');
                expect(llama.toString()).toContain('minecraft:llama');
                expect(llama.entity.position).toEqual({ x: 10.5, y: -60.25, z: -3.5 });
                expect([llama.yaw, llama.pitch]).toEqual([90, 45]);
            });

            it('saves the record it was loaded from unchanged, its data entity record included', () => {
                // Saved by a server whose pack declared the llama, and loaded by one whose does not.
                const at = storeWorld();
                const cow = at.live.runtime.spawn('minecraft:cow', { x: 0.5, y: 64, z: 0.5 });
                if (cow === undefined) throw new Error('the fixture declares no cow');
                const record = { ...dataEntityRecordOf(cow, undefined), identifier: 'minecraft:llama' };
                const saved = actor('minecraft:llama', (root) => writeDataEntityRecord(root, record));

                const llama = loaded(saved, at);
                at.live.persist();
                const written = EntitySerializer.toNBT(llama);

                expect(at.live.savedRecords().has(llama)).toBe(false);
                expect(dataEntityRecordIn(written)).toEqual(record);
                expect(keysOf(written)).toEqual(expect.arrayContaining(keysOf(saved)));
            });

            it('keeps a saved TNT primed, and writes its fuse back', () => {
                const tnt = loaded(actor('minecraft:tnt', (root) => root.addValue('JSPFuse', new Types.NumberVal(37))));

                expect(tnt.metadata.getPropertyValue(MetadataFlag.FUSE_TIME)).toBe(37);
                expect(EntitySerializer.toNBT(tnt).getNumber('JSPFuse', 0)).toBe(37);
            });
        });

        describe('a dropped stack', () => {
            /** The actor of a stack restored from its record. */
            const itemOf = (live: LiveEntityRuntime, nbt: NBTTagCompound): ItemActor | undefined => {
                const entity = live.restoreItem(EntitySerializer.fromNBT(nbt));
                const actor = entity === undefined ? undefined : live.actors.actorOf(entity.id);
                return actor instanceof ItemActor ? actor : undefined;
            };

            /**
             * An item actor as the legacy item entity saved one it had loaded: the tags it kept in
             * the order it read them, then the ones it rewrites.
             */
            const savedItem = () => {
                const root = new NBTTagCompound('');
                root.addValue('UniqueID', new Types.LongVal(-77n));
                root.addValue('Age', new Types.ShortVal(120));
                root.addValue('PickupDelay', new Types.ShortVal(27));
                root.addValue(
                    'Motion',
                    new Set([new Types.DoubleVal(-0.01), new Types.DoubleVal(0.1), new Types.DoubleVal(0.3)])
                );
                const stack = new NBTTagCompound('Item');
                stack.addValue('Name', new Types.StringVal('minecraft:stone'));
                stack.addValue('Count', new Types.ByteVal(2));
                stack.addValue('Damage', new Types.ShortVal(0));
                stack.addValue('JSPStack', new Types.StringVal(JSON.stringify({ name: 'minecraft:stone', count: 2 })));
                root.addValue('Item', stack);
                root.addValue('OnGround', new Types.ByteVal(1));
                root.addValue('FallDistance', new Types.FloatVal(0));
                root.addValue('Fire', new Types.ShortVal(0));
                root.addValue('Air', new Types.ShortVal(300));
                root.addValue('Invulnerable', new Types.ByteVal(0));
                root.addValue('identifier', new Types.StringVal('minecraft:item'));
                root.addValue('Pos', floats([10.5, -60.125, -3.5]));
                root.addValue('Rotation', floats([0, 0]));
                root.addValue('PortalCooldown', new Types.NumberVal(0));
                root.addValue('DimensionId', new Types.NumberVal(0));
                return root;
            };

            it('comes back as a store stack with its Bedrock fields', () => {
                const { live } = storeWorld();

                const item = itemOf(live, savedItem());

                expect(item?.entity.identifier).toBe('minecraft:item');
                expect(item?.getItem()?.getItem().getName()).toBe('minecraft:stone');
                expect(item?.getItem()?.getCount()).toBe(2);
                expect(item?.savedItem()).toMatchObject({ age: 120, pickupDelay: 27 });
                expect(item?.entity.position).toEqual({ x: 10.5, y: -60.125, z: -3.5 });
                expect(item?.entity.body.velocity).toEqual({ x: -0.01, y: 0.1, z: 0.3 });
            });

            it('saves the record it was loaded from byte for byte', () => {
                const { live } = storeWorld();
                const record = savedItem();
                const item = itemOf(live, record);
                if (item === undefined) throw new Error('the stack was not restored');

                // A save writes every entity's record first, and a stack's record is its own tags.
                live.persist();
                const written = EntitySerializer.toNBT(item);
                expect(bytesOf(written)).toEqual(bytesOf(record));

                // And again, from what this server wrote.
                const reloaded = itemOf(live, written);
                expect(reloaded === undefined ? undefined : bytesOf(EntitySerializer.toNBT(reloaded))).toEqual(
                    bytesOf(record)
                );
            });

            it('takes the definition pickup delay when the record has none, and refuses one with no stack', () => {
                const { live } = storeWorld();
                const withoutDelay = savedItem();
                withoutDelay.remove('PickupDelay');
                const withoutStack = savedItem();
                withoutStack.remove('Item');

                expect(itemOf(live, withoutDelay)?.savedItem()?.pickupDelay).toBe(10);
                expect(live.restoreItem(EntitySerializer.fromNBT(withoutStack))).toBe(undefined);
            });
        });

        it('writes the position and rotation back', () => {
            const written = roundTrip(actor('minecraft:cow'));

            expect([...(written.getList('Pos', false) ?? [])].map((v) => v.getValue())).toEqual([10.5, -60.25, -3.5]);
            expect([...(written.getList('Rotation', false) ?? [])].map((v) => v.getValue())).toEqual([90, 45]);
        });

        it('preserves projectile velocity through actor NBT', () => {
            const source = actor('minecraft:arrow', (root) => {
                root.addValue(
                    'Motion',
                    new Set([new Types.DoubleVal(1.25), new Types.DoubleVal(-0.5), new Types.DoubleVal(3)])
                );
            });

            const saved = roundTrip(source);
            const motion = saved.getList('Motion', false);

            expect(motion && [...motion].map((entry) => entry.getValue())).toEqual([1.25, -0.5, 3]);
            expect(saved.getString('identifier', '')).toBe('minecraft:arrow');
        });

        it('preserves a legacy TNT fuse through actor NBT', () => {
            const source = actor('minecraft:tnt', (root) => root.addValue('JSPFuse', new Types.NumberVal(37)));

            const written = roundTrip(source);

            expect(written.getNumber('JSPFuse', 0)).toBe(37);
            expect(EntitySerializer.fromNBT(written).fuse).toBe(37);
        });

        it('preserves a legacy falling block payload through actor NBT', () => {
            const source = actor('minecraft:falling_block', (root) =>
                root.addValue('JSPBlockName', new Types.StringVal('minecraft:stone'))
            );

            const saved = roundTrip(source);
            const restored = EntitySerializer.fromNBT(saved);

            expect(saved.getString('JSPBlockName', '')).toBe('minecraft:stone');
            expect(restored.persistentNbt?.getString('JSPBlockName', '')).toBe('minecraft:stone');
        });

        it('keeps three equal coordinates as three entries', () => {
            // A list of bare numbers in a Set would collapse [0, 0, 0] to one element, and the
            // entity would come back at a position two components short.
            const source = actor('minecraft:cow');
            source.addValue('Pos', floats([0, 0, 0]));

            const written = roundTrip(source);

            expect([...(written.getList('Pos', false) ?? [])]).toHaveLength(3);
        });

        describe('retained tags', () => {
            it('keeps the definitions list, without which an actor comes back broken', () => {
                const source = actor('minecraft:cow', (root) => {
                    root.addValue(
                        'definitions',
                        new Set([new Types.StringVal('+minecraft:cow'), new Types.StringVal('+minecraft:adult')])
                    );
                });

                const written = roundTrip(source);

                expect([...(written.getList('definitions', false) ?? [])].map((v) => v.getValue())).toEqual([
                    '+minecraft:cow',
                    '+minecraft:adult'
                ]);
            });

            it('keeps every tag it does not model', () => {
                const source = actor('minecraft:cow', (root) => {
                    root.addValue('UniqueID', new Types.LongVal(-1234567890123n));
                    root.addValue('Variant', new Types.NumberVal(3));
                    root.addValue('Tags', new Set([new Types.StringVal('named')]));
                    root.addValue('SomeFutureField', new Types.StringVal('kept'));
                });

                const written = roundTrip(source);

                // A superset, not an equal set: writing also fills in the fields every vanilla
                // actor carries. What matters is that nothing was dropped.
                expect(keysOf(written)).toEqual(expect.arrayContaining(keysOf(source)));
                expect(written.getLong('UniqueID', 0n)).toBe(-1234567890123n);
                expect(written.getNumber('Variant', 0)).toBe(3);
                expect(written.getString('SomeFutureField', '')).toBe('kept');
            });

            it('keeps a negative Fire, which every burning actor has', () => {
                const written = roundTrip(actor('minecraft:cow'));

                expect(written.getShort('Fire', 0)).toBe(-20);
            });

            it('survives being read and written repeatedly', () => {
                const source = actor('minecraft:some_future_mob', (root) =>
                    root.addValue('Variant', new Types.NumberVal(9))
                );

                const first = roundTrip(source);
                let written = first;
                for (let i = 0; i < 3; i++) {
                    written = roundTrip(written);
                }

                // Stable after the first pass: the defaults are added once and never again.
                expect(keysOf(written)).toEqual(keysOf(first));
                expect(written.getNumber('Variant', 0)).toBe(9);
            });
        });

        it('gives an entity that never came from disk sensible defaults', () => {
            const source = new NBTTagCompound('');
            source.addValue('identifier', new Types.StringVal('minecraft:cow'));

            const written = roundTrip(source);

            expect(written.getShort('Air', 0)).toBe(300);
            expect(written.getByte('Invulnerable', 1)).toBe(0);
        });

        describe('portals', () => {
            it('keeps the portal cooldown across a save', () => {
                const source = actor('minecraft:cow', (root) =>
                    root.addValue('PortalCooldown', new Types.NumberVal(123))
                );

                const restored = loaded(source);
                expect(restored.getPortalCooldown()).toBe(123);

                const written = EntitySerializer.toNBT(restored);
                expect(written.getNumber('PortalCooldown', -1)).toBe(123);
                expect(EntitySerializer.fromNBT(written).portalCooldown).toBe(123);
            });

            it('writes a zero cooldown for an actor that never had one', () => {
                const written = roundTrip(actor('minecraft:cow'));

                expect(written.getNumber('PortalCooldown', -1)).toBe(0);
            });

            it('writes the cooldown the entity has now, not the one it was loaded with', () => {
                const restored = loaded(
                    actor('minecraft:cow', (root) => root.addValue('PortalCooldown', new Types.NumberVal(300)))
                );
                restored.setPortalCooldown(7);

                expect(EntitySerializer.toNBT(restored).getNumber('PortalCooldown', -1)).toBe(7);
            });

            it("names the dimension of the world the entity is in, by Bedrock's id", () => {
                const overworld = roundTrip(actor('minecraft:cow'));
                const nether = roundTrip(actor('minecraft:cow'), storeWorld(Dimensions.Nether));

                expect(overworld.getNumber('DimensionId', -1)).toBe(0);
                expect(nether.getNumber('DimensionId', -1)).toBe(1);
            });

            it('overwrites a stale DimensionId from the file with the world the entity is in', () => {
                const source = actor('minecraft:cow', (root) => root.addValue('DimensionId', new Types.NumberVal(2)));

                const written = roundTrip(source, storeWorld(Dimensions.Nether));

                expect(written.getNumber('DimensionId', -1)).toBe(1);
            });
        });

        describe('identity', () => {
            // Every entity once read its uuid off the world it was built in, so all of them
            // shared one. Only players carry a uuid now, and each entity has its own runtime id.
            const at = storeWorld();
            const catWithId = (uniqueId: bigint) =>
                actor('minecraft:cat', (root) => root.addValue('UniqueID', new Types.LongVal(uniqueId)));

            it('gives two actors loaded from disk their own runtime ids', () => {
                const first = loaded(catWithId(1n), at);
                const second = loaded(catWithId(2n), at);

                expect(first.getRuntimeId()).not.toBe(second.getRuntimeId());
            });

            it('describes two actors differently, and without a uuid', () => {
                const first = loaded(catWithId(1n), at).toString();
                const second = loaded(catWithId(2n), at).toString();

                expect(first).not.toBe(second);
                expect(first).not.toMatch(/uuid/i);
                expect(second).not.toMatch(/uuid/i);
            });

            it('writes each actor back with the UniqueID it came with', () => {
                const first = roundTrip(catWithId(1n), at);
                const second = roundTrip(catWithId(2n), at);

                expect(first.getLong('UniqueID', 0n)).toBe(1n);
                expect(second.getLong('UniqueID', 0n)).toBe(2n);
            });
        });
    });
});
