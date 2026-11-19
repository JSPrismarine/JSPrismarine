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
const RELEASE = '26.4-snapshot-10';

describeFamily(
    FAMILIES.datapack26_4Snapshot10,
    [javaReleaseData(RELEASE)],
    () => {
        // The strict load of the whole datapack is the slow part, so it runs once, before the rows.
        let data: JavaReleaseData;
        beforeAll(() => {
            data = readJavaRelease(RELEASE);
        }, 120_000);

        it('loads strict and agrees with its registry report', () => {
            measureScenarios(
                FAMILIES.datapack26_4Snapshot10,
                import.meta.filename,
                ...javaReleaseDatapackScenarios(data, [
                    {
                        registry: 'minecraft:worldgen/feature_type',
                        id: 'minecraft:crevasse',
                        reason: "26.4's water-filled crevasses in the ice caves have no reader yet.",
                        reference: 'issue #3279'
                    },
                    {
                        registry: 'minecraft:worldgen/density_function_type',
                        id: 'minecraft:domain_warp',
                        reason: "26.4's domain_warp density function has no reader yet; no vanilla function uses it.",
                        reference: 'issue #3280'
                    },
                    {
                        registry: 'minecraft:block_sound_set',
                        reason: "26.4's block sound sets have no loader yet.",
                        reference: 'issue #3286'
                    },
                    {
                        registry: 'minecraft:dispense_behavior',
                        reason: "26.4's data-driven dispenser behaviors have no loader yet.",
                        reference: 'issue #3286'
                    }
                ])
            );
        });
    },
    { tags: ['real-data'] }
);
