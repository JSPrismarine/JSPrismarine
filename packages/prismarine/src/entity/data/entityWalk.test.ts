/**
 * What a pass over the entity store sees: the entities it held when the walk began, in spawn
 * order, minus any removed before the walk reaches them.
 */
import { describe, expect, it } from 'vitest';

import { entityFixture, TestEntityWorld } from './testing';

const GROUND = { x: 0, y: 1, z: 0 };

describe('the passes over the store', () => {
    it('walk the entities the store held when the walk began, in spawn order', () => {
        const { runtime } = entityFixture(new TestEntityWorld());
        const spawned = [0, 2, 4].map((x) => runtime.spawn('minecraft:cow', { ...GROUND, x }));
        const ids = spawned.map((entity) => entity?.id);

        const visited: number[] = [];
        for (const entity of runtime.entities()) {
            visited.push(entity.id);
            // An entity admitted mid-walk waits for the next one, as it did in the copy's pass.
            if (visited.length === 1) runtime.spawn('minecraft:cow', { ...GROUND, x: 6 });
        }

        expect(visited).toEqual(ids);
        expect([...runtime.entities()]).toHaveLength(4);
    });

    it('skip an entity removed before the walk reaches it', () => {
        const { runtime } = entityFixture(new TestEntityWorld());
        const [first, second, third] = [0, 2, 4].map((x) => runtime.spawn('minecraft:cow', { ...GROUND, x }));
        if (first === undefined || second === undefined || third === undefined) throw new Error('no cows');

        const visited: number[] = [];
        for (const entity of runtime.entities()) {
            visited.push(entity.id);
            if (entity === first) runtime.remove(second.id, 'test');
        }

        expect(visited).toEqual([first.id, third.id]);
    });
});
