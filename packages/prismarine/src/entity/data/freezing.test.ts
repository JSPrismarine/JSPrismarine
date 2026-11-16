import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const body = (extra: Record<string, unknown> = {}) => ({
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        ...extra
    }
});

const AT = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** Stands one entity in powder snow for `ticks` and answers the freezing blows it took. */
const freeze = (identifier: string, ticks: number, snow = true) => {
    const world = new TestEntityWorld();
    const fixture = entityFixture(
        world,
        {},
        {
            'minecraft:pig': body(),
            'minecraft:strider': body({ 'minecraft:freezing_vulnerable': {} }),
            'minecraft:creeper': body({ 'minecraft:freezing_immune': {} })
        }
    );
    if (snow) for (const y of [0, 1]) world.setBlock({ x: 0, y: FLOOR_Y + 1 + y, z: 0 }, 'minecraft:powder_snow');
    const entity = fixture.runtime.spawn(identifier, AT);
    if (entity === undefined) throw new Error(`the fixture declares ${identifier}`);
    for (let tick = 1; tick <= ticks; tick += 1) {
        world.advance();
        fixture.runtime.tick(tick);
    }
    const blows = world.commits.filter(
        (commit) => commit.target.id === entity.id && commit.intent.cause === 'freezing' && commit.taken > 0
    );
    return { fixture, entity, blows };
};

describe('powder snow', () => {
    it("freezes a living body through in Java's 140 ticks and then hurts it 1 every 40", () => {
        const { blows, fixture, entity } = freeze('minecraft:pig', 240);

        expect(fixture.runtime.frozenTicksOf(entity.id)).toBe(140);
        // Fully frozen on tick 140, so the blows land on ticks 160, 200 and 240.
        expect(blows.map((blow) => blow.taken)).toEqual([1, 1, 1]);
    });

    it('hurts a type that declares freezing_vulnerable 5 a blow, as Java hurts its freeze_hurts_extra_types', () => {
        expect(freeze('minecraft:strider', 160).blows.map((blow) => blow.taken)).toEqual([5]);
    });

    it('leaves a type that declares freezing_immune warm', () => {
        const { blows, fixture, entity } = freeze('minecraft:creeper', 200);

        expect(blows).toEqual([]);
        expect(fixture.runtime.frozenTicksOf(entity.id)).toBe(0);
    });

    it('lets a body out of the snow warm by two a tick', () => {
        const { fixture, entity } = freeze('minecraft:pig', 1, false);
        fixture.runtime.setFrozenTicks(entity.id, 100);
        fixture.runtime.tick(2);

        expect(fixture.runtime.frozenTicksOf(entity.id)).toBe(98);
    });
});
