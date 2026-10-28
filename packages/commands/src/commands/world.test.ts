import { describe, expect, it } from 'vitest';

import { parseBlockStates } from './world';

describe('parseBlockStates', () => {
    it('reads quoted and unquoted Bedrock block states', () => {
        expect(parseBlockStates('["facing"="north","powered"=true,custom:shape="half.high"]')).toEqual({
            facing: 'north',
            powered: 'true',
            'custom:shape': 'half.high'
        });
    });

    it('keeps scanning after a long malformed token', () => {
        const malformed = `["${'0'.repeat(100_000)}"x?,"facing"="north"]`;

        expect(parseBlockStates(malformed)).toEqual({ facing: 'north' });
    });
});
