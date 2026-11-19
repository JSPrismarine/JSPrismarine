import { beforeAll, it } from 'vitest';

import { measureScenarios } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import type { JavaReleaseData } from './javaReleaseDatapack.ts';
import { javaReleaseData, javaReleaseDatapackScenarios, readJavaRelease } from './javaReleaseDatapack.ts';
import { describeFamily } from './measure.ts';

/**
 * The default Java release's vanilla datapack through the public loader, with its own target,
 * against its own data generator reports. The preview has the same rows in its own family.
 */
const RELEASE = '26.3';

describeFamily(
    FAMILIES.datapack26_3,
    [javaReleaseData(RELEASE)],
    () => {
        // The strict load of the whole datapack is the slow part, so it runs once, before the rows.
        let data: JavaReleaseData;
        beforeAll(() => {
            data = readJavaRelease(RELEASE);
        }, 120_000);

        it('loads strict and agrees with its registry report', () => {
            measureScenarios(FAMILIES.datapack26_3, import.meta.filename, ...javaReleaseDatapackScenarios(data, []));
        });
    },
    { tags: ['real-data'] }
);
