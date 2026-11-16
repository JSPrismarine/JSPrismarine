import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import type { GoalMob, GoalWorld } from '../world';
import { BLAZE_ATTACK, GHAST_SHOOT_FIREBALL, SHULKER_ATTACK } from './mobAttacks';

/** A world with one target at a fixed spot, which records the tick of every bite and shot. */
const arena = (target: GoalMob | undefined, options: { readonly canSee?: boolean } = {}) => {
    let clock = 0;
    const bites: number[] = [];
    const shots: { readonly tick: number; readonly projectile: string | undefined }[] = [];
    let current = target;
    const world: GoalWorld = {
        target: () => current,
        setTarget: (mob) => {
            current = mob;
        },
        canSee: () => options.canSee ?? true,
        attack: () => bites.push(clock),
        shoot: (_mob, projectile) => shots.push({ tick: clock, projectile })
    };
    return {
        world,
        bites,
        shots,
        target: () => current,
        /** Runs the goals one game tick at a time. */
        run: (harness: GoalHarness, ticks: number) => {
            for (let tick = 0; tick < ticks; tick += 1) {
                clock += 1;
                harness.tick();
            }
        }
    };
};

const at = (x: number) => testMob('player', { x, y: 0, z: 0 });

describe(BLAZE_ATTACK, () => {
    const blaze = (world: GoalWorld) =>
        new GoalHarness({
            goals: { [BLAZE_ATTACK]: { priority: 3, projectile: 'minecraft:small_fireball' } },
            components: { 'minecraft:follow_range': { value: 48 } },
            world
        });

    it('charges 60 ticks, fires three fireballs 6 ticks apart and rests 100 ticks', () => {
        const fight = arena(at(10));
        const harness = blaze(fight.world);
        fight.run(harness, 260);

        expect(harness.holderOf('move')).toBe(BLAZE_ATTACK);
        expect(fight.shots.map((shot) => shot.tick)).toEqual([61, 67, 73, 239, 245, 251]);
        expect(fight.shots.every((shot) => shot.projectile === 'minecraft:small_fireball')).toBe(true);
        expect(fight.bites).toEqual([]);
    });

    it('bites a target inside 2 blocks once every 20 ticks, and neither bites nor shoots one it cannot see', () => {
        const fight = arena(at(1.5));
        fight.run(blaze(fight.world), 45);
        expect(fight.bites).toEqual([1, 21, 41]);
        expect(fight.shots).toEqual([]);

        const hidden = arena(at(1.5), { canSee: false });
        hidden.run(blaze(hidden.world), 45);
        expect(hidden.bites).toEqual([]);
    });
});

describe(GHAST_SHOOT_FIREBALL, () => {
    it('fires at the 20th tick of its charge and every 60 ticks after, holding no flag', () => {
        const fight = arena(at(30));
        const harness = new GoalHarness({
            goals: { [GHAST_SHOOT_FIREBALL]: { priority: 7, projectile: 'minecraft:fireball' } },
            world: fight.world
        });
        fight.run(harness, 141);

        expect(harness.isRunning(GHAST_SHOOT_FIREBALL)).toBe(true);
        expect(harness.holderOf('move')).toBeUndefined();
        expect(fight.shots.map((shot) => shot.tick)).toEqual([20, 80, 140]);

        const far = arena(at(64));
        far.run(new GoalHarness({ goals: { [GHAST_SHOOT_FIREBALL]: { priority: 7 } }, world: far.world }), 100);
        expect(far.shots).toEqual([]);
    });
});

describe(SHULKER_ATTACK, () => {
    const shulker = (world: GoalWorld, difficulty = 'normal') =>
        new GoalHarness({
            goals: { [SHULKER_ATTACK]: { priority: 4, projectile: 'minecraft:shulker_bullet' } },
            world,
            worldFacts: { difficulty: () => difficulty },
            randomInt: (bound) => (bound === 10 ? 3 : 0)
        });

    it('fires 20 ticks after it starts, then 20 plus nextInt(10) * 10 ticks apart', () => {
        const fight = arena(at(10));
        fight.run(shulker(fight.world), 121);

        // 20 + 3 * 10 = 50 ticks between bullets.
        expect(fight.shots.map((shot) => shot.tick)).toEqual([20, 70, 120]);
    });

    it('drops a target 20 blocks away, and never attacks on peaceful', () => {
        const far = arena(at(20));
        far.run(shulker(far.world), 30);
        expect(far.shots).toEqual([]);
        expect(far.target()).toBeUndefined();

        const calm = arena(at(10));
        calm.run(shulker(calm.world, 'peaceful'), 30);
        expect(calm.shots).toEqual([]);
    });
});
