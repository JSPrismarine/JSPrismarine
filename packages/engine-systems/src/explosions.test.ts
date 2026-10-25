import { describe, expect, it } from 'vitest';

import type { ExplosionEntity } from './explosions';
import {
    EXPLOSION_RAY_DECAY,
    EXPLOSION_RAY_STEP,
    calculateExplodedPositions,
    explode,
    explosionDamage,
    explosionResistanceOf,
    getSeenPercent
} from './explosions';
import type { TestWorld } from './testWorld';
import { createTestWorld } from './testWorld';
import type { BlockPosition } from './world';
import { block } from './world';

/**
 * A world whose every ray draw is the median, so a blast is reproducible.
 *
 * `0.5` makes `radius * (0.7 + 0.5 * 0.6)` exactly the radius, which is what every expected
 * number below is worked out from.
 */
const world = (options: { randomFloat?: number } = {}): TestWorld =>
    createTestWorld({ randomFloat: () => options.randomFloat ?? 0.5 });

/** Fills a cube of one block, centered on the origin. */
const fill = (into: TestWorld, name: string, half: number, at: BlockPosition = { x: 0, y: 0, z: 0 }): void => {
    for (let x = at.x - half; x <= at.x + half; x += 1) {
        for (let y = at.y - half; y <= at.y + half; y += 1) {
            for (let z = at.z - half; z <= at.z + half; z += 1) {
                into.place({ x, y, z }, block(name));
            }
        }
    }
};

/** The middle of the block at the origin, which is where every blast below starts. */
const CENTER = { x: 0.5, y: 0.5, z: 0.5 };

/**
 * How far a ray gets through a solid medium, worked out from Java's own constants.
 *
 * Every step inside a block costs `0.22500001` for the step plus `(resistance + 0.3) * 0.3`
 * for the block, so a ray that starts at `intensity` survives `ceil(intensity / cost)` steps
 * and the last one it marks sits `0.3 * (steps - 1)` blocks from the center.
 */
const penetration = (intensity: number, resistance: number): number => {
    const cost = EXPLOSION_RAY_DECAY + (resistance + 0.3) * 0.3;
    return EXPLOSION_RAY_STEP * (Math.ceil(intensity / cost) - 1);
};

/** An entity standing at a position, sized like the thing it is named after. */
const standing = (x: number, y: number, z: number, width = 0.6, height = 1.8): ExplosionEntity => ({
    box: {
        minX: x - width / 2,
        minY: y,
        minZ: z - width / 2,
        maxX: x + width / 2,
        maxY: y + height,
        maxZ: z + width / 2
    },
    position: { x, y, z },
    eye: { x, y: y + height * 0.85, z }
});

