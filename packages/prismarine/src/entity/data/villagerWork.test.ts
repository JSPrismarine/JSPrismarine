import { seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { ContentBlock, ContentBlockAccess, ContentEffectSink, ContentPosition } from '../../content/world/adapter';
import { stub } from '../../testing/stub.test.helper';
import type { VillagerWorld } from './villagerWork';
import {
    countOf,
    farmWorkAround,
    foodPointsOf,
    harvestFarmland,
    shareWithVillager,
    useBonemeal,
    workAtComposter
} from './villagerWork';

const keyOf = (at: ContentPosition) => `${at.x},${at.y},${at.z}`;

/** A world of explicit blocks, with air everywhere else. */
const worldOf = (blocks: [ContentPosition, ContentBlock][], seed = 1) => {
    const placed = new Map(blocks.map(([at, block]) => [keyOf(at), block]));
    const sounds: string[] = [];
    const world: VillagerWorld = {
        blocks: stub<ContentBlockAccess>({
            get: (at) => placed.get(keyOf(at)) ?? { identifier: 'minecraft:air', states: {} },
            set: (at, block) => void placed.set(keyOf(at), block)
        }),
        effects: stub<ContentEffectSink>({
            playSound: (_at, sound) => void sounds.push(sound),
            spawnParticle: () => undefined
        }),
        random: seededRandom(seed)
    };
    return { world, placed, sounds };
};

const at = (x: number, y: number, z: number): ContentPosition => ({ x, y, z });
const crop = (identifier: string, growth: number): ContentBlock => ({ identifier, states: { growth } });
const items = (identifier: string, count: number) => Array.from({ length: count }, () => identifier);

describe('a villager at a composter', () => {
    const composter = (level: number): [ContentPosition, ContentBlock][] => [
        [at(0, 64, 0), { identifier: 'minecraft:composter', states: { composter_fill_level: level } }]
    ];

    it('bakes three wheat into a loaf, up to three loaves at a time', () => {
        const { world } = worldOf(composter(0));
        const inventory = items('minecraft:wheat', 11);

        expect(workAtComposter(world, inventory, at(0, 64, 0))).toBe(true);

        expect(countOf(inventory, 'minecraft:bread')).toBe(3);
        expect(countOf(inventory, 'minecraft:wheat')).toBe(2);
    });

    it('stops baking past 36 loaves', () => {
        const { world } = worldOf(composter(0));
        const inventory = [...items('minecraft:bread', 37), ...items('minecraft:wheat', 9)];

        workAtComposter(world, inventory, at(0, 64, 0));

        expect(countOf(inventory, 'minecraft:wheat')).toBe(9);
    });

    it('composts seeds into layers and hands back bone meal when full', () => {
        const { world, placed } = worldOf(composter(7), 3);
        const inventory = items('minecraft:wheat_seeds', 40);

        workAtComposter(world, inventory, at(0, 64, 0));

        expect(countOf(inventory, 'minecraft:bone_meal')).toBe(1);
        expect(placed.get('0,64,0')?.states.composter_fill_level).toBe(0);
        expect(countOf(inventory, 'minecraft:wheat_seeds')).toBeLessThan(40);
    });

    it('does nothing at a block that is not a composter', () => {
        const { world } = worldOf([]);
        const inventory = items('minecraft:wheat', 3);

        expect(workAtComposter(world, inventory, at(0, 64, 0))).toBe(false);
        expect(countOf(inventory, 'minecraft:wheat')).toBe(3);
    });
});

describe('a farmer in a field', () => {
    const field = (): [ContentPosition, ContentBlock][] => [
        [at(1, 63, 0), { identifier: 'minecraft:farmland', states: {} }],
        [at(1, 64, 0), crop('minecraft:wheat', 7)],
        [at(2, 63, 0), { identifier: 'minecraft:farmland', states: {} }],
        [at(2, 64, 0), crop('minecraft:wheat', 2)]
    ];

    it('finds the ripe crop to harvest, and only that', () => {
        const { world } = worldOf(field());

        expect(farmWorkAround(world, [], at(0, 64, 0), 'harvest_farmland')).toEqual(at(1, 64, 0));
    });

    it('breaks a ripe crop into its inventory and sows a seed it holds', () => {
        const { world, placed } = worldOf(field());
        const inventory = items('minecraft:wheat_seeds', 2);

        expect(harvestFarmland(world, inventory, at(1, 64, 0))).toBe(true);

        expect(countOf(inventory, 'minecraft:wheat')).toBe(1);
        expect(placed.get('1,64,0')).toEqual({ identifier: 'minecraft:wheat', states: { growth: 0 } });
    });

    it('sows again from what the crop itself gave', () => {
        const { world, placed } = worldOf([
            [at(1, 63, 0), { identifier: 'minecraft:farmland', states: {} }],
            [at(1, 64, 0), crop('minecraft:potatoes', 7)]
        ]);
        const inventory: string[] = [];

        harvestFarmland(world, inventory, at(1, 64, 0));

        expect(placed.get('1,64,0')).toEqual({ identifier: 'minecraft:potatoes', states: { growth: 0 } });
    });

    it('does not harvest a crop that is still growing', () => {
        const { world, placed } = worldOf(field());

        expect(harvestFarmland(world, [], at(2, 64, 0))).toBe(false);
        expect(placed.get('2,64,0')?.identifier).toBe('minecraft:wheat');
    });

    it('sows bare farmland only when it holds a seed', () => {
        const bare: [ContentPosition, ContentBlock][] = [
            [at(1, 63, 0), { identifier: 'minecraft:farmland', states: {} }]
        ];

        expect(farmWorkAround(worldOf(bare).world, [], at(0, 64, 0), 'harvest_farmland')).toBeUndefined();
        expect(farmWorkAround(worldOf(bare).world, ['minecraft:carrot'], at(0, 64, 0), 'harvest_farmland')).toEqual(
            at(1, 64, 0)
        );
    });

    it('spends bone meal on a growing crop and none on a ripe one', () => {
        const { world, placed } = worldOf(field());
        const inventory = items('minecraft:bone_meal', 2);

        expect(farmWorkAround(world, inventory, at(0, 64, 0), 'use_bonemeal')).toEqual(at(2, 64, 0));
        expect(useBonemeal(world, inventory, at(1, 64, 0))).toBe(false);
        expect(useBonemeal(world, inventory, at(2, 64, 0))).toBe(true);

        expect(Number(placed.get('2,64,0')?.states.growth)).toBeGreaterThan(2);
        expect(countOf(inventory, 'minecraft:bone_meal')).toBe(1);
    });

    it('has nothing to feed without bone meal', () => {
        expect(farmWorkAround(worldOf(field()).world, [], at(0, 64, 0), 'use_bonemeal')).toBeUndefined();
    });
});

describe('two villagers who meet', () => {
    it('share half a food stack with one that has too little', () => {
        const mine = items('minecraft:bread', 6);
        const theirs: string[] = [];

        expect(shareWithVillager(mine, theirs, false, false)).toBe(true);

        expect(countOf(mine, 'minecraft:bread')).toBe(3);
        expect(foodPointsOf(theirs)).toBe(12);
    });

    it('keep their food when the other has enough', () => {
        const mine = items('minecraft:bread', 6);
        const theirs = items('minecraft:bread', 3);

        expect(shareWithVillager(mine, theirs, false, false)).toBe(false);
        expect(countOf(mine, 'minecraft:bread')).toBe(6);
    });

    it('pass a surplus of wheat between farmers only', () => {
        const wheat = () => items('minecraft:wheat', 40);
        const farmerToFarmer = { mine: wheat(), theirs: items('minecraft:bread', 3) };
        const farmerToOther = { mine: wheat(), theirs: items('minecraft:bread', 3) };

        shareWithVillager(farmerToFarmer.mine, farmerToFarmer.theirs, true, true);
        shareWithVillager(farmerToOther.mine, farmerToOther.theirs, false, true);

        expect(countOf(farmerToFarmer.theirs, 'minecraft:wheat')).toBe(20);
        expect(countOf(farmerToOther.theirs, 'minecraft:wheat')).toBe(0);
    });
});
