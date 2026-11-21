import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../config/JsonConfigTypes';
import type { StoredItemStack } from '../inventory/persistence';
import { readPlayerDataGroups, sharedParts, withSharedParts } from './playerDataGroups';

const DIAMOND: StoredItemStack[] = [{ name: 'minecraft:diamond', count: 3 }];
const BREAD: StoredItemStack[] = [{ name: 'minecraft:bread', count: 1 }];

/** A record with an inventory, health in its attribute table and a place in the Overworld. */
const recordOf = (items: StoredItemStack[], health: number, x: number): Partial<WorldPlayerData> => ({
    gamemode: 'survival',
    inventory: { items, handSlot: 0, armor: [], offhand: [], enderChest: [] },
    attributes: {
        [AttributeIds.Health]: { min: 0, max: 20, base: 20, current: health },
        [AttributeIds.PlayerLevel]: { min: 0, max: 24791, base: 0, current: 7 }
    },
    position: { x, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
    dimension: 'minecraft:overworld'
});

describe('player data groups', () => {
    it('reads each group, and names what it leaves out', () => {
        const { groups, problems } = readPlayerDataGroups({
            minigames: { levels: ['lobby', 'arena'], share: ['inventory', 'health', 'mana'] },
            broken: { levels: 'lobby' }
        });

        expect(groups.map(({ name, levels, share }) => [name, levels, [...share]])).toEqual([
            ['minigames', ['lobby', 'arena'], ['inventory', 'health']]
        ]);
        expect(problems).toEqual([
            'player-data-groups.minigames shares "mana", which is no part of a record',
            'player-data-groups.broken needs a list of levels and a list of parts to share'
        ]);
    });

    it('shares between two levels the parts of every group that holds both', () => {
        const { groups } = readPlayerDataGroups({
            a: { levels: ['lobby', 'Arena'], share: ['inventory'] },
            b: { levels: ['arena', 'lobby', 'hub'], share: ['health'] },
            c: { levels: ['hub'], share: ['position'] }
        });

        expect([...sharedParts(groups, 'LOBBY', 'arena')].sort()).toEqual(['health', 'inventory']);
        expect([...sharedParts(groups, 'lobby', 'elsewhere')]).toEqual([]);
    });

    it('carries the shared parts over and keeps the arriving level’s own record for the rest', () => {
        const carried = recordOf(DIAMOND, 5, 100);
        const arriving = recordOf(BREAD, 20, -50);

        const shared = withSharedParts(carried, arriving, new Set(['inventory', 'health'] as const));

        expect(shared.inventory?.items).toEqual(DIAMOND);
        expect(shared.attributes?.[AttributeIds.Health]?.current).toBe(5);
        // Not shared: the arriving level's own experience and place.
        expect(shared.attributes?.[AttributeIds.PlayerLevel]?.current).toBe(7);
        expect(shared.position?.x).toBe(-50);
        expect(withSharedParts(carried, arriving, new Set(['position'] as const)).position?.x).toBe(100);
        expect(withSharedParts(carried, arriving, new Set())).toBe(arriving);
    });
});
