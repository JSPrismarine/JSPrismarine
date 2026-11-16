import { describe, expect, it } from 'vitest';

import {
    JAVA_PROJECTILE_HITS,
    grantedExperience,
    projectileHitEffects,
    projectileHitEvent,
    projectileKnockback
} from './projectileImpact';
import { scriptedRandom } from './testing';

describe('projectile impact', () => {
    describe('knockback', () => {
        it('pushes a body at rest 0.4 along the flight and lifts it 0.4, as LivingEntity.knockback does', () => {
            const next = projectileKnockback({
                velocity: { x: 0, y: 0, z: 0 },
                direction: { x: 1.3, z: 0 },
                resistance: 0,
                onGround: true,
                punch: 0
            });
            expect(next.x).toBeCloseTo(0.4);
            expect(next.y).toBeCloseTo(0.4);
            expect(next.z).toBeCloseTo(0);
        });

        it('halves what the body was doing and leaves a body in the air its fall', () => {
            const next = projectileKnockback({
                velocity: { x: 0.2, y: -0.3, z: 0 },
                direction: { x: 0, z: -2 },
                resistance: 0,
                onGround: false,
                punch: 0
            });
            expect(next).toEqual({ x: 0.1, y: -0.3, z: -0.4 });
        });

        it('takes the resistance off the push, and a body that resists it all stays put', () => {
            const half = projectileKnockback({
                velocity: { x: 0, y: 0, z: 0 },
                direction: { x: 1, z: 0 },
                resistance: 0.5,
                onGround: true,
                punch: 0
            });
            expect(half.x).toBeCloseTo(0.2);
            expect(half.y).toBeCloseTo(0.2);
            const still = { x: 0.1, y: 0, z: 0 };
            expect(
                projectileKnockback({
                    velocity: still,
                    direction: { x: 1, z: 0 },
                    resistance: 1,
                    onGround: true,
                    punch: 0
                })
            ).toBe(still);
        });

        it("adds Punch's 0.6 a level and 0.1 of lift", () => {
            const next = projectileKnockback({
                velocity: { x: 0, y: 0, z: 0 },
                direction: { x: 1, z: 0 },
                resistance: 0,
                onGround: true,
                punch: 2
            });
            expect(next.x).toBeCloseTo(0.4 + 1.2);
            expect(next.y).toBeCloseTo(0.5);
        });
    });

    it('gives the effects for the difficulty, and none whose duration is nothing', () => {
        const onHit = {
            mob_effect: {
                effects: [{ effect: 'wither', amplifier: 1, durationeasy: 0, durationnormal: 200, durationhard: 800 }]
            }
        };
        expect(projectileHitEffects(onHit, 'normal')).toEqual([
            { id: 'minecraft:wither', durationTicks: 200, amplifier: 1 }
        ]);
        expect(projectileHitEffects(onHit, 'hard')[0]?.durationTicks).toBe(800);
        expect(projectileHitEffects(onHit, 'easy')).toEqual([]);
        expect(projectileHitEffects({}, 'normal')).toEqual([]);
    });

    it('grants experience between the bounds', () => {
        const onHit = { grant_xp: { minXP: 3, maxXP: 11 } };
        expect(grantedExperience(onHit, scriptedRandom([0]))).toBe(3);
        expect(grantedExperience(onHit, scriptedRandom([0.99]))).toBe(11);
        expect(grantedExperience({}, scriptedRandom([0.5]))).toBe(0);
    });

    it("drops a bottle o' enchanting's experience as Java's 3 + nextInt(5) + nextInt(5)", () => {
        const experience = JAVA_PROJECTILE_HITS.get('minecraft:xp_bottle')?.experience;
        expect(experience?.(scriptedRandom([0.15]))).toBe(3);
        expect(experience?.(scriptedRandom([0.99]))).toBe(11);
        expect(experience?.(scriptedRandom([0.5, 0.1]))).toBe(5);
    });

    it('reads which entities a definition event fires on', () => {
        expect(
            projectileHitEvent({
                definition_event: {
                    affect_projectile: true,
                    event_trigger: { event: 'minecraft:explode', target: 'self' }
                }
            })
        ).toEqual({ event: 'minecraft:explode', projectile: true, target: false, shooter: false });
        expect(projectileHitEvent({ definition_event: {} })).toBeUndefined();
    });
});
