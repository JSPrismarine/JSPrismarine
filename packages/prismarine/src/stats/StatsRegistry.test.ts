import os from 'node:os';

import { describe, expect, it } from 'vitest';

import { recordingLogger } from './stats.test.helper';
import { readingValue } from './StatsMetric';
import type { StatsPlatform } from './StatsPlatform';
import { readPlatform } from './StatsPlatform';
import { StatsRegistry } from './StatsRegistry';
import { testPlatform as platform } from './serverRegistry.test.helper';

const registryWith = (logger = recordingLogger().logger, readPlatformFields: () => StatsPlatform = () => platform) =>
    new StatsRegistry({ logger, platform: readPlatformFields });

describe('stats/StatsRegistry', () => {
    it('reads each metric once per snapshot, in registration order', () => {
        const registry = registryWith();
        let reads = 0;
        registry.register({ name: 'test:count', kind: 'gauge', description: 'A count.', read: () => ++reads });
        registry.register({ name: 'test:name', kind: 'label', description: 'A name.', read: () => 'value' });

        const first = registry.snapshot();
        const second = registry.snapshot();

        expect(reads).toBe(2);
        expect([...first.metrics.keys()]).toEqual(['test:count', 'test:name']);
        expect(first.metrics.get('test:count')).toEqual({ kind: 'gauge', value: 1, description: 'A count.' });
        expect(second.metrics.get('test:count')).toEqual({ kind: 'gauge', value: 2, description: 'A count.' });
    });

    it('carries every kind with its value, description and unit', () => {
        const registry = registryWith();
        registry.register({ name: 'test:gauge', kind: 'gauge', description: 'G.', unit: 'players', read: () => 3 });
        registry.register({ name: 'test:label', kind: 'label', description: 'L.', read: () => 'on' });
        registry.register({ name: 'test:set', kind: 'set', description: 'S.', read: () => ['a', 'b'] });
        registry.register({
            name: 'test:distribution',
            kind: 'distribution',
            description: 'D.',
            read: () => ({ a: 1 })
        });
        registry.register({
            name: 'test:breakdown',
            kind: 'breakdown',
            description: 'B.',
            read: () => ({ a: { x: 1 } })
        });

        expect(Object.fromEntries(registry.snapshot().metrics)).toEqual({
            'test:gauge': { kind: 'gauge', value: 3, description: 'G.', unit: 'players' },
            'test:label': { kind: 'label', value: 'on', description: 'L.' },
            'test:set': { kind: 'set', value: ['a', 'b'], description: 'S.' },
            'test:distribution': { kind: 'distribution', value: { a: 1 }, description: 'D.' },
            'test:breakdown': { kind: 'breakdown', value: { a: { x: 1 } }, description: 'B.' }
        });
    });

    it('reads one metric by name without reading the others', () => {
        const registry = registryWith();
        const reads: string[] = [];
        registry.register({
            name: 'test:a',
            kind: 'gauge',
            description: 'A.',
            read: () => {
                reads.push('a');
                return 1;
            }
        });
        registry.register({
            name: 'test:b',
            kind: 'gauge',
            description: 'B.',
            read: () => {
                reads.push('b');
                return 2;
            }
        });

        expect(registry.read('test:b')).toEqual({ kind: 'gauge', value: 2, description: 'B.' });
        expect(registry.read('test:missing')).toBeUndefined();
        expect(reads).toEqual(['b']);
    });

    it('leaves out a metric that returns nothing, without logging it', () => {
        const { logger, lines } = recordingLogger();
        const registry = registryWith(logger);
        registry.register({ name: 'test:empty', kind: 'label', description: 'E.', read: () => undefined });
        registry.register({ name: 'test:zero', kind: 'gauge', description: 'Z.', read: () => 0 });

        const { metrics } = registry.snapshot();

        expect(metrics.has('test:empty')).toBe(false);
        expect(registry.read('test:empty')).toBeUndefined();
        expect(readingValue(metrics, 'test:zero', 'gauge')).toBe(0);
        expect(lines).toEqual([]);
    });

    it('leaves out and logs a metric that throws, and still reads the others', () => {
        const { logger, lines } = recordingLogger();
        const registry = registryWith(logger);
        registry.register({
            name: 'test:broken',
            kind: 'gauge',
            description: 'Broken.',
            read: () => {
                throw new Error('no value');
            }
        });
        registry.register({ name: 'test:after', kind: 'gauge', description: 'After.', read: () => 1 });

        const { metrics } = registry.snapshot();

        expect([...metrics.keys()]).toEqual(['test:after']);
        expect(lines).toEqual(['warn: Stats metric test:broken could not be read and was left out: no value']);
    });

    it('rejects a second metric under a name already registered', () => {
        const registry = registryWith();
        registry.register({ name: 'test:players', kind: 'gauge', description: 'P.', read: () => 1 });

        expect(() =>
            registry.register({ name: 'test:players', kind: 'label', description: 'X.', read: () => 'x' })
        ).toThrow(/already registered/);
        expect(registry.read('test:players')?.kind).toBe('gauge');
    });

    it('removes a metric through the function register returns, so the name can be registered again', () => {
        const registry = registryWith();
        const dispose = registry.register({ name: 'test:players', kind: 'gauge', description: 'P.', read: () => 1 });

        dispose();
        expect(registry.read('test:players')).toBeUndefined();

        const again = registry.register({ name: 'test:players', kind: 'gauge', description: 'P.', read: () => 2 });
        // A stale disposer does not remove the metric that took the name after it.
        dispose();
        expect(registry.read('test:players')?.value).toBe(2);
        again();
        expect(registry.snapshot().metrics.size).toBe(0);
    });

    it.each([
        'players',
        'jsprismarine:',
        ':players',
        'jsprismarine:playerProtocol',
        'JSPrismarine:players',
        'jsprismarine:player-protocol',
        'jsprismarine:player__protocol',
        'jsprismarine:_players',
        'jsprismarine:players_',
        'jsprismarine:1players',
        'a:b:c'
    ])('rejects the badly formed name %s', (name) => {
        const registry = registryWith();

        expect(() => registry.register({ name, kind: 'gauge', description: 'X.', read: () => 1 })).toThrow(
            /snake_case/
        );
        expect(registry.snapshot().metrics.size).toBe(0);
    });

    it.each(['jsprismarine:player_protocol', 'myaddon:something', 'my_addon:v2_count'])('accepts %s', (name) => {
        const registry = registryWith();
        registry.register({ name, kind: 'gauge', description: 'X.', read: () => 1 });

        expect(registry.read(name)?.value).toBe(1);
    });

    it('carries the platform fields from node:os by default', () => {
        const { platform: read } = new StatsRegistry({ logger: recordingLogger().logger }).snapshot();

        expect(read).toEqual({
            type: os.type(),
            release: os.release(),
            version: os.version(),
            arch: os.arch(),
            coreCount: os.availableParallelism(),
            memoryGb: Math.round(os.totalmem() / 1024 ** 3)
        });
        expect(Number.isInteger(read.memoryGb)).toBe(true);
        expect(read).toEqual(readPlatform());
    });

    it('reads nothing as another kind', () => {
        const registry = registryWith();
        registry.register({ name: 'test:label', kind: 'label', description: 'L.', read: () => '3' });

        expect(readingValue(registry.snapshot().metrics, 'test:label', 'gauge')).toBeUndefined();
        expect(readingValue(registry.snapshot().metrics, 'test:label', 'label')).toBe('3');
    });
});
