import { describe, expect, it } from 'vitest';

import {
    LATEST_MOLANG_VERSION,
    MOLANG_VERSIONS,
    molangVersionFor,
    rulesForEngineVersion,
    rulesForMolangVersion
} from './version';

describe('Molang versions', () => {
    it('numbers each entry by its position, oldest first', () => {
        expect(MOLANG_VERSIONS.map((entry) => entry.version)).toEqual(MOLANG_VERSIONS.map((_, index) => index));
        expect(LATEST_MOLANG_VERSION).toBe(MOLANG_VERSIONS.at(-1)!.version);
    });

    it('gives a pack the version BDS 1.26.60.6 wrote for its min_engine_version', () => {
        const measured: readonly [readonly [number, number, number], number][] = [
            [[1, 13, 0], 0],
            [[1, 16, 0], 0],
            [[1, 17, 0], 1],
            [[1, 18, 20], 6],
            [[1, 20, 60], 11],
            [[1, 20, 70], 12],
            [[1, 21, 90], 12],
            [[1, 21, 100], 13],
            [[1, 26, 0], 13],
            [[1, 26, 60], 13]
        ];

        for (const [engine, version] of measured) expect(molangVersionFor(engine), engine.join('.')).toBe(version);
    });

    it('takes the newer of two changes that share an engine version', () => {
        // ExpressionErrorMessages and UnexpectedOperatorErrors both arrived in 1.17.40.
        expect(molangVersionFor([1, 17, 40])).toBe(4);
    });

    it('turns each language rule on at the version that changed it', () => {
        expect(rulesForMolangVersion(4)).toEqual({
            ternaryRightAssociative: false,
            andBeforeOr: false,
            divideByNegativeValue: false
        });
        expect(rulesForMolangVersion(5).ternaryRightAssociative).toBe(true);
        expect(rulesForMolangVersion(5).andBeforeOr).toBe(false);
        expect(rulesForMolangVersion(6).andBeforeOr).toBe(true);
        expect(rulesForMolangVersion(6).divideByNegativeValue).toBe(false);
        expect(rulesForMolangVersion(7).divideByNegativeValue).toBe(true);
        expect(rulesForEngineVersion([1, 19, 60])).toEqual(rulesForMolangVersion(7));
    });
});
