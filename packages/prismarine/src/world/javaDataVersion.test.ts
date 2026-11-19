import { describe, expect, it } from 'vitest';

import { DEFAULT_JAVA_DATA_TARGET } from '@jsprismarine/packs/javaDataTarget';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';
import { GENERATION_DATA_VERSION } from '@jsprismarine/worldgen/blending/generationVersion';

import { assertJavaDataVersionOpens } from './javaDataVersion';

describe('assertJavaDataVersionOpens', () => {
    const current = DEFAULT_JAVA_DATA_TARGET.dataVersion;

    it('opens a save with no record, an older one or the same one', () => {
        for (const stored of [undefined, current - 26, current]) {
            expect(() => assertJavaDataVersionOpens('world', stored, DEFAULT_JAVA_DATA_TARGET)).not.toThrow();
        }
    });

    it('refuses a save recorded by a newer release', () => {
        expect(() => assertJavaDataVersionOpens('world', current + 1, DEFAULT_JAVA_DATA_TARGET)).toThrow(
            PrismarineWorldErrors.JavaDataDowngrade
        );
    });

    it('stamps chunks with the default target data version', () => {
        // The chunk generation record keeps its own constant; see generationVersion.ts.
        expect(GENERATION_DATA_VERSION).toBe(DEFAULT_JAVA_DATA_TARGET.dataVersion);
    });
});
