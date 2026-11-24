/**
 * The `experience-orbs` mechanic of the `gameplay.mechanics` family: Java 26.3's `ExperienceOrb`
 * and its pickup, run through the server's own orb system over the real content stack.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { repairWithExperience } from '@jsprismarine/prismarine/enchantment/mending';
import { orbViewOf } from '@jsprismarine/prismarine/entity/data/experienceOrbs';
import { TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';
import { Item } from '@jsprismarine/prismarine/item/Item';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { gameplayId } from './javaGameplay.ts';
import type { RealStack } from './serverStack.ts';
import { buildRealStack } from './serverStack.ts';

/** One gameplay identifier a scenario compares, such as `mechanic/experience-orbs`. */
interface OrbSubject {
    readonly id: string;
}

const MECHANIC: OrbSubject = { id: gameplayId('mechanic', 'experience-orbs') };

/** Java's `ExperienceOrb.getExperienceValue`: the largest orb size that fits a payout. */
const JAVA_ORB_SIZES = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1] as const;

/** Java's `ExperienceOrb.award` split of a payout, one `getExperienceValue` at a time. */
const javaAward = (points: number): number[] => {
    const sizes: number[] = [];
    for (let left = points; left > 0;) {
        const size = JAVA_ORB_SIZES.find((candidate) => left >= candidate) ?? 1;
        sizes.push(size);
        left -= size;
    }
    return sizes;
};

/** Java's `followNearbyPlayer` pull in its first tick, toward a player `distance` blocks off along x. */
const javaFirstPull = (distance: number): number => {
    // Player.getEyeHeight for a standing player is 1.62, and the orb aims at half of it.
    const toward = { x: distance, y: 1.62 / 2 };
    const length = Math.hypot(toward.x, toward.y);
    const closeness = 1 - length / 8;
    return ((closeness * closeness * 0.1) / length) * toward.x;
};

let orbStack: RealStack | undefined;

/** A stack of its own, so ticking it moves nothing another scenario left in the shared one. */
const stack = (): RealStack => {
    orbStack ??= buildRealStack(new TestEntityWorld());
    return orbStack;
};

/** Where the orbs lie: on the test world's floor, far from anything another scenario placed. */
const GROUND: EntityPosition = { x: 60_000.5, y: 64, z: 60_000.5 };

/** Runs ticks the way the world does: each inside an open tick of the change log. */
const step = (real: RealStack, ticks = 1): void => {
    for (let tick = 0; tick < ticks; tick += 1) {
        real.runtime.store.beginTick();
        real.runtime.tick(tick);
        real.runtime.store.sealTick();
        real.world.advance();
    }
};

/** Spawns orbs of a value at rest on the floor, in one tick. */
const restingOrbs = (real: RealStack, value: number, count: number) => {
    real.runtime.store.beginTick();
    const spawned = Array.from({ length: count }, () => real.runtime.experienceOrbs.spawn(GROUND, value));
    for (const orb of spawned) if (orb !== undefined) orb.body.velocity = { x: 0, y: 0, z: 0 };
    real.runtime.store.sealTick();
    return spawned.filter((orb) => orb !== undefined);
};

/** Runs a scenario over the orb stack, and clears the players and every entity after. */
const withStack = (run: (real: RealStack) => string | undefined): string | undefined => {
    const real = stack();
    try {
        return run(real);
    } finally {
        real.world.players = [];
        real.world.orbsTaken.length = 0;
        real.runtime.store.beginTick();
        for (const entity of real.runtime.entities().toArray())
            if (entity.removed === undefined) real.runtime.remove(entity.id, 'parity experience orb scenario complete');
        real.runtime.store.sealTick();
    }
};

const playerAt = (x: number, spectator = false) => ({
    id: 900_000,
    identifier: 'minecraft:player',
    position: { x, y: GROUND.y, z: GROUND.z },
    ...(spectator ? { spectator } : {})
});

