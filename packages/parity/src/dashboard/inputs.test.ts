import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FAMILIES } from '../families.ts';
import type { DashboardInputs } from './inputs.ts';
import { mergeInputs, overlayInputs, parityPath, readInputs, writeInputs } from './inputs.ts';
import type { ReportedFile } from './render.ts';
import type { ReportedParityCase } from './tracker.ts';

const file = (name: string, family: string, status = 'passed'): ReportedFile => ({
    name,
    assertionResults: [{ ancestorTitles: [family], status, title: `checks ${family}` }]
});

const parityCase = (sourceFile: string, id: string): ReportedParityCase => ({
    family: FAMILIES.registryBlocks,
    id,
    title: id,
    status: 'passed',
    sourceFile
});

const BLOCKS = 'packages/parity/src/registry.blocks.test.ts';
const ITEMS = 'packages/parity/src/registry.items.test.ts';
const CLAIM = 'packages/parity/src/conformance.claim.test.ts';

describe('parityPath', () => {
    it("makes a reported path repository-relative, whatever the runner's directory was", () => {
        expect(parityPath('/home/runner/work/JSPrismarine/JSPrismarine/packages/parity/src/a.test.ts')).toBe(
            'packages/parity/src/a.test.ts'
        );
        expect(parityPath('C:\\work\\packages\\parity\\src\\a.test.ts')).toBe('packages/parity/src/a.test.ts');
        expect(parityPath(BLOCKS)).toBe(BLOCKS);
    });

    it('rejects a file outside the parity package', () => {
        expect(parityPath('/work/packages/prismarine/src/a.test.ts')).toBeUndefined();
    });
});

describe('readInputs and writeInputs', () => {
    let directory: string | undefined;
    afterEach(() => {
        if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
        directory = undefined;
    });

    it('reads what a shard wrote, keeping only the parity package', () => {
        directory = mkdtempSync(join(tmpdir(), 'parity-inputs-'));
        mkdirSync(join(directory, 'cases'));
        writeFileSync(
            join(directory, 'report.json'),
            JSON.stringify({
                testResults: [
                    file(`/work/${BLOCKS}`, FAMILIES.registryBlocks),
                    file('/work/packages/prismarine/src/x.test.ts', 'other')
                ]
            })
        );
        writeFileSync(
            join(directory, 'progress.jsonl'),
            `${JSON.stringify({ family: FAMILIES.registryBlocks, name: 'blocks', value: 3 })}\n`
        );
        writeFileSync(
            join(directory, 'cases', 'registry.blocks-registry.blocks.test.ts.jsonl'),
            `${JSON.stringify(parityCase(`/work/${BLOCKS}`, 'minecraft:stone'))}\n`
        );

        const inputs = readInputs(directory);

        expect(inputs.report.testResults.map((entry) => entry.name)).toEqual([BLOCKS]);
        expect(inputs.measurements).toEqual([{ family: FAMILIES.registryBlocks, name: 'blocks', value: 3 }]);
        expect(inputs.cases).toEqual([parityCase(BLOCKS, 'minecraft:stone')]);
    });

    it('reads an empty directory as no inputs', () => {
        directory = mkdtempSync(join(tmpdir(), 'parity-inputs-'));
        expect(readInputs(directory)).toEqual({ report: { testResults: [] }, measurements: [], cases: [] });
    });

    it('reads back what it wrote', () => {
        directory = mkdtempSync(join(tmpdir(), 'parity-inputs-'));
        const inputs: DashboardInputs = {
            report: { testResults: [file(BLOCKS, FAMILIES.registryBlocks)] },
            measurements: [{ family: FAMILIES.registryBlocks, name: 'blocks', value: 3 }],
            cases: [parityCase(BLOCKS, 'minecraft:stone')]
        };
        writeInputs(join(directory, 'out'), inputs);
        expect(readInputs(join(directory, 'out'))).toEqual(inputs);
    });
});

describe('mergeInputs', () => {
    it('concatenates the shards of one run, sorted by file', () => {
        const merged = mergeInputs([
            { report: { testResults: [file(ITEMS, FAMILIES.registryItems)] }, measurements: [], cases: [] },
            {
                report: { testResults: [file(BLOCKS, FAMILIES.registryBlocks)] },
                measurements: [{ family: FAMILIES.registryBlocks, name: 'blocks', value: 1 }],
                cases: [parityCase(BLOCKS, 'minecraft:stone')]
            }
        ]);
        expect(merged.report.testResults.map((entry) => entry.name)).toEqual([BLOCKS, ITEMS]);
        expect(merged.measurements).toHaveLength(1);
        expect(merged.cases).toHaveLength(1);
    });
});

describe('overlayInputs', () => {
    const base: DashboardInputs = {
        report: {
            testResults: [
                file(BLOCKS, FAMILIES.registryBlocks, 'failed'),
                file(ITEMS, FAMILIES.registryItems),
                file(CLAIM, FAMILIES.conformanceClaim)
            ]
        },
        measurements: [
            { family: FAMILIES.registryBlocks, name: 'blocks', value: 1 },
            { family: FAMILIES.registryItems, name: 'items', value: 5 }
        ],
        cases: [parityCase(BLOCKS, 'minecraft:stone'), parityCase(ITEMS, 'minecraft:stick')]
    };
    const everything = (): boolean => true;

    it("replaces a re-run file, its cases and its families' measurements", () => {
        const update: DashboardInputs = {
            report: { testResults: [file(BLOCKS, FAMILIES.registryBlocks)] },
            measurements: [{ family: FAMILIES.registryBlocks, name: 'blocks', value: 2 }],
            cases: [parityCase(BLOCKS, 'minecraft:dirt')]
        };
        const result = overlayInputs(base, update, everything);

        expect(result.report.testResults.find((entry) => entry.name === BLOCKS)?.assertionResults[0]?.status).toBe(
            'passed'
        );
        expect(result.report.testResults.map((entry) => entry.name)).toEqual([CLAIM, BLOCKS, ITEMS]);
        expect(result.measurements).toEqual([
            { family: FAMILIES.registryItems, name: 'items', value: 5 },
            { family: FAMILIES.registryBlocks, name: 'blocks', value: 2 }
        ]);
        expect(result.cases.map((entry) => entry.id)).toEqual(['minecraft:stick', 'minecraft:dirt']);
    });

    it('keeps every file the run left out', () => {
        const result = overlayInputs(base, { report: { testResults: [] }, measurements: [], cases: [] }, everything);
        expect(result).toEqual({
            ...base,
            report: { testResults: [...base.report.testResults].sort((a, b) => a.name.localeCompare(b.name)) }
        });
    });

    it('drops a file that is gone from the checkout, cases and all', () => {
        const result = overlayInputs(
            base,
            { report: { testResults: [] }, measurements: [], cases: [] },
            (name) => name !== ITEMS
        );
        expect(result.report.testResults.map((entry) => entry.name)).toEqual([CLAIM, BLOCKS]);
        expect(result.cases.map((entry) => entry.id)).toEqual(['minecraft:stone']);
    });

    it('adds a file the base never had', () => {
        const added = 'packages/parity/src/registry.sounds.test.ts';
        const result = overlayInputs(
            base,
            { report: { testResults: [file(added, FAMILIES.registryBlocks)] }, measurements: [], cases: [] },
            everything
        );
        expect(result.report.testResults.map((entry) => entry.name)).toContain(added);
    });
});
