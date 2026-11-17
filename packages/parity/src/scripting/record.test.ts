import { describe, expect, it } from 'vitest';

import { runScenarios } from '../behaviorScenarios.ts';
import { FAMILIES } from '../families.ts';
import {
    NO_SCRIPT_HOST,
    SCRIPT_HOST_ISSUE,
    scenarioRecordComparison,
    scriptingFamilyReferences
} from './describeScriptingFamily.ts';
import type { Observation, ScenarioRecord } from './record.ts';
import { diffScenarioRecords, readScenarioRecord, readServerVersion } from './record.ts';
import type { ScriptScenario } from './scenarios.ts';
import { SCRIPT_SCENARIOS } from './scenarios.ts';

/** A content-log line the way BDS decorates one. */
const logged = (body: string): string => `[2026-11-16 23:00:00:000 WARN] [Scripting] DUMP ${body}`;

const observation = (pack: string, seq: number, event: string, extra: Partial<Observation> = {}): Observation => ({
    pack,
    seq,
    tick: 0,
    event,
    ...extra
});

describe('readScenarioRecord', () => {
    it('keeps observations in log order across packs and ignores other lines', () => {
        const record = readScenarioRecord(
            [
                '[2026-11-16 23:00:00:000 INFO] Server started.',
                logged('record {"pack":"v2","seq":1,"tick":0,"event":"top-level"}'),
                logged('record {"pack":"v1","seq":1,"tick":0,"event":"top-level","value":"minecraft:overworld"}'),
                logged('record {"pack":"v2","seq":2,"tick":1,"event":"runTimeout","error":"Error: no"}'),
                logged('end {"pack":"v1","records":1}'),
                logged('end {"pack":"v2","records":2}')
            ],
            ['v2', 'v1']
        );

        expect(record.observations).toEqual([
            observation('v2', 1, 'top-level'),
            observation('v1', 1, 'top-level', { value: 'minecraft:overworld' }),
            observation('v2', 2, 'runTimeout', { tick: 1, error: 'Error: no' })
        ]);
    });

    it('fails a pack that never ended', () => {
        expect(() =>
            readScenarioRecord([logged('record {"pack":"v2","seq":1,"tick":0,"event":"top-level"}')], ['v2'])
        ).toThrow('Pack v2 never wrote its end line.');
    });

    it('fails a pack whose end line counts an observation the log lost', () => {
        expect(() =>
            readScenarioRecord(
                [
                    logged('record {"pack":"v2","seq":2,"tick":0,"event":"later"}'),
                    logged('end {"pack":"v2","records":2}')
                ],
                ['v2']
            )
        ).toThrow('Pack v2 reported 2 observations but the log holds seq [2].');
    });

    it('fails an end line with a negative count rather than reading it as an empty pack', () => {
        expect(() => readScenarioRecord([logged('end {"pack":"v2","records":-1}')], ['v2'])).toThrow(
            'An end line is malformed'
        );
    });

    it('reads a pack that reloaded as two runs, each counting from 1', () => {
        const record = readScenarioRecord(
            [
                logged('record {"pack":"v2","seq":1,"tick":0,"event":"top-level"}'),
                logged('record {"pack":"v2","seq":2,"tick":-1,"event":"shutdown"}'),
                logged('end {"pack":"v2","records":2}'),
                logged('record {"pack":"v2","seq":1,"tick":0,"event":"top-level"}'),
                logged('end {"pack":"v2","records":1}')
            ],
            ['v2'],
            2
        );
        expect(record.observations.map(({ seq, event }) => `${seq} ${event}`)).toEqual([
            '1 top-level',
            '2 shutdown',
            '1 top-level'
        ]);
    });

    it('fails a pack that ended fewer times than the scenario runs it', () => {
        expect(() => readScenarioRecord([logged('end {"pack":"v2","records":0}')], ['v2'], 2)).toThrow(
            'Pack v2 ended 1 times, not 2.'
        );
    });

    it('accepts a pack that ended with no observations', () => {
        expect(readScenarioRecord([logged('end {"pack":"v2","records":0}')], ['v2']).observations).toEqual([]);
    });

    it('fails a record line whose JSON does not parse rather than dropping it', () => {
        expect(() => readScenarioRecord([logged('record {"pack":"v2","seq":1,')], ['v2'])).toThrow(
            'A record line did not parse'
        );
    });

    it('fails an observation with a field the format does not define', () => {
        expect(() =>
            readScenarioRecord([logged('record {"pack":"v2","seq":1,"tick":0,"event":"e","ms":12}')], ['v2'])
        ).toThrow('is not an observation');
    });

    it('fails a pack the scenario does not declare', () => {
        expect(() =>
            readScenarioRecord([logged('record {"pack":"other","seq":1,"tick":0,"event":"e"}')], ['v2'])
        ).toThrow('Pack other is not in the scenario.');
    });
});