/** The scenarios that compare the server's experience orbs with Java's, one row each. */
export const experienceOrbScenarios: readonly BehaviorScenario<OrbSubject>[] = [
    {
        name: 'experience-orb-award',
        java: 'A payout splits into the largest of the eleven orb sizes that fits, from 2477 down to 1, until nothing is left.',
        reference: 'Java ExperienceOrb.award and getExperienceValue',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () =>
            withStack((real) => {
                // Every payout to 300, where each size first appears, and the larger sizes' edges.
                const payouts = [
                    ...Array.from({ length: 301 }, (_, points) => points),
                    616,
                    617,
                    1236,
                    1237,
                    2476,
                    2477,
                    5000
                ];
                for (const [index, points] of payouts.entries()) {
                    // A spot of its own for each payout, so no award joins an orb of another.
                    const at = { ...GROUND, x: GROUND.x + index * 4 };
                    real.runtime.store.beginTick();
                    real.runtime.experienceOrbs.award(at, points);
                    real.runtime.store.sealTick();
                    const sizes = real.runtime
                        .entities()
                        .toArray()
                        .flatMap((entity) => {
                            const orb = entity.removed === undefined ? orbViewOf(entity) : undefined;
                            return orb === undefined ? [] : Array.from({ length: orb.count }, () => orb.value);
                        })
                        .sort((left, right) => right - left);
                    real.runtime.store.beginTick();
                    for (const entity of real.runtime.entities().toArray())
                        if (entity.removed === undefined) real.runtime.remove(entity.id, 'parity award checked');
                    real.runtime.store.sealTick();
                    const java = javaAward(points);
                    if (sizes.join(',') !== java.join(','))
                        return `${points} points drop as ${sizes.join(',') || 'nothing'}, Java ${java.join(',') || 'nothing'}`;
                }
                return undefined;
            })
    },
    {
        name: 'experience-orb-merge',
        java: 'On its first tick, and every twentieth after, an orb draws in the orbs of its value around it whose entity ids differ from its own by a multiple of 40.',
        reference: 'Java ExperienceOrb.scanForMerges, canMerge and merge',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () =>
            withStack((real) => {
                // Eighty orbs with consecutive ids fall in forty groups of two.
                const spawned = restingOrbs(real, 3, 80);
                if (spawned.length !== 80) return `the server spawned ${spawned.length} of 80 orbs`;
                step(real);
                const left = spawned.filter((orb) => orb.removed === undefined);
                const counts = left.map((orb) => orbViewOf(orb)?.count ?? 0);
                const total = counts.reduce((sum, count) => sum + count, 0);
                if (left.length !== 40 || counts.some((count) => count !== 2))
                    return `80 orbs in 40 groups became ${left.length} orbs holding ${counts.join(',')}, Java 40 orbs of 2`;
                return total === 80 ? undefined : `the orbs hold ${total} orbs after merging, not 80`;
            })
    },
    {
        name: 'experience-orb-follow',
        java: 'An orb is pulled toward the nearest player within 8 blocks, at (1 - d / 8)^2 * 0.1 blocks a tick toward half the eye height, and not toward a spectator or a player further away.',
        reference: 'Java ExperienceOrb.followNearbyPlayer',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () =>
            withStack((real) => {
                for (const [distance, spectator] of [
                    [5, false],
                    [9, false],
                    [5, true]
                ] as const) {
                    const [orb] = restingOrbs(real, 1, 1);
                    if (orb === undefined) return 'the server spawned no orb';
                    real.world.players = [playerAt(GROUND.x + distance, spectator)];
                    step(real);
                    const moved = orb.position.x - GROUND.x;
                    const java = distance < 8 && !spectator ? javaFirstPull(distance) : 0;
                    real.runtime.remove(orb.id, 'parity experience orb scenario step');
                    if (Math.abs(moved - java) > 1e-6) {
                        const who = spectator ? 'a spectator' : 'a player';
                        return `an orb ${distance} blocks from ${who} moves ${moved.toFixed(5)} toward it in a tick, Java ${java.toFixed(5)}`;
                    }
                }
                return undefined;
            })
    },
    {
        name: 'experience-orb-pickup',
        java: 'A player standing against orbs takes one every second tick, worth the orb’s value, and an orb whose last one is taken is gone.',
        reference: 'Java ExperienceOrb.playerTouch and Player.takeXpDelay',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () =>
            withStack((real) => {
                // Consecutive ids, so the three never merge and each is one orb.
                const spawned = restingOrbs(real, 7, 3);
                real.world.players = [playerAt(GROUND.x + 1)];
                const taken: number[] = [];
                for (let tick = 1; tick <= 6; tick += 1) {
                    step(real);
                    taken.push(real.world.orbsTaken.length);
                }
                const java = [1, 1, 2, 2, 3, 3];
                if (taken.join(',') !== java.join(','))
                    return `over six ticks the player has taken ${taken.join(',')} orbs, Java ${java.join(',')}`;
                if (real.world.orbsTaken.some((orb) => orb.value !== 7)) return 'an orb was worth other than its value';
                return spawned.every((orb) => orb.removed !== undefined)
                    ? undefined
                    : 'an orb whose one orb was taken is still in the world';
            })
    },
    {
        name: 'experience-orb-mending',
        java: 'An orb taken by a player with damaged Mending gear repairs 2 durability per point and gives the player only the points the repair left over.',
        reference: 'Java ExperienceOrb.repairPlayerItems and data/minecraft/enchantment/mending.json',
        subjects: () => [{ id: gameplayId('enchantment', 'minecraft:mending') }, MECHANIC],
        idOf: (entry) => entry.id,
        aspects: (entry) => [entry.id.startsWith('enchantment/') ? 'effect' : 'behavior'],
        run: () => {
            const registry = stack().content.enchantments;
            const pickaxe = (spent: number): Item => {
                const item = new Item({ name: 'minecraft:diamond_pickaxe', enchantments: { 'minecraft:mending': 1 } });
                return item.withDurability(item.getMaxDurability() - spent);
            };
            const cases = [
                // Three durability costs floor(3 * 7 / 14) = 1 point.
                { spent: 3, points: 7, repaired: 3, remaining: 6 },
                { spent: 100, points: 7, repaired: 14, remaining: 0 }
            ];
            for (const { spent, points, repaired, remaining } of cases) {
                const held = pickaxe(spent);
                const outcome = repairWithExperience(registry, { mainhand: held }, points, () => 0);
                const fixed =
                    (outcome.repaired.get('mainhand')?.getDurability() ?? held.getDurability()) - held.getDurability();
                if (fixed !== repaired || outcome.remaining !== remaining)
                    return `${points} points on a pickaxe ${spent} short repair ${fixed} and leave ${outcome.remaining}, Java ${repaired} and ${remaining}`;
            }
            return undefined;
        }
    }
];
