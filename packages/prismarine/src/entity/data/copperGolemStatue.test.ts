import { describe, expect, it } from 'vitest';

import { facingOfYaw } from './copperGolemStatue';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const STATUE = 'minecraft:oxidized_copper_golem_statue';

/** A copper golem whose `becoming_statue` body is the vanilla one, cut to two facings. */
const golemFile = (oxidized: boolean) => ({
    components: {
        'minecraft:health': { value: 12, max: 12 },
        'minecraft:collision_box': { width: 0.49, height: 0.98 },
        'minecraft:physics': {}
    },
    component_groups: {
        becoming_statue: {
            'minecraft:behavior.place_block': {
                priority: 1,
                chance: 0.0058,
                xz_range: 0,
                y_range: 0,
                affected_by_griefing_rule: false,
                randomly_placeable_blocks: [
                    { block: { name: STATUE, states: { 'minecraft:cardinal_direction': 'south' } } },
                    { block: { name: STATUE, states: { 'minecraft:cardinal_direction': 'west' } } }
                ],
                on_place: { event: 'minecraft:become_statue', target: 'self' }
            }
        }
    },
    events: {
        'minecraft:entity_spawned': oxidized ? { add: { component_groups: ['becoming_statue'] } } : {},
        'minecraft:become_statue': {}
    }
});

const fixtureWith = (oxidized: boolean, draw: number) => {
    const world = new TestEntityWorld({ random: [draw] });
    const fixture = entityFixture(world, {}, { 'minecraft:copper_golem': golemFile(oxidized) });
    const golem = fixture.runtime.spawn('minecraft:copper_golem', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    if (golem === undefined) throw new Error('the fixture declares no copper golem');
    return { world, fixture, golem };
};

describe("Java's CopperGolem statue", () => {
    it('turns a fully oxidized golem into a statue facing its way, on a draw at or under 0.0058', () => {
        const { world, fixture, golem } = fixtureWith(true, 0.0058);
        golem.body.yaw = 90;

        fixture.runtime.tick(1);

        expect(world.world.blocks.get({ x: 0, y: FLOOR_Y + 1, z: 0 })).toEqual({
            identifier: STATUE,
            states: { 'minecraft:cardinal_direction': 'west' }
        });
        expect(fixture.runtime.byId(golem.id)).toBeUndefined();
    });

    it('leaves a golem on a draw over the chance, and one that is not fully oxidized', () => {
        for (const [oxidized, draw] of [
            [true, 0.006],
            [false, 0]
        ] as const) {
            const { world, fixture, golem } = fixtureWith(oxidized, draw);

            fixture.runtime.tick(1);

            expect(world.world.blocks.get({ x: 0, y: FLOOR_Y + 1, z: 0 })?.identifier).toBe('minecraft:air');
            expect(fixture.runtime.byId(golem.id)).toBe(golem);
        }
    });

    it("rounds a yaw to Java's Direction.fromYRot quarter turns", () => {
        expect([0, 44, 46, 135, 180, -90, -135].map(facingOfYaw)).toEqual([
            'south',
            'south',
            'west',
            'north',
            'north',
            'east',
            'east'
        ]);
    });
});
