import { parseArgs } from 'node:util';
import { describe, expect, it } from 'vitest';

import { PASSES, dumpArgs, selectPasses } from './cli.ts';

describe('dumpArgs', () => {
    it('drops the separator pnpm forwards, so the documented invocation parses', () => {
        const values = parseArgs({
            args: dumpArgs(['--', '--pass', 'dump', '--protocol', '2225']),
            options: { pass: { type: 'string', multiple: true }, protocol: { type: 'string' } }
        }).values;

        expect(values).toEqual({ pass: ['dump'], protocol: '2225' });
    });

    it('leaves arguments given without a separator alone', () => {
        expect(dumpArgs(['--pass', 'dump'])).toEqual(['--pass', 'dump']);
        expect(dumpArgs([])).toEqual([]);
    });

    it('drops only the leading separator, so a later one still ends the options', () => {
        expect(dumpArgs(['--', '--pass', 'dump', '--'])).toEqual(['--pass', 'dump', '--']);
    });
});

describe('selectPasses', () => {
    it('runs every pass in order when none is named', () => {
        expect(selectPasses(undefined)).toEqual([...PASSES]);
        expect(selectPasses([])).toEqual([...PASSES]);
    });

    it('accepts the flag repeated and comma-separated', () => {
        expect(selectPasses(['dump', 'palette'])).toEqual(['dump', 'palette']);
        expect(selectPasses(['dump,palette'])).toEqual(['dump', 'palette']);
    });

    it('names the known passes when asked for one that is not', () => {
        expect(() => selectPasses(['bogus'])).toThrow(/Unknown pass bogus; expected dump, refworld/);
    });
});
