import { describe, expect, it } from 'vitest';

import { BASE_KNOCKBACK, behind, livingKnockback } from './knockback';

const STILL = { x: 0, y: 0, z: 0 };

describe("Java's LivingEntity.knockback", () => {
    it('halves the motion and pushes away from what shoves, less the resistance', () => {
        const next = livingKnockback({
            velocity: { x: 0.2, y: 0, z: -0.4 },
            onGround: false,
            resistance: 0.25,
            power: 0.4,
            toward: { x: -3, z: 0 },
            tieBreak: 0
        });
        expect(next.x).toBeCloseTo(0.1 + 0.3);
        expect(next.z).toBeCloseTo(-0.2);
    });

    it('lifts a body on the ground to at most 0.4 and leaves one in the air its vertical motion', () => {
        const shove = { resistance: 0, power: 0.9, toward: { x: 1, z: 0 }, tieBreak: 0 };
        expect(livingKnockback({ ...shove, velocity: STILL, onGround: true }).y).toBeCloseTo(0.4);
        expect(livingKnockback({ ...shove, velocity: { x: 0, y: -0.3, z: 0 }, onGround: false }).y).toBe(-0.3);
        expect(
            livingKnockback({ ...shove, power: 0.1, velocity: { x: 0, y: 0.2, z: 0 }, onGround: true }).y
        ).toBeCloseTo(0.2);
    });

    it('leaves a body that resists every push alone, and pushes one with a negative resistance harder', () => {
        const shove = { velocity: STILL, onGround: false, power: 0.4, toward: { x: 0, z: 1 }, tieBreak: 0 };
        expect(livingKnockback({ ...shove, resistance: 1 })).toBe(STILL);
        expect(livingKnockback({ ...shove, resistance: -1 }).z).toBeCloseTo(-0.8);
        // Java's attribute stops at -2.
        expect(livingKnockback({ ...shove, resistance: -5 }).z).toBeCloseTo(-1.2);
    });

    it('picks the same direction every time for a body standing inside what shoves it', () => {
        const shove = { velocity: STILL, onGround: false, resistance: 0, power: 0.4, toward: STILL, tieBreak: 3 };
        expect(livingKnockback(shove)).toEqual(livingKnockback(shove));
        expect(Math.hypot(livingKnockback(shove).x, livingKnockback(shove).z)).toBeCloseTo(0.4);
    });

    it("shoves with Java's 0.4F and keeps a direction Java's 1.0E-5F squared length keeps (#3799)", () => {
        // `0.4F` widened to a double.
        expect(BASE_KNOCKBACK).toBe(0.4000000059604645);
        const straight = livingKnockback({
            velocity: STILL,
            onGround: false,
            resistance: 0,
            power: BASE_KNOCKBACK,
            toward: { x: 1, z: 0 },
            tieBreak: 0
        });
        expect(straight.x).toBe(-0.4000000059604645);

        // Squared, 9.9999998e-6 is at least `1.0E-5F` (9.99999974e-6) though under 1e-5, so Java
        // shoves along it rather than drawing a new direction.
        const short = livingKnockback({
            velocity: STILL,
            onGround: false,
            resistance: 0,
            power: 1,
            toward: { x: Math.sqrt(9.9999998e-6), z: 0 },
            tieBreak: 2
        });
        expect(short.x).toBeCloseTo(-1, 12);
        expect(short.z).toBe(0);
    });

    it("points behind an entity's yaw, so the push goes the way it faces", () => {
        const facingPlusX = behind(-90);
        const next = livingKnockback({
            velocity: STILL,
            onGround: false,
            resistance: 0,
            power: 1,
            toward: facingPlusX,
            tieBreak: 0
        });
        expect(next.x).toBeCloseTo(1);
        expect(next.z).toBeCloseTo(0);
    });
});
