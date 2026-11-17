import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readScenarioGolden } from './record.ts';
import {
    checkReloadLanded,
    loadedPacks,
    readScenarioPackIdentity,
    SCRIPT_SCENARIOS,
    scenarioPackDirectory
} from './scenarios.ts';

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
                [...loadedPacks(scenario)].sort()
            );
        }
    });

    it('rejects a reload capture whose dropped task ran before the reload landed, and keeps one where it did not', () => {
        const reload = SCRIPT_SCENARIOS.find((scenario) => scenario.id === 'reload');
        const golden = readScenarioGolden('reload');
        if (reload === undefined || golden === undefined) throw new Error('reload has a golden');
        const late = {
            observations: [
                ...golden.observations,
                { pack: 'reloaded', seq: 99, tick: 40, event: 'a task queued before the reload' }
            ]
        };

        expect(() => checkReloadLanded(reload, golden)).not.toThrow();
        expect(() => checkReloadLanded(reload, late)).toThrow(/landed too late/);
    });
});
