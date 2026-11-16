import { describe, expect, it } from 'vitest';

import { FLAP_EVENT } from './flapping';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A body that hangs where it is put, so it flies over air with nothing under it. */
const hovering = (tracking: Record<string, unknown>) => ({
    components: {
        'minecraft:health': { value: 6, max: 6 },
        'minecraft:physics': { has_gravity: false },
        'minecraft:game_event_movement_tracking': tracking
    }
});

const DEFINITIONS = {
    'minecraft:bat': hovering({ emit_flap: true }),
    'minecraft:allay': hovering({ emit_flap: true }),
    'minecraft:vex': hovering({ emit_move: false, emit_swim: false })
};

/** The ticks on which one entity, put `lift` blocks over the floor, sent a flap game event. */
const flapTicks = (identifier: string, lift: number, ticks: number): number[] => {
    const world = new TestEntityWorld();
    const { runtime } = entityFixture(world, {}, DEFINITIONS);
    const entity = runtime.spawn(identifier, { x: 0.5, y: FLOOR_Y + 1 + lift, z: 0.5 });
    if (entity === undefined) throw new Error(`the fixture spawned no ${identifier}`);
    const flaps: number[] = [];
    for (let tick = 1; tick <= ticks; tick += 1) {
        const before = world.gameEvents.length;
        runtime.tick(tick);
        if (world.gameEvents.slice(before).some((event) => event.event === FLAP_EVENT && event.sourceId === entity.id))
            flaps.push(tick);
    }
    return flaps;
};

describe('a flying mob', () => {
    it("flaps every 10 ticks in the air as Java's bat does", () => {
        expect(flapTicks('minecraft:bat', 3, 30)).toEqual([10, 20, 30]);
    });

    it("flaps every tick it is off the ground as Java's allay does", () => {
        expect(flapTicks('minecraft:allay', 3, 3)).toEqual([1, 2, 3]);
    });

    it('sends no flap with solid ground under its feet', () => {
        expect(flapTicks('minecraft:bat', 0, 30)).toEqual([]);
    });

    it('sends no flap for a type whose movement tracking does not emit flaps', () => {
        expect(flapTicks('minecraft:vex', 3, 30)).toEqual([]);
    });
});
