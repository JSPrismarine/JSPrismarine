import type { BlockHooks } from '@jsprismarine/blocks';
import { behaviorFor, BLOCK_BEHAVIOR_NAMES, vanillaBlockPalette } from '@jsprismarine/blocks';
import { BehaviorRegistry } from '@jsprismarine/content';
import { reportProgress } from '../../../../.test/reportProgress';
import { describe, expect, it } from 'vitest';

import { familyHooks } from '../family';
import { createVoxelWorld } from '../voxelWorld';
import { registerVanillaBlockBehaviors, VANILLA_BLOCK_FAMILIES } from './registry';

const registered = (): BehaviorRegistry<BlockHooks> => {
    const registry = new BehaviorRegistry<BlockHooks>();
    registerVanillaBlockBehaviors(registry, createVoxelWorld());
    return registry;
};

describe('registerVanillaBlockBehaviors', () => {
    it('registers a behavior for every name the family rules can produce', () => {
        const registry = registered();

        expect([...registry.names()].sort()).toEqual([...BLOCK_BEHAVIOR_NAMES].sort());
    });

    it('registers nothing the family rules cannot produce', () => {
        const names = new Set(BLOCK_BEHAVIOR_NAMES);

        expect(VANILLA_BLOCK_FAMILIES.filter((family) => !names.has(family.name))).toEqual([]);
    });

    it('registers the behavior selected for every block in the palette', () => {
        const registry = registered();
        const counts = new Map<string, number>();

        for (const entry of vanillaBlockPalette().entries) {
            const name = behaviorFor(entry.identifier);
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        const uncovered = [...counts.keys()].filter((name) => !registry.has(name));

        expect(uncovered).toEqual([]);
        reportProgress(
            `Vanilla block palette: ${[...counts.values()].reduce((total, count) => total + count, 0)} blocks across ${counts.size} registered behavior families (${[
                ...counts
            ]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([name, count]) => `${name}=${count}`)
                .join(', ')}).`
        );
    });

    it('leaves jsprismarine:pane with no vanilla block, because glass and fence claim panes first', () => {
        const claimed = new Set(vanillaBlockPalette().entries.map((entry) => behaviorFor(entry.identifier)));

        expect(claimed.has('jsprismarine:pane')).toBe(false);
        expect(registered().has('jsprismarine:pane')).toBe(true);
    });

    it('binds only the hooks each family declares', () => {
        for (const family of VANILLA_BLOCK_FAMILIES) {
            const hooks = familyHooks(family);
            expect(new Set(hooks).size).toBe(hooks.length);
        }
    });

    it('gives every family a summary for the readme table', () => {
        expect(VANILLA_BLOCK_FAMILIES.filter((family) => family.summary.length < 20)).toEqual([]);
    });

    it('leaves the inert family with no hooks at all', () => {
        const inert = VANILLA_BLOCK_FAMILIES.find((family) => family.name === 'jsprismarine:inert');

        expect(inert === undefined ? undefined : familyHooks(inert)).toEqual([]);
    });
});
