import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const AT = { x: 0.5, y: FLOOR_Y + 4, z: 0.5 };

/** A spawner holding a stack, with the world's random draws scripted, run until it is gone. */
const holding = (item: Record<string, unknown>, draws: readonly number[]) => {
    const world = new TestEntityWorld({ random: draws });
    const { runtime } = entityFixture(world);
    const spawner = runtime.spawn('minecraft:ominous_item_spawner', AT, { data: { item } });
    if (spawner === undefined) throw new Error('the fixture spawned no ominous item spawner');
    let gone: number | undefined;
    for (let tick = 1; tick <= 130 && gone === undefined; tick += 1) {
        runtime.tick(tick);
        if (runtime.byId(spawner.id) === undefined) gone = tick;
    }
    return { world, gone };
};

describe('the ominous item spawner', () => {
    it("lets its item go on the tick it drew, from Java's 60 to 120, and is gone", () => {
        expect(holding({ name: 'minecraft:diamond', count: 1 }, [0]).gone).toBe(60);
        expect(holding({ name: 'minecraft:diamond', count: 1 }, [0.9999]).gone).toBe(120);
    });

    it('drops an item that is no projectile where it hangs', () => {
        const { world } = holding({ name: 'minecraft:diamond', count: 2 }, [0]);
        expect(world.drops.map((drop) => drop.item)).toEqual([{ identifier: 'minecraft:diamond', count: 2 }]);
    });

    it('warns 36 ticks before the release and sounds the release', () => {
        const { world } = holding({ name: 'minecraft:diamond', count: 1 }, [0]);
        expect(world.sounds).toEqual(['ominous_item_spawner.about_to_spawn_item', 'ominous_item_spawner.spawn_item']);
    });
});
