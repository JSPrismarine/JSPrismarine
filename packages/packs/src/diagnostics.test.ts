import { describe, expect, it } from 'vitest';

import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';

const finding = (path: string, pack = 'Base Pack'): Diagnostic => ({
    severity: 'error',
    code: 'definition.missing-key',
    pack,
    path,
    message: 'description must be an object'
});

describe('DiagnosticCollector', () => {
    it('reports a finding that happens once exactly as it was given', () => {
        const collector = new DiagnosticCollector();
        collector.add(finding('entities/npc.json'));

        expect(collector.diagnostics).toEqual([finding('entities/npc.json')]);
    });

    it('collapses a repeat into one diagnostic that counts and names the files', () => {
        const collector = new DiagnosticCollector();
        collector.add(finding('entities/npc.json'));
        collector.add(finding('entities/agent.json'));
        collector.add(finding('entities/agent.json'));

        expect(collector.diagnostics).toHaveLength(1);
        expect(collector.diagnostics[0]).toMatchObject({
            path: 'entities/npc.json',
            occurrences: 3,
            paths: ['entities/npc.json', 'entities/agent.json']
        });
    });

    it('names the first five files and keeps counting past them', () => {
        const collector = new DiagnosticCollector();
        for (let index = 0; index < 28; index += 1) collector.add(finding(`entities/${index}.json`));

        expect(collector.diagnostics[0]).toMatchObject({
            occurrences: 28,
            paths: ['entities/0.json', 'entities/1.json', 'entities/2.json', 'entities/3.json', 'entities/4.json']
        });
    });

    it('keeps the same finding in two packs apart', () => {
        const collector = new DiagnosticCollector();
        collector.add(finding('entities/npc.json', 'Base Pack'));
        collector.add(finding('entities/npc.json', 'Override Pack'));

        expect(collector.diagnostics.map((diagnostic) => diagnostic.pack)).toEqual(['Base Pack', 'Override Pack']);
    });

    it('leaves the diagnostic the caller handed over alone', () => {
        const collector = new DiagnosticCollector();
        const first = finding('entities/npc.json');
        collector.add(first);
        collector.add(finding('entities/agent.json'));

        expect(first.occurrences).toBeUndefined();
    });
});