describe('explosions', () => {
    describe('blast resistance', () => {
        it('reads the Java number off the mapping table', () => {
            expect(explosionResistanceOf(block('minecraft:stone'))).toBe(6);
            expect(explosionResistanceOf(block('minecraft:obsidian'))).toBe(1200);
            expect(explosionResistanceOf(block('minecraft:water'))).toBe(100);
        });

        it('answers nothing for air, which costs a ray nothing at all', () => {
            expect(explosionResistanceOf(block('minecraft:air'))).toBeUndefined();
        });

        it('answers zero for a block with no Java source, which still costs a ray 0.09', () => {
            expect(explosionResistanceOf(block('minecraft:element_1'))).toBe(0);
        });
    });

    describe('the ray cast', () => {
        it('fires one ray per cell on the surface of the 16-cube and none from inside it', () => {
            const empty = world();
            let draws = 0;
            empty.setRandomFloat(() => {
                draws += 1;
                return 0.5;
            });

            calculateExplodedPositions(empty, CENTER, 4);

            // 16³ cells less the 14³ that are not on a face.
            expect(draws).toBe(16 ** 3 - 14 ** 3);
            expect(draws).toBe(1352);
        });

        it('marks air as well as blocks, which is what Java collects for fire to land on', () => {
            const empty = world();

            const positions = calculateExplodedPositions(empty, CENTER, 4);

            expect(positions.length).toBeGreaterThan(0);
            expect(positions.every((at) => empty.nameAt(at) === 'minecraft:air')).toBe(true);
        });

        it('reaches no further than the median draw allows in open air', () => {
            const empty = world();

            const positions = calculateExplodedPositions(empty, CENTER, 4);
            const furthest = Math.max(...positions.map((at) => Math.hypot(at.x, at.y, at.z)));

            // An air step costs only the flat decay, so the ray survives ceil(4 / 0.225) steps.
            expect(furthest).toBeLessThanOrEqual(penetration(4, -0.3) + 1);
        });
    });

    describe('what a blast takes out', () => {
        it('clears a hole in dirt about two blocks across', () => {
            const digging = world();
            fill(digging, 'minecraft:dirt', 8);

            const blast = explode(digging, { center: CENTER, radius: 4 });
            const cleared = blast.positions.filter((at) => digging.nameAt(at) === 'minecraft:air');
            const furthest = Math.max(...cleared.map((at) => Math.hypot(at.x, at.y, at.z)));

            expect(blast.broken).toBeGreaterThan(0);
            expect(furthest).toBeLessThanOrEqual(penetration(4, 0.5) + 1);
        });

        it('barely dents stone, because each block costs a ray 1.98', () => {
            const buried = world();
            fill(buried, 'minecraft:stone', 8);

            const blast = explode(buried, { center: CENTER, radius: 4 });

            // 0.22500001 + (6 + 0.3) * 0.3 is 2.115, so an intensity of 4 survives two steps
            // and the second one lands 0.3 blocks out, inside the block it started in.
            expect(penetration(4, 6)).toBeCloseTo(0.3, 6);
            expect(blast.broken).toBe(1);
            expect(buried.nameAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:air');
        });

        it('cannot shift obsidian, whose 1200 outruns any vanilla blast', () => {
            const bouncing = world();
            fill(bouncing, 'minecraft:obsidian', 8);

            // The strongest ray a charged creeper can draw is 6 * 1.3, and one block of
            // obsidian costs 360.09.
            const blast = explode(bouncing, { center: CENTER, radius: 6, breaksBlocks: true });

            expect(blast.broken).toBe(0);
            expect(bouncing.nameAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:obsidian');
        });

        it('is stopped by water where stone only slows it', () => {
            const moat = world();
            fill(moat, 'minecraft:water', 8);

            expect(explode(moat, { center: CENTER, radius: 4 }).broken).toBe(0);
        });

        it('leaves the blocks behind a wall standing', () => {
            const shielded = world();
            // A pane of obsidian two blocks east, and dirt everywhere beyond it.
            for (let y = -6; y <= 6; y += 1) {
                for (let z = -6; z <= 6; z += 1) {
                    shielded.place({ x: 2, y, z }, block('minecraft:obsidian'));
                    for (let x = 3; x <= 8; x += 1) shielded.place({ x, y, z }, block('minecraft:dirt'));
                }
            }
            // And dirt to the west, with nothing in the way.
            for (let y = -6; y <= 6; y += 1) {
                for (let z = -6; z <= 6; z += 1) {
                    for (let x = -8; x <= -1; x += 1) shielded.place({ x, y, z }, block('minecraft:dirt'));
                }
            }

            explode(shielded, { center: CENTER, radius: 4 });

            expect(shielded.nameAt({ x: -1, y: 0, z: 0 })).toBe('minecraft:air');
            expect(shielded.nameAt({ x: 2, y: 0, z: 0 })).toBe('minecraft:obsidian');
            expect(shielded.nameAt({ x: 3, y: 0, z: 0 })).toBe('minecraft:dirt');
            expect(shielded.nameAt({ x: 4, y: 0, z: 0 })).toBe('minecraft:dirt');
        });

        it('leaves the world alone when the host asks for no block damage', () => {
            const polite = world();
            fill(polite, 'minecraft:dirt', 8);

            const blast = explode(polite, { center: CENTER, radius: 4, breaksBlocks: false });

            expect(blast.broken).toBe(0);
            expect(blast.positions.length).toBeGreaterThan(0);
            expect(polite.nameAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:dirt');
        });

        it('hands each block to the host before clearing it, which is where loot is rolled', () => {
            const digging = world();
            fill(digging, 'minecraft:dirt', 8);

            const seen: string[] = [];
            explode(digging, {
                center: CENTER,
                radius: 4,
                onBlockDestroyed: (at, destroyed) => {
                    expect(digging.nameAt(at)).toBe('minecraft:dirt');
                    seen.push(destroyed.name);
                }
            });

            expect(seen.length).toBeGreaterThan(0);
            expect(new Set(seen)).toEqual(new Set(['minecraft:dirt']));
        });

        it('stops at the bottom of the world rather than writing below it', () => {
            const floor = createTestWorld({ randomFloat: () => 0.5, minY: 0, maxY: 15 });
            fill(floor, 'minecraft:dirt', 8, { x: 0, y: 1, z: 0 });

            explode(floor, { center: { x: 0.5, y: 1.5, z: 0.5 }, radius: 4 });

            expect(floor.nameAt({ x: 0, y: -1, z: 0 })).toBe('minecraft:air');
        });
    });

    describe('exposure', () => {
        it('is all of it with nothing in the way', () => {
            expect(getSeenPercent(world(), CENTER, standing(3, 0, 0).box)).toBe(1);
        });

        it('is none of it behind a solid wall', () => {
            const shielded = world();
            for (let y = -2; y <= 4; y += 1) {
                for (let z = -3; z <= 3; z += 1) shielded.place({ x: 1, y, z }, block('minecraft:stone'));
            }

            expect(getSeenPercent(shielded, CENTER, standing(3, 0, 0).box)).toBe(0);
        });

        it('grades a partial wall rather than answering all or nothing', () => {
            const half = world();
            // Knee-high cover right against it: the legs are hidden and the head is not.
            for (let z = -3; z <= 3; z += 1) half.place({ x: 2, y: 0, z }, block('minecraft:stone'));

            const seen = getSeenPercent(half, CENTER, standing(3, 0, 0).box);

            expect(seen).toBeGreaterThan(0);
            expect(seen).toBeLessThan(1);
        });

        it('lets a blast through a fence, which has no full cube to cast a shadow', () => {
            const fenced = world();
            for (let y = -2; y <= 4; y += 1) {
                for (let z = -3; z <= 3; z += 1) fenced.place({ x: 1, y, z }, block('minecraft:oak_fence'));
            }

            expect(getSeenPercent(fenced, CENTER, standing(3, 0, 0).box)).toBe(1);
        });
    });

    describe('damage', () => {
        it('falls away steeply with distance', () => {
            const close = explosionDamage(3, 1, 1);
            const middling = explosionDamage(3, 3, 1);
            const far = explosionDamage(3, 5, 1);

            expect(close).toBeGreaterThan(middling);
            expect(middling).toBeGreaterThan(far);
            expect(far).toBeGreaterThan(0);
        });

        it('is vanilla at point blank, which is 43 half-hearts for a creeper', () => {
            // ((1² + 1) / 2) * 7 * 6 + 1.
            expect(explosionDamage(3, 0, 1)).toBe(43);
        });

        it('comes to one for anything in range with no exposure at all', () => {
            expect(explosionDamage(4, 3, 0)).toBe(1);
        });

        it('is the flat one at the very edge of the reach', () => {
            expect(explosionDamage(4, 8, 1)).toBe(1);
        });
    });

    describe('what a blast does to an entity', () => {
        it('catches what is in reach and passes over what is not', () => {
            const open = world();

            const blast = explode(open, {
                center: CENTER,
                radius: 3,
                breaksBlocks: false,
                entities: [standing(1, 0, 0), standing(20, 0, 0)]
            });

            expect(blast.hits).toHaveLength(1);
            expect(blast.hits[0]?.entity.position.x).toBe(1);
        });

        it('passes over anything the host marked immune', () => {
            const open = world();
            const ghost = { ...standing(1, 0, 0), immune: true };

            expect(explode(open, { center: CENTER, radius: 3, breaksBlocks: false, entities: [ghost] }).hits).toEqual(
                []
            );
        });

        it('hurts less through cover, and still hurts', () => {
            const shielded = world();
            for (let y = -2; y <= 4; y += 1) {
                for (let z = -3; z <= 3; z += 1) shielded.place({ x: 1, y, z }, block('minecraft:obsidian'));
            }

            const covered = explode(shielded, {
                center: CENTER,
                radius: 3,
                breaksBlocks: false,
                entities: [standing(3, 0, 0)]
            }).hits[0];
            const exposed = explode(world(), {
                center: CENTER,
                radius: 3,
                breaksBlocks: false,
                entities: [standing(3, 0, 0)]
            }).hits[0];

            expect(covered?.seen).toBe(0);
            expect(covered?.damage).toBe(1);
            expect(exposed?.seen).toBe(1);
            expect(exposed?.damage).toBeGreaterThan(covered!.damage);
        });

        it('throws what it catches away from the center', () => {
            const open = world();

            const hit = explode(open, {
                center: CENTER,
                radius: 3,
                breaksBlocks: false,
                entities: [standing(2.5, 0, 0.5)]
            }).hits[0];

            expect(hit?.knockback.x).toBeGreaterThan(0);
            expect(hit?.knockback.z).toBeCloseTo(0, 10);
        });

        it('shoves a nearer entity harder than a further one', () => {
            const open = world();

            const [near, far] = explode(open, {
                center: CENTER,
                radius: 3,
                breaksBlocks: false,
                entities: [standing(1.5, 0, 0), standing(4.5, 0, 0)]
            }).hits;

            expect(Math.abs(near!.knockback.x)).toBeGreaterThan(Math.abs(far!.knockback.x));
        });

        it('does not shove something with full explosion knockback resistance', () => {
            const open = world();
            const anchored = { ...standing(2, 0, 0), knockbackResistance: 1 };

            const hit = explode(open, { center: CENTER, radius: 3, breaksBlocks: false, entities: [anchored] }).hits[0];

            expect(Math.hypot(hit!.knockback.x, hit!.knockback.y, hit!.knockback.z)).toBe(0);
            expect(hit?.damage).toBeGreaterThan(1);
        });

        it('hurts nothing at all below the minimum radius', () => {
            const open = world();

            expect(
                explode(open, { center: CENTER, radius: 0, breaksBlocks: false, entities: [standing(0, 0, 0)] }).hits
            ).toEqual([]);
        });
    });
});
