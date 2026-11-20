import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AllowListEntry } from './allowlist.ts';
import type { BehaviorAspect, BehaviorGap, BehaviorScenario } from './behaviorScenarios.ts';
import { gapKindMismatches, reportCoverage, runScenarios, updatedBehaviorGaps } from './behaviorScenarios.ts';
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

describe('runScenarios', () => {
    it('records a classified gap under the reference the classifier names', () => {
        const [row] = runScenarios([
            {
                ...breeding,
                subjects: () => ['minecraft:pig'],
                classify: () => ({ kind: 'deferred', reason: 'Breeding waits on the brain.', reference: 'issue #1' })
            }
        ]);

        expect(row?.gap).toEqual({ kind: 'deferred', reason: 'Breeding waits on the brain.', reference: 'issue #1' });
    });

    it("falls back to the scenario's reference when the classifier names none", () => {
        const [row] = runScenarios([
            {
                ...breeding,
                subjects: () => ['minecraft:pig'],
                classify: () => ({ kind: 'deferred', reason: 'Breeding waits on the brain.' })
            }
        ]);

        expect(row?.gap?.reference).toBe('test');
    });
});

/** The pig's breeding row recorded as an intentional edition difference. */
const intentionalPig: AllowListEntry = {
    family: FAMILIES.entitiesBehavior,
    id: 'breeding-food:minecraft:pig',
    kind: 'intentional',
    reason: 'Bedrock pigs breed with carrots only.',
    reference: 'issue #2'
};

describe('gapKindMismatches', () => {
    it('fails an intentional row that now differs as a defect, naming both kinds', () => {
        const rows = runScenarios([breeding]);

        expect(gapKindMismatches(FAMILIES.entitiesBehavior, rows, [intentionalPig])).toEqual([
            'entities.behavior row breeding-food:minecraft:pig is recorded as intentional in goldens/behavior-gaps.json ' +
                'but observed as defect: An animal breeds with its food. Observed: the server breeds it with nothing.'
        ]);
    });

    it('fails a deferred row that the scenario now classifies as intentional', () => {
        const rows = runScenarios([
            { ...breeding, classify: () => ({ kind: 'intentional', reason: 'Bedrock pigs breed with carrots only.' }) }
        ]);

        expect(
            gapKindMismatches(FAMILIES.entitiesBehavior, rows, [{ ...intentionalPig, kind: 'deferred' }])
        ).toHaveLength(1);
    });

    it('passes a row whose kind matches even when its reason and reference do not', () => {
        const rows = runScenarios([
            { ...breeding, classify: () => ({ kind: 'intentional', reason: 'A generated reason.', reference: 'test' }) }
        ]);

        expect(gapKindMismatches(FAMILIES.entitiesBehavior, rows, [intentionalPig])).toEqual([]);
    });

    it("leaves a row with no entry, and another family's entry, to the allow-list check", () => {
        const rows = runScenarios([breeding]);

        expect(gapKindMismatches(FAMILIES.entitiesBehavior, rows, [])).toEqual([]);
        expect(
            gapKindMismatches(FAMILIES.entitiesBehavior, rows, [{ ...intentionalPig, family: FAMILIES.blocksBehavior }])
        ).toEqual([]);
    });
});

describe('updatedBehaviorGaps', () => {
    const recorded: Readonly<Record<string, BehaviorGap>> = {
        'breeding-food:minecraft:pig': {
            kind: 'defect',
            reason: 'Hand-written: pigs ignore carrots.',
            reference: 'issue #3'
        },
        'breeding-food:minecraft:cow': { kind: 'defect', reason: 'Fixed since.', reference: 'issue #4' },
        'other-scenario:minecraft:cow': { kind: 'deferred', reason: 'Out of scope.', reference: 'issue #5' }
    };
    const inBreeding = (id: string): boolean => id.startsWith('breeding-food:');

    it('keeps a recorded reason and reference while the kind is unchanged', () => {
        const next = updatedBehaviorGaps(recorded, runScenarios([breeding]), inBreeding);

        expect(next['breeding-food:minecraft:pig']).toEqual(recorded['breeding-food:minecraft:pig']);
    });

    it('takes the observed gap when the kind changed', () => {
        const rows = runScenarios([
            { ...breeding, classify: () => ({ kind: 'intentional', reason: 'Bedrock pigs breed with carrots only.' }) }
        ]);

        expect(updatedBehaviorGaps(recorded, rows, inBreeding)['breeding-food:minecraft:pig']).toEqual({
            kind: 'intentional',
            reason: 'Bedrock pigs breed with carrots only.',
            reference: 'test'
        });
    });

    it('drops a fixed row in scope and keeps rows outside it', () => {
        const next = updatedBehaviorGaps(recorded, runScenarios([breeding]), inBreeding);

        expect(Object.keys(next).sort()).toEqual(['breeding-food:minecraft:pig', 'other-scenario:minecraft:cow']);
    });
});
