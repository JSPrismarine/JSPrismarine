import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BehaviorAspect, BehaviorScenario } from './behaviorScenarios.ts';
import { reportCoverage, runScenarios } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import type { ParityTrackerRecord } from './trackerCases.ts';

/** A cow and a pig, each with two behaviors, and a scenario that compares only breeding. */
const ASPECTS: Readonly<Record<string, readonly BehaviorAspect[]>> = {
    'minecraft:cow': [
        { id: 'minecraft:breedable', description: 'breeding' },
        { id: 'minecraft:behavior.panic', description: 'panicking' }
    ],
    'minecraft:pig': [
        { id: 'minecraft:breedable', description: 'breeding' },
        { id: 'minecraft:rideable', description: 'riding' }
    ]
};

const breeding: BehaviorScenario<string> = {
    name: 'breeding-food',
    java: 'An animal breeds with its food.',
    reference: 'test',
    subjects: () => ['minecraft:cow', 'minecraft:pig'],
    idOf: (subject) => subject,
    aspects: () => ['minecraft:breedable'],
    run: (subject) => (subject === 'minecraft:pig' ? 'the server breeds it with nothing' : undefined)
};

describe('behavior coverage', () => {
    let directory: string;
    const previous = process.env.PARITY_CASES_DIRECTORY;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'parity-coverage-'));
        process.env.PARITY_CASES_DIRECTORY = directory;
    });

    afterEach(() => {
        if (previous === undefined) delete process.env.PARITY_CASES_DIRECTORY;
        else process.env.PARITY_CASES_DIRECTORY = previous;
        rmSync(directory, { recursive: true, force: true });
    });

    const reported = (): ParityTrackerRecord[] =>
        readdirSync(directory).flatMap((name) =>
            readFileSync(join(directory, name), 'utf-8')
                .split('\n')
                .filter((line) => line !== '')
                // Parsed JSON boundary; reportParityCases wrote these records.
                .map((line) => JSON.parse(line) as ParityTrackerRecord)
        );

    it('keeps an entity incomplete until every one of its aspects is compared', () => {
        const uncovered = reportCoverage(
            FAMILIES.entitiesBehavior,
            'entities.behavior.test.ts',
            ['minecraft:cow', 'minecraft:pig'],
            runScenarios([breeding]),
            'entity behavior',
            (identifier) => ASPECTS[identifier] ?? []
        );

        expect(uncovered).toBe(2);
        expect(Object.fromEntries(reported().map(({ id, status }) => [id, status]))).toEqual({
            'runtime-behavior:minecraft:cow/minecraft:breedable': 'passed',
            'runtime-behavior:minecraft:cow/minecraft:behavior.panic': 'not measured',
            'runtime-behavior:minecraft:pig/minecraft:breedable': 'defect',
            'runtime-behavior:minecraft:pig/minecraft:rideable': 'not measured'
        });
    });

    it('adds an aspect a scenario compares that the data did not list', () => {
        reportCoverage(
            FAMILIES.entitiesBehavior,
            'entities.behavior.test.ts',
            ['minecraft:cow'],
            runScenarios([{ ...breeding, subjects: () => ['minecraft:cow'], aspects: () => ['fall-damage'] }]),
            'entity behavior',
            (identifier) => ASPECTS[identifier] ?? []
        );

        expect(reported().map(({ id }) => id)).toContain('runtime-behavior:minecraft:cow/fall-damage');
        expect(reported()).toHaveLength(3);
    });

    it('lists an identifier with no aspects and no scenario as one not-measured row', () => {
        const uncovered = reportCoverage(
            FAMILIES.entitiesBehavior,
            'entities.behavior.test.ts',
            ['minecraft:marker'],
            [],
            'entity behavior',
            () => []
        );

        expect(uncovered).toBe(1);
        expect(reported()).toMatchObject([{ id: 'runtime-behavior:minecraft:marker', status: 'not measured' }]);
    });
});
