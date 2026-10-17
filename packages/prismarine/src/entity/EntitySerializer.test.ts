import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { EntitySerializer } from './EntitySerializer';
import { GenericEntity } from './GenericEntity';
import type { World } from '../world/World';

/**
 * A world stand-in. `Entity` takes its server from the world its position is in, so the fake has
 * to answer for that as well as name itself.
 */
const world = { getName: () => 'test', getServer: () => ({}) } as unknown as World;

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
        it('builds the modelled class for an identifier it knows', () => {
            const cow = EntitySerializer.fromNBT(actor('minecraft:cow'), world);

            expect(cow.getType()).toBe('minecraft:cow');
            expect(cow).not.toBeInstanceOf(GenericEntity);
        });

        it('falls back to a generic entity that still says what it is', () => {
            // Without this, every mob the server has no class for would vanish from the world -
            // or the world would refuse to load at all.
            const llama = EntitySerializer.fromNBT(actor('minecraft:some_future_mob'), world);

            expect(llama).toBeInstanceOf(GenericEntity);
            expect(llama.getType()).toBe('minecraft:some_future_mob');
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

        it('knows which identifiers it models', () => {
            expect(EntitySerializer.isModelled('minecraft:cow')).toBe(true);
            expect(EntitySerializer.isModelled('minecraft:some_future_mob')).toBe(false);
        });
    });
});
