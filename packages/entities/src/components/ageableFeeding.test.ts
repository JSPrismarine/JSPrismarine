import { describe, expect, it } from 'vitest';

import type { EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntitySpawnRequest } from '../hooks';

/** A baby whose `minecraft:ageable` body is the one given, spawned with its growth clock running. */
const baby = (ageable: Record<string, unknown>, spawns: EntitySpawnRequest[] = []): EntityInstance => {
    const types = new EntityTypes();
    types.load([
        {
            data: {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:foal' },
                    component_groups: { 'test:baby': { 'minecraft:ageable': ageable } },
                    events: { 'minecraft:entity_spawned': { add: { component_groups: ['test:baby'] } } }
                }
            },
            pack: 'vanilla',
            path: 'entities/foal.json'
        }
    ]);
    return types.spawn('test:foal', {
        environment: {
            spawnEntity: (_entity, request) => {
                spawns.push(request);
                return true;
            }
        }
    });
};

/** The growth ticks a baby has left. */
const ticksLeft = (entity: EntityInstance): unknown => entity.componentState.snapshot()['minecraft:ageable']?.remaining;

/** Sets the growth ticks a baby has left, the way a saved baby is restored. */
const setTicksLeft = (entity: EntityInstance, remaining: number): void => {
    entity.componentState.write('minecraft:ageable', { remaining, paused: false });
};

describe('minecraft:ageable feeding', () => {
    it("advances a plain feed item by a tenth of the seconds left, as Java's Animal does", () => {
        const calf = baby({ duration: 1200, feed_items: ['wheat'] });
        expect(calf.interactWithItem('minecraft:wheat')).toBe(true);
        expect(ticksLeft(calf)).toBe(24000 - 120 * 20);

        setTicksLeft(calf, 6000);
        calf.interactWithItem('minecraft:wheat');
        expect(ticksLeft(calf)).toBe(6000 - 30 * 20);
    });

    it("advances an item with an explicit growth by that fraction of the whole duration, as Java's horse does", () => {
        // Java's AbstractHorse.handleEating: wheat 20 seconds and hay 180, whatever the time left.
        const foal = baby({
            duration: 1200,
            feed_items: [
                { item: 'wheat', growth: 0.016667 },
                { item: 'hay_block', growth: 0.15 }
            ]
        });
        foal.interactWithItem('minecraft:wheat');
        expect(ticksLeft(foal)).toBe(24000 - 20 * 20);

        setTicksLeft(foal, 6000);
        foal.interactWithItem('minecraft:hay_block');
        expect(ticksLeft(foal)).toBe(6000 - 180 * 20);
    });

    it('matches the current name of an item a vanilla file writes under its legacy name', () => {
        const kitten = baby({ duration: 1200, feed_items: ['fish', { item: 'appleEnchanted', growth: 0.2 }] });
        expect(kitten.interactWithItem('minecraft:cod')).toBe(true);
        expect(kitten.interactWithItem('minecraft:enchanted_golden_apple')).toBe(true);
    });

    it('drops a legacy-named grow-up item under its current name', () => {
        const spawns: EntitySpawnRequest[] = [];
        const hatchling = baby({ duration: 1200, drop_items: ['turtle_shell_piece'] }, spawns);
        setTicksLeft(hatchling, 1);
        hatchling.tick(false);
        expect(spawns).toEqual([{ kind: 'item', identifier: 'minecraft:turtle_scute', count: 1 }]);
    });
});
