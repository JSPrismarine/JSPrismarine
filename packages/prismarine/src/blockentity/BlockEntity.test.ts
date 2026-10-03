import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from './BlockEntityRegistry';
import { Chest, Furnace, Sign } from './BlockEntities';
import { GenericBlockEntity } from './GenericBlockEntity';

/** The compound a world file holds for one block entity. */
const nbt = (id: string, x = 1, y = -60, z = 3, extra: (root: NBTTagCompound) => void = () => {}) => {
    const root = new NBTTagCompound('');
    root.addValue('id', new Types.StringVal(id));
    root.addValue('x', new Types.NumberVal(x));
    root.addValue('y', new Types.NumberVal(y));
    root.addValue('z', new Types.NumberVal(z));
    root.addValue('isMovable', new Types.ByteVal(1));
    extra(root);
    return root;
};

const keysOf = (compound: NBTTagCompound) => [...compound.entries()].map(([key]) => key).sort();

describe('blockentity', () => {
    describe('registry', () => {
        it('builds the modelled type for an id it knows', () => {
            expect(BlockEntityRegistry.fromNBT(nbt('Chest'))).toBeInstanceOf(Chest);
            expect(BlockEntityRegistry.fromNBT(nbt('Sign'))).toBeInstanceOf(Sign);
            expect(BlockEntityRegistry.fromNBT(nbt('Furnace'))).toBeInstanceOf(Furnace);
        });

        it('falls back to the generic type rather than refusing the chunk', () => {
            // One unfamiliar block must not make a whole world unopenable.
            const beacon = BlockEntityRegistry.fromNBT(nbt('Beacon'));

            expect(beacon).toBeInstanceOf(GenericBlockEntity);
            expect(beacon.getId()).toBe('Beacon');
        });

        it('knows which types it models', () => {
            expect(BlockEntityRegistry.isModelled('Chest')).toBe(true);
            expect(BlockEntityRegistry.isModelled('Beacon')).toBe(false);
            expect(BlockEntityRegistry.ids()).toContain('MobSpawner');
        });
    });

    describe('position', () => {
        it('reads a position below y=0', () => {
            const chest = BlockEntityRegistry.fromNBT(nbt('Chest', -5, -60, 7));

            expect(chest.getPosition().getX()).toBe(-5);
            expect(chest.getPosition().getY()).toBe(-60);
            expect(chest.getPosition().getZ()).toBe(7);
        });

        it('writes the position back', () => {
            const written = BlockEntityRegistry.fromNBT(nbt('Chest', -5, -60, 7)).toNBT();

            expect(written.getNumber('x', 0)).toBe(-5);
            expect(written.getNumber('y', 0)).toBe(-60);
            expect(written.getNumber('z', 0)).toBe(7);
            expect(written.getString('id', '')).toBe('Chest');
        });
    });

    describe('round tripping', () => {
        it('keeps every tag of a type it does not model', () => {
            // The whole point of the generic fallback: nothing is lost by not knowing what a
            // beacon is.
            const source = nbt('Beacon', 0, 64, 0, (root) => {
                root.addValue('primary', new Types.NumberVal(3));
                root.addValue('secondary', new Types.NumberVal(-1));
                root.addValue('SomeFutureField', new Types.StringVal('kept'));
            });

            const written = BlockEntityRegistry.fromNBT(source).toNBT();

            expect(keysOf(written)).toEqual(keysOf(source));
            expect(written.getNumber('primary', 0)).toBe(3);
            expect(written.getNumber('secondary', 0)).toBe(-1);
            expect(written.getString('SomeFutureField', '')).toBe('kept');
        });

        it('keeps the tags a modelled type does not model either', () => {
            const source = nbt('Chest', 0, 64, 0, (root) => {
                root.addValue('CustomName', new Types.StringVal('Loot'));
                root.addValue('Findable', new Types.ByteVal(1));
                root.addValue('LootTable', new Types.StringVal('loot_tables/chests/simple_dungeon.json'));
            });

            const written = BlockEntityRegistry.fromNBT(source).toNBT();

            expect(written.getString('LootTable', '')).toBe('loot_tables/chests/simple_dungeon.json');
            expect(written.getByte('Findable', 0)).toBe(1);
        });

        it('keeps a container inventory it has no model for', () => {
            const item = new NBTTagCompound();
            item.addValue('Name', new Types.StringVal('minecraft:diamond'));
            item.addValue('Count', new Types.ByteVal(64));

            const source = nbt('Chest', 0, 64, 0, (root) => {
                root.addValue('Items', new Set([item]));
            });

            const chest = BlockEntityRegistry.fromNBT(source) as Chest;

            expect(chest.getItems().size).toBe(1);
            expect(chest.isEmpty()).toBe(false);
            expect([...(chest.toNBT().getList('Items', false) ?? [])]).toHaveLength(1);
        });

        it('survives being read and written repeatedly', () => {
            const source = nbt('Beacon', 2, -3, 4, (root) => root.addValue('primary', new Types.NumberVal(7)));

            let written = BlockEntityRegistry.fromNBT(source).toNBT();
            for (let i = 0; i < 3; i++) written = BlockEntityRegistry.fromNBT(written).toNBT();

            expect(keysOf(written)).toEqual(keysOf(source));
            expect(written.getNumber('primary', 0)).toBe(7);
        });
    });

    describe('modelled types', () => {
        it('reads a furnace and writes its timers back', () => {
            const furnace = BlockEntityRegistry.fromNBT(
                nbt('Furnace', 0, 64, 0, (root) => {
                    root.addValue('BurnTime', new Types.ShortVal(120));
                    root.addValue('CookTime', new Types.ShortVal(45));
                })
            ) as Furnace;

            expect(furnace.getBurnTime()).toBe(120);
            expect(furnace.getCookTime()).toBe(45);
            expect(furnace.isLit()).toBe(true);
            expect(furnace.toNBT().getShort('BurnTime', 0)).toBe(120);
        });

        it('reads a sign written the modern way', () => {
            const component = new NBTTagCompound('SignTextComponent');
            component.addValue('Text', new Types.StringVal('line one\nline two'));
            const front = new NBTTagCompound('FrontText');
            front.addChild(component);

            const sign = BlockEntityRegistry.fromNBT(nbt('Sign', 0, 64, 0, (root) => root.addChild(front))) as Sign;

            expect(sign.getText()).toBe('line one\nline two');
            expect(sign.getLines()).toEqual(['line one', 'line two']);
        });

        it('reads a sign written the old flat way', () => {
            // Worlds predating 1.19.80 have no front and back faces.
            const sign = BlockEntityRegistry.fromNBT(
                nbt('Sign', 0, 64, 0, (root) => root.addValue('Text', new Types.StringVal('older')))
            ) as Sign;

            expect(sign.getText()).toBe('older');
        });

        it('reads a double chest pairing', () => {
            const chest = BlockEntityRegistry.fromNBT(
                nbt('Chest', 4, 64, 8, (root) => {
                    root.addValue('pairx', new Types.NumberVal(5));
                    root.addValue('pairz', new Types.NumberVal(8));
                })
            ) as Chest;

            expect(chest.getPairPosition()).toEqual({ x: 5, z: 8 });
            expect((BlockEntityRegistry.fromNBT(nbt('Chest')) as Chest).getPairPosition()).toBeNull();
        });

        it('reads whether a piston may push it', () => {
            expect(BlockEntityRegistry.fromNBT(nbt('Chest')).isMovable()).toBe(true);

            const fixed = nbt('Chest');
            fixed.addValue('isMovable', new Types.ByteVal(0));
            expect(BlockEntityRegistry.fromNBT(fixed).isMovable()).toBe(false);
        });
    });
});
