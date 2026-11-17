import { describe, expect, it } from 'vitest';

import { SULFUR_CUBE_KNOCKBACK, sulfurCubeKnockback } from './sulfurCubeKnockback';
import type { SulfurCubeShove } from './sulfurCubeKnockback';

const REGULAR = SULFUR_CUBE_KNOCKBACK.get('regular')!;
const LIGHT = SULFUR_CUBE_KNOCKBACK.get('light')!;

/** A player three blocks west of a cube, level with it, looking at its center. */
const levelHit = (overrides: Partial<SulfurCubeShove> = {}): SulfurCubeShove => ({
    velocity: { x: 0, y: 0, z: 0 },
    position: { x: 3, y: 64, z: 0 },
    height: 1,
    resistance: 0,
    modifiers: REGULAR,
    attacker: { position: { x: 0, y: 64, z: 0 }, eye: { x: 0, y: 65.62, z: 0 }, look: { x: 3, y: -1.12, z: 0 } },
    toward: { x: -3, z: 0 },
    power: 0.4,
    damage: 1,
    extra: false,
    ...overrides
});

describe("Java's SulfurCube.knockback", () => {
    it('pushes straight away from a look at its center and adds to what the cube was doing', () => {
        const still = sulfurCubeKnockback(levelHit());
        expect(still.x).toBeGreaterThan(0);
        expect(still.z).toBeCloseTo(0);
        expect(still.y).toBeGreaterThan(0);

        const moving = sulfurCubeKnockback(levelHit({ velocity: { x: 0.5, y: 0, z: 0.5 } }));
        expect(moving.x).toBeCloseTo(still.x + 0.5);
        expect(moving.z).toBeCloseTo(0.5);
    });

    it("lifts by the archetype's vertical power, so a light cube rises twice as fast as a regular one", () => {
        const regular = sulfurCubeKnockback(levelHit());
        const light = sulfurCubeKnockback(levelHit({ modifiers: LIGHT }));
        expect(light.y / regular.y).toBeCloseTo(LIGHT.vertical / REGULAR.vertical);
        expect(light.x).toBeCloseTo(regular.x);
    });

    it('turns the push 1.6 times as far as the look is off the center', () => {
        // Looking 10 degrees to the left of the center.
        const off = (10 * Math.PI) / 180;
        const pushed = sulfurCubeKnockback(
            levelHit({
                attacker: {
                    position: { x: 0, y: 64, z: 0 },
                    eye: { x: 0, y: 65.62, z: 0 },
                    look: { x: Math.cos(off) * 3, y: -1.12, z: Math.sin(off) * 3 }
                }
            })
        );
        const turned = Math.atan2(pushed.z, pushed.x);
        expect(Math.abs(turned)).toBeCloseTo(off * 1.6);
    });

    it('moves power from across to up for a look low on the cube', () => {
        const high = sulfurCubeKnockback(
            levelHit({ attacker: { ...levelHit().attacker, look: { x: 3, y: -1.0, z: 0 } } })
        );
        const low = sulfurCubeKnockback(
            levelHit({ attacker: { ...levelHit().attacker, look: { x: 3, y: -1.6, z: 0 } } })
        );
        expect(low.y).toBeGreaterThan(high.y);
        expect(low.x).toBeLessThan(high.x);
    });

    it("scales by the blow's square root, an extra push by its strength too, and the cube's resistance", () => {
        const one = sulfurCubeKnockback(levelHit());
        const four = sulfurCubeKnockback(levelHit({ damage: 4 }));
        expect(four.x).toBeCloseTo(one.x * 2);
        const extra = sulfurCubeKnockback(levelHit({ extra: true, power: 2 }));
        expect(extra.x).toBeCloseTo(one.x * 2 * 0.25);
        // A cube's archetype can leave its resistance below 0, which pushes it harder.
        const negative = sulfurCubeKnockback(levelHit({ resistance: -1 }));
        expect(negative.x).toBeCloseTo(one.x * 2);
    });
});
