import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';
import type { GoalMob } from '../world';
import { LAND_ON_OWNERS_SHOULDER } from './shoulder';

/** A player owner standing at `at`, in water or flying when asked. */
const ownerAt = (at: EntityPosition, state: { inWater?: boolean; flying?: boolean } = {}): GoalMob => ({
    id: 'owner',
    position: () => at,
    view: () => ({
        id: () => 'owner',
        flag: (name) => (name === 'in_water' ? state.inWater === true : undefined),
        names: (name) =>
            name === 'is_family' ? ['player', 'mob'] : name === 'has_ability' && state.flying === true ? ['flying'] : []
    })
});

/** A parrot with the goal, whose owner stands at `owner`, ticked once per game tick. */
const parrot = (owner: GoalMob | undefined, flags: { readonly is_sitting?: boolean } = {}) => {
    let clock = 0;
    const mounted: (string | number)[] = [];
    const harness = new GoalHarness({
        goals: { [LAND_ON_OWNERS_SHOULDER]: { priority: 3 } },
        components: { 'minecraft:collision_box': { width: 0.5, height: 0.9 } },
        world: {
            owner: () => owner,
            gameTime: () => clock,
            vehicle: () => undefined,
            mount: (mob) => mounted.push(mob.id)
        },
        flags,
        at: { x: 0, y: 1, z: 0 }
    });
    const ticks = (count: number): void => {
        for (let index = 0; index < count; index += 1) {
            clock += 1;
            harness.tick();
        }
    };
    return { harness, mounted, ticks };
};

describe(LAND_ON_OWNERS_SHOULDER, () => {
    it('lands on the owner its box touches once it has been off a shoulder for more than 100 ticks', () => {
        const { mounted, ticks } = parrot(ownerAt({ x: 0.3, y: 0.5, z: 0 }));
        ticks(100);
        expect(mounted).toEqual([]);
        ticks(4);
        expect(mounted[0]).toBe('owner');
    });

    it('never walks to an owner it does not touch', () => {
        const { harness, mounted, ticks } = parrot(ownerAt({ x: 3, y: 1, z: 0 }));
        ticks(200);
        expect(mounted).toEqual([]);
        expect(harness.actuator.log.filter((line) => line.startsWith('moveTo'))).toEqual([]);
    });

    it('stays off an owner who is in water or flying, and off any owner while it sits', () => {
        for (const owner of [
            ownerAt({ x: 0, y: 1, z: 0 }, { inWater: true }),
            ownerAt({ x: 0, y: 1, z: 0 }, { flying: true })
        ]) {
            const { mounted, ticks } = parrot(owner);
            ticks(200);
            expect(mounted).toEqual([]);
        }
        const { mounted, ticks } = parrot(ownerAt({ x: 0, y: 1, z: 0 }), { is_sitting: true });
        ticks(200);
        expect(mounted).toEqual([]);
    });

    it('needs an owner', () => {
        const { mounted, ticks } = parrot(undefined);
        ticks(200);
        expect(mounted).toEqual([]);
    });
});
