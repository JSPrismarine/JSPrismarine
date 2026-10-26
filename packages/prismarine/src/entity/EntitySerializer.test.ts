import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { EntitySerializer } from './EntitySerializer';
import { GenericEntity } from './GenericEntity';
import { Item as ItemEntity } from './other/Item';

/**
 * A world stand-in. `Entity` takes its server from the world its position is in, so the fake has
 * to answer for that as well as name itself.
 */
const world = stub<World>({ getName: () => 'test', getServer: () => testEntityServer() });

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
        it('builds the written class for an identifier one covers', () => {
            // A lit TNT counts its own fuse down, which no component set describes, so it is
            // one of the seven entities this server still writes a class for.
            const tnt = EntitySerializer.fromNBT(actor('minecraft:tnt'), world);

            expect(tnt.getType()).toBe('minecraft:tnt');
            expect(tnt).not.toBeInstanceOf(GenericEntity);
        });

        it('falls back to a generic entity that still says what it is', () => {
            // Every mob loads this way now, because the runtime drives it through its
            // components and the body only has to say which mob it is.
            const cow = EntitySerializer.fromNBT(actor('minecraft:cow'), world);

            expect(cow).toBeInstanceOf(GenericEntity);
            expect(cow.getType()).toBe('minecraft:cow');
        });

        it('restores the position, including below y=0', () => {
            const position = EntitySerializer.fromNBT(actor('minecraft:cow'), world).getPosition();

            expect(position.getX()).toBe(10.5);
            expect(position.getY()).toBe(-60.25);
            expect(position.getZ()).toBe(-3.5);
        });

        it('restores the rotation', () => {
            const cow = EntitySerializer.fromNBT(actor('minecraft:cow'), world);

            expect(cow.yaw).toBe(90);
            expect(cow.pitch).toBe(45);
        });

        it('restores an item actor with its Bedrock stack fields', () => {
            const item = EntitySerializer.fromNBT(
                actor('minecraft:item', (root) => {
                    const stack = new NBTTagCompound('Item');
                    stack.addValue('Name', new Types.StringVal('minecraft:stone'));
                    stack.addValue('Count', new Types.ByteVal(2));
                    stack.addValue('Damage', new Types.ShortVal(0));
                    root.addValue('Item', stack);
                }),
                world
            );

            expect(item).toBeInstanceOf(ItemEntity);
            if (!(item instanceof ItemEntity)) throw new Error('the item actor was not restored as an item');
            expect(item.getItem()?.getItem().getName()).toBe('minecraft:stone');
            expect(item.getItem()?.getCount()).toBe(2);
        });

        it('writes the position and rotation back', () => {
            const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(actor('minecraft:cow'), world));

            expect([...(written.getList('Pos', false) ?? [])].map((v) => v.getValue())).toEqual([10.5, -60.25, -3.5]);
            expect([...(written.getList('Rotation', false) ?? [])].map((v) => v.getValue())).toEqual([90, 45]);
        });

        it('keeps three equal coordinates as three entries', () => {
            // A list of bare numbers in a Set would collapse [0, 0, 0] to one element, and the
            // entity would come back at a position two components short.
            const source = actor('minecraft:cow');
            source.addValue('Pos', floats([0, 0, 0]));

            const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(source, world));

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

                const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(source, world));

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

                const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(source, world));

                // A superset, not an equal set: writing also fills in the fields every vanilla
                // actor carries. What matters is that nothing was dropped.
                expect(keysOf(written)).toEqual(expect.arrayContaining(keysOf(source)));
                expect(written.getLong('UniqueID', 0n)).toBe(-1234567890123n);
                expect(written.getNumber('Variant', 0)).toBe(3);
                expect(written.getString('SomeFutureField', '')).toBe('kept');
            });

            it('keeps a negative Fire, which every burning actor has', () => {
                const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(actor('minecraft:cow'), world));

                expect(written.getShort('Fire', 0)).toBe(-20);
            });

            it('survives being read and written repeatedly', () => {
                const source = actor('minecraft:some_future_mob', (root) =>
                    root.addValue('Variant', new Types.NumberVal(9))
                );

                const first = EntitySerializer.toNBT(EntitySerializer.fromNBT(source, world));
                let written = first;
                for (let i = 0; i < 3; i++) {
                    written = EntitySerializer.toNBT(EntitySerializer.fromNBT(written, world));
                }

                // Stable after the first pass: the defaults are added once and never again.
                expect(keysOf(written)).toEqual(keysOf(first));
                expect(written.getNumber('Variant', 0)).toBe(9);
            });
        });

        it('gives an entity that never came from disk sensible defaults', () => {
            const source = new NBTTagCompound('');
            source.addValue('identifier', new Types.StringVal('minecraft:cow'));

            const written = EntitySerializer.toNBT(EntitySerializer.fromNBT(source, world));

            expect(written.getShort('Air', 0)).toBe(300);
            expect(written.getByte('Invulnerable', 1)).toBe(0);
        });

        describe('identity', () => {
            // Every entity once read its uuid off the world it was built in, so all of them
            // shared one. Only players carry a uuid now, and each entity has its own runtime id.
            const catWithId = (uniqueId: bigint) =>
                actor('minecraft:cat', (root) => root.addValue('UniqueID', new Types.LongVal(uniqueId)));

            it('gives two actors loaded from disk their own runtime ids', () => {
                const first = EntitySerializer.fromNBT(catWithId(1n), world);
                const second = EntitySerializer.fromNBT(catWithId(2n), world);

                expect(first.getRuntimeId()).not.toBe(second.getRuntimeId());
            });

            it('describes two actors differently, and without a uuid', () => {
                const first = EntitySerializer.fromNBT(catWithId(1n), world).toString();
                const second = EntitySerializer.fromNBT(catWithId(2n), world).toString();

                expect(first).not.toBe(second);
                expect(first).not.toMatch(/uuid/i);
                expect(second).not.toMatch(/uuid/i);
            });

            it('writes each actor back with the UniqueID it came with', () => {
                const first = EntitySerializer.toNBT(EntitySerializer.fromNBT(catWithId(1n), world));
                const second = EntitySerializer.toNBT(EntitySerializer.fromNBT(catWithId(2n), world));

                expect(first.getLong('UniqueID', 0n)).toBe(1n);
                expect(second.getLong('UniqueID', 0n)).toBe(2n);
            });

            it('gives two entities built directly their own runtime ids', () => {
                const first = new GenericEntity({
                    identifier: 'minecraft:cat',
                    position: new Position(0, 0, 0, world)
                });
                const second = new GenericEntity({
                    identifier: 'minecraft:cat',
                    position: new Position(0, 0, 0, world)
                });

                expect(first.getRuntimeId()).not.toBe(second.getRuntimeId());
            });
        });
    });
});
