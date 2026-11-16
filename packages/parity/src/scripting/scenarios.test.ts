import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readScenarioGolden } from './record.ts';
import { readScenarioPackIdentity, SCRIPT_SCENARIOS, scenarioPackDirectory } from './scenarios.ts';

describe('SCRIPT_SCENARIOS', () => {
    it('gives every scenario pack a manifest identity of its own', () => {
        const uuids = SCRIPT_SCENARIOS.flatMap((scenario) =>
            scenario.packs.map((pack) => readScenarioPackIdentity(scenarioPackDirectory(scenario, pack)).uuid)
        );
        expect(new Set(uuids).size).toBe(uuids.length);
    });

    it('has every pack script report under its own directory name', () => {
        for (const scenario of SCRIPT_SCENARIOS) {
            for (const pack of scenario.packs) {
                const script = readFileSync(join(scenarioPackDirectory(scenario, pack), 'scripts', 'main.js'), 'utf8');
                expect(script).toContain(`const PACK = '${pack}';`);
            }
        }
    });

    it('keeps each golden under the family and the packs its scenario declares', () => {
        for (const scenario of SCRIPT_SCENARIOS) {
            const golden = readScenarioGolden(scenario.id);
            if (golden === undefined) continue;
            expect(golden.family).toBe(scenario.family);
            expect([...new Set(golden.observations.map(({ pack }) => pack))].sort()).toEqual(
                [...scenario.packs].sort()
            );
        }
    });
});
