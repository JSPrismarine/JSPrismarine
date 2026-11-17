import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';
import type { GoalWorld, JavaBlockState } from '../world';
import { grownByBee } from './growsCrop';

const HOME = { x: 4, y: 64, z: 0 };
const HOME_BLOCKS = ['minecraft:bee_nest', 'minecraft:beehive'];

/** A key for one block cell. */
const cell = (position: EntityPosition): string =>
    `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;

/** A bee over a column of Java block states, with its hive at {@link HOME} unless told otherwise. */
const beeOver = (
    column: Readonly<Record<number, JavaBlockState>>,
    options: { readonly hive?: string; readonly home?: EntityPosition | null; readonly random?: () => number } = {}
) => {
    const blocks = new Map<string, JavaBlockState>(
        Object.entries(column).map(([y, state]) => [cell({ x: 0, y: Number(y), z: 0 }), state])
    );
    const world: GoalWorld = {
        home: () => (options.home === null ? undefined : (options.home ?? HOME)),
        blockAt: (position) =>
            cell(position) === cell(options.home ?? HOME)
                ? { identifier: options.hive ?? 'minecraft:beehive', states: {} }
                : undefined,
        blockHasTag: (position, tag) => tag === 'minecraft:bee_growables' && blocks.has(cell(position)),
        javaBlockAt: (position) => blocks.get(cell(position)),
        setJavaBlock: (position, state) => {
            blocks.set(cell(position), state);
        }
    };
    const harness = new GoalHarness({
        goals: { 'minecraft:grows_crop': { charges: 10, chance: 0.03 } },
        components: { 'minecraft:home': { restriction_radius: 22, home_block_list: HOME_BLOCKS } },
        world,
        at: { x: 0.5, y: 66, z: 0.5 },
        // Above `canBeeUse`'s 0.3, and `nextInt(15)` lands on 0 below 1/15.
        random: options.random ?? (() => 0.5),
        randomInt: () => 0
    });
    return { harness, blocks };
};

const wheat = (age: number): JavaBlockState => ({ name: 'minecraft:wheat', properties: { age: String(age) } });

describe('minecraft:grows_crop', () => {
    it('grows the crops one and two blocks under a bee with a hive', () => {
        const { harness, blocks } = beeOver({ 65: wheat(0), 64: wheat(3), 63: wheat(0) });
        harness.tick(4);
        expect(Number(blocks.get('0,65,0')?.properties.age)).toBeGreaterThan(0);
        expect(Number(blocks.get('0,64,0')?.properties.age)).toBeGreaterThan(3);
        // Three blocks down is out of Java's reach.
        expect(blocks.get('0,63,0')).toEqual(wheat(0));
    });

    it('stops after its charges until the nectar group starts a new count', () => {
        const { harness, blocks } = beeOver({ 65: wheat(0), 64: wheat(0) });
        harness.tick(200);
        const grown = Number(blocks.get('0,65,0')?.properties.age) + Number(blocks.get('0,64,0')?.properties.age);
        // Two blocks a visit, so the last visit before the count of 10 can take it to 10 exactly.
        expect(grown).toBe(10);
    });

    it('grows nothing without a hive, with a hive too far or with something else at its home', () => {
        for (const options of [
            { home: null },
            { hive: 'minecraft:stone' },
            { home: { x: 48, y: 66, z: 0 } }
        ] as const) {
            const { harness, blocks } = beeOver({ 65: wheat(0) }, options);
            harness.tick(40);
            expect(blocks.get('0,65,0')).toEqual(wheat(0));
        }
    });

    it("refuses to start on a draw under Java's 0.3", () => {
        const { harness, blocks } = beeOver({ 65: wheat(0) }, { random: () => 0.29 });
        harness.tick(40);
        expect(blocks.get('0,65,0')).toEqual(wheat(0));
    });
});

describe('grownByBee', () => {
    it("takes each crop one age further, up to its Java class's maximum", () => {
        expect(grownByBee(wheat(6))).toEqual(wheat(7));
        expect(grownByBee(wheat(7))).toBeUndefined();
        expect(grownByBee({ name: 'minecraft:beetroots', properties: { age: '3' } })).toBeUndefined();
        expect(grownByBee({ name: 'minecraft:pumpkin_stem', properties: { age: '6' } })).toEqual({
            name: 'minecraft:pumpkin_stem',
            properties: { age: '7' }
        });
        expect(grownByBee({ name: 'minecraft:sweet_berry_bush', properties: { age: '3' } })).toBeUndefined();
    });

    it('turns a torchflower crop at its last age into a torchflower', () => {
        expect(grownByBee({ name: 'minecraft:torchflower_crop', properties: { age: '1' } })).toEqual({
            name: 'minecraft:torchflower',
            properties: {}
        });
    });

    it('gives cave vines berries and leaves the pitcher crop alone', () => {
        expect(
            grownByBee({ name: 'minecraft:cave_vines_plant', properties: { berries: 'false' } })?.properties.berries
        ).toBe('true');
        expect(grownByBee({ name: 'minecraft:cave_vines', properties: { age: '3', berries: 'true' } })).toBeUndefined();
        expect(grownByBee({ name: 'minecraft:pitcher_crop', properties: { age: '0', half: 'lower' } })).toBeUndefined();
    });
});
