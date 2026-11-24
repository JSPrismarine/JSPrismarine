import { beforeAll, it } from 'vitest';

import { measureScenarios } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import type { JavaReleaseData } from './javaReleaseDatapack.ts';
import { javaReleaseData, javaReleaseDatapackScenarios, readJavaRelease } from './javaReleaseDatapack.ts';
import { describeFamily } from './measure.ts';

/**
 * The Java preview's vanilla datapack through the public loader, with its own target (data pack
 * format 128), against its own data generator reports. The family follows the preview: when a
 * new preview replaces it, this file and its family move to that release.
 */
const RELEASE = '26.4-pre-1';

describeFamily(
    FAMILIES.datapack26_4Pre1,
    [javaReleaseData(RELEASE)],
    () => {
        // The strict load of the whole datapack is the slow part, so it runs once, before the rows.
        let data: JavaReleaseData;
        beforeAll(() => {
            data = readJavaRelease(RELEASE);
        }, 120_000);

        it('loads strict and agrees with its registry report', () => {
            measureScenarios(
                FAMILIES.datapack26_4Pre1,
                import.meta.filename,
                ...javaReleaseDatapackScenarios(data, [
                    {
                        registry: 'minecraft:worldgen/density_function_type',
                        id: 'minecraft:domain_warp',
                        reason: "26.4's domain_warp density function has no reader yet; no vanilla function uses it.",
                        reference: 'issue #3280'
                    }
                ])
            );
        });
    },
    { tags: ['real-data'] }
);