describe('readServerVersion', () => {
    it('reads the version line BDS prints at boot', () => {
        expect(
            readServerVersion([
                '[2026-11-17 00:43:35:900 INFO] Starting Server',
                '[2026-11-17 00:43:35:918 INFO] Version: 1.26.51.1'
            ])
        ).toBe('1.26.51.1');
    });

    it('reports no version when the server printed none', () => {
        expect(readServerVersion(['[2026-11-17 00:43:35:900 INFO] Starting Server'])).toBeUndefined();
    });
});

describe('diffScenarioRecords', () => {
    const bds: ScenarioRecord = { observations: [observation('v2', 1, 'a'), observation('v2', 2, 'b')] };

    it('accepts the same observations whatever order their fields were written in', () => {
        const reordered: ScenarioRecord = {
            observations: [
                { event: 'a', tick: 0, seq: 1, pack: 'v2' },
                { event: 'b', tick: 0, seq: 2, pack: 'v2' }
            ]
        };
        expect(diffScenarioRecords(bds, reordered)).toBeUndefined();
    });

    it('names the first observation that differs', () => {
        const swapped: ScenarioRecord = { observations: [observation('v2', 1, 'b'), observation('v2', 2, 'a')] };
        expect(diffScenarioRecords(bds, swapped)).toBe(
            'observation 1 differs: BDS recorded {"pack":"v2","seq":1,"tick":0,"event":"a"}, ' +
                'JSPrismarine recorded {"pack":"v2","seq":1,"tick":0,"event":"b"} ' +
                '(2 observations on BDS, 2 on JSPrismarine)'
        );
    });

    it('names an observation one side is missing', () => {
        expect(diffScenarioRecords(bds, { observations: [observation('v2', 1, 'a')] })).toContain(
            'observation 2 differs: BDS recorded {"pack":"v2","seq":2,"tick":0,"event":"b"}, JSPrismarine recorded nothing'
        );
    });
});

describe('scenarioRecordComparison', () => {
    const scenario: ScriptScenario = {
        id: 'no-such-scenario',
        family: FAMILIES.scriptingLifecycle,
        description: 'Nothing happens.',
        reference: 'test',
        packs: ['v2'],
        needs: 'world'
    };

    it('fails a declared scenario that has no golden', () => {
        const [row] = runScenarios([scenarioRecordComparison([scenario], new Map())]);
        expect(row?.id).toBe('bds-record:no-such-scenario');
        expect(row?.difference).toContain('no BDS golden');
        expect(row?.gap?.kind).toBe('defect');
    });

    it('runs the rows of a family whose scenario has no golden, so the defect is not skipped', () => {
        expect(scriptingFamilyReferences(FAMILIES.scriptingLifecycle, [scenario])).toEqual([]);
        expect(scriptingFamilyReferences(FAMILIES.scriptingEvents, [])).toHaveLength(1);
    });

    it('gives a scenario that threw on JSPrismarine a defect row', () => {
        const golden = SCRIPT_SCENARIOS[0];
        if (golden === undefined) throw new Error('No scenario is declared');
        const [row] = runScenarios([
            scenarioRecordComparison([golden], new Map([[golden.id, { failed: new Error('boom') }]]))
        ]);
        expect(row?.difference).toBe('JSPrismarine threw while running the scenario: Error: boom');
        expect(row?.gap?.kind).toBe('defect');
    });

    it('defers a scenario JSPrismarine has no script host for, under the host issue', () => {
        const classified = scenarioRecordComparison([scenario], new Map()).classify?.(scenario, NO_SCRIPT_HOST);
        expect(classified).toMatchObject({ kind: 'deferred', reference: SCRIPT_HOST_ISSUE });
    });
});
