import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y } from './testing';

/** A zombie whose spawn event always adds the door-breaking group, as one draw in ten of Bedrock's does. */
const alwaysBreaks = (group: string) => ({
    components: {
        'minecraft:collision_box': { width: 0.6, height: 1.9 },
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:navigation.walk': { can_break_doors: true }
    },
    component_groups: { [group]: { 'minecraft:annotation.break_door': {} } },
    events: { 'minecraft:entity_spawned': { add: { component_groups: [group] } } }
});

describe("a zombie's door breaking", () => {
    it("follows Java's chance, which a fresh Normal world gives nothing, not the pack's draw", () => {
        const { runtime } = entityFixture(
            undefined,
            {},
            {
                'minecraft:zombie': alwaysBreaks('minecraft:can_break_doors'),
                'minecraft:zombie_villager_v2': alwaysBreaks('can_break_doors'),
                'minecraft:drowned': alwaysBreaks('minecraft:can_break_doors')
            }
        );
        for (const identifier of ['minecraft:zombie', 'minecraft:zombie_villager_v2', 'minecraft:drowned']) {
            const zombie = runtime.spawn(identifier, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
            expect(zombie?.instance.hasComponent('minecraft:annotation.break_door'), identifier).toBe(false);
        }
    });

    it('leaves the group to the pack for a mob Java does not decide', () => {
        const { runtime } = entityFixture(
            undefined,
            {},
            { 'jsprismarine:breaker': alwaysBreaks('minecraft:can_break_doors') }
        );
        const breaker = runtime.spawn('jsprismarine:breaker', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(breaker?.instance.hasComponent('minecraft:annotation.break_door')).toBe(true);
    });
});
