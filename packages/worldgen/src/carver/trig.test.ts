import { describe, expect, it } from 'vitest';

import { mthTrig, ROUNDING_MTH_TRIG, SINCE_ROUNDED_MTH_TRIG, TRUNCATING_MTH_TRIG } from './trig';

/** One table step, `2π / 65536`, and an angle 1.7 steps along, where truncating and rounding part. */
const STEP = 1 / 10430.378350470453;

/**
 * `angle Mth.sin Mth.cos` as each release's jar prints them, from a probe class calling `Mth` on
 * the 26.3 and 26.4 Snapshot 10 server classpaths. Java prints the shortest decimal that reads
 * back as the same float.
 */
const JAVA: Readonly<Record<'26.3' | '26.4', readonly (readonly [number, number, number])[]>> = {
    '26.3': [
        [0, 0, 1],
        [1.7 * STEP, 9.58738e-5, 1],
        [-1.7 * STEP, -9.58738e-5, 1],
        [Math.PI / 2, 1, 1.2246469e-16],
        [-Math.PI / 2, -1, 0],
        [Math.PI, 1.2246469e-16, -1],
        [0.3, 0.29550982, 0.9553397],
        [-0.3, -0.29550982, 0.95531136],
        [2.5, 0.5985448, -0.80108935],
        [-100, 0.5064347, 0.86227834]
    ],
    '26.4': [
        [0, 0, 1],
        [1.7 * STEP, 1.917476e-4, 1],
        [-1.7 * STEP, -1.917476e-4, 1],
        [Math.PI / 2, 1, 0],
        [-Math.PI / 2, -1, 0],
        [Math.PI, 0, -1],
        [0.3, 0.29550982, 0.9553397],
        [-0.3, -0.29550982, 0.9553397],
        [2.5, 0.598468, -0.80114675],
        [-100, 0.506352, 0.86232686]
    ]
};

describe("Java's Mth.sin and Mth.cos", () => {
    for (const [release, trig] of [
        ['26.3', TRUNCATING_MTH_TRIG],
        ['26.4', ROUNDING_MTH_TRIG]
    ] as const) {
        it(`reads the same table entries as ${release}`, () => {
            for (const [angle, sin, cos] of JAVA[release]) {
                expect([angle, trig.sin(angle), trig.cos(angle)]).toEqual([angle, Math.fround(sin), Math.fround(cos)]);
            }
        });
    }

    it('picks the rounding lookup from data pack format 128 on', () => {
        expect(mthTrig(undefined)).toBe(TRUNCATING_MTH_TRIG);
        expect(mthTrig(SINCE_ROUNDED_MTH_TRIG - 1)).toBe(TRUNCATING_MTH_TRIG);
        expect(mthTrig(SINCE_ROUNDED_MTH_TRIG)).toBe(ROUNDING_MTH_TRIG);
    });
});
