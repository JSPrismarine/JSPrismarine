import { describe, expect, it } from 'vitest';

import type { WorkspacePackage } from './select.mts';
import { loadedPackages, selectScenarios } from './select.mts';

const packages: WorkspacePackage[] = [
    { root: 'packages/server', name: '@jsp/server', dependencies: ['@jsp/prismarine', 'yargs'] },
    { root: 'packages/prismarine', name: '@jsp/prismarine', dependencies: ['@jsp/raknet'] },
    { root: 'packages/raknet', name: '@jsp/raknet', dependencies: [] },
    { root: 'packages/parity', name: '@jsp/parity', dependencies: ['@jsp/prismarine'] },
    { root: 'tools/client-e2e', name: '@jsp/client-e2e', dependencies: [] }
];

const scenarioNames: Record<string, readonly string[]> = {
    'tools/client-e2e/src/scenarios/chat.mts': ['chat'],
    'tools/client-e2e/src/scenarios/furnace.mts': ['furnace']
};
const select = (changed: readonly string[]) => selectScenarios(changed, packages, (file) => scenarioNames[file]);

describe('loadedPackages', () => {
    it('follows dependencies from the entry packages', () => {
        expect([...loadedPackages(packages, ['packages/server'])].sort()).toEqual([
            'packages/prismarine',
            'packages/raknet',
            'packages/server'
        ]);
    });
});

describe('selectScenarios', () => {
    it.each([
        'packages/raknet/src/Session.ts',
        'packages/prismarine/package.json',
        'packages/server/src/resources/config.json',
        'tools/client-e2e/src/run.mts',
        'tools/client-e2e/cinnabar.json',
        'pnpm-lock.yaml',
        '.github/workflows/client-e2e.yml'
    ])('runs every scenario when %s changes', (file) => {
        expect(select([file, 'tools/client-e2e/src/scenarios/chat.mts'])).toEqual({
            mode: 'all',
            scenarios: [],
            because: file
        });
    });

    it.each([
        'packages/raknet/src/Session.test.ts',
        'packages/prismarine/src/testing/world.test.helper.ts',
        'packages/prismarine/benchmarks/tick.bench.ts',
        'packages/prismarine/src/__snapshots__/World.test.ts.snap',
        'packages/raknet/README.md',
        'packages/parity/goldens/behavior-gaps.json',
        'packages/parity/src/dashboard/tracker.ts'
    ])('runs nothing when only %s changes', (file) => {
        expect(select([file])).toEqual({ mode: 'none', scenarios: [] });
    });

    it('runs the scenarios whose own files changed', () => {
        const changed = [
            'tools/client-e2e/src/scenarios/chat.mts',
            'tools/client-e2e/src/scenarios/furnace.mts',
            'packages/raknet/src/Session.test.ts'
        ];

        expect(select(changed)).toEqual({ mode: 'some', scenarios: ['chat', 'furnace'] });
    });

    it('runs every scenario when a scenario file cannot stand for its scenarios', () => {
        expect(select(['tools/client-e2e/src/scenarios/removed.mts'])).toMatchObject({ mode: 'all' });
    });
});
