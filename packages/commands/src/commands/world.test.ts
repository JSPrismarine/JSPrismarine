import { describe, expect, it } from 'vitest';

import { parseBlockStates } from './world';

describe('parseBlockStates', () => {
    it('reads quoted and unquoted Bedrock block states', () => {
        expect(parseBlockStates('["facing"="north","powered"=true,custom:shape="half.high"]')).toEqual({
            facing: 'north',
            powered: true,
            'custom:shape': 'half.high'
        });
    });

    it('keeps a bare literal on the type the grammar gives it', () => {
        // The block catalog hashes a state with its types: a "7" where an int property
        // stands names no block, and a /setblock carrying it used to place nothing.
        expect(parseBlockStates('["moisturized_amount"=7,"lit"=false,"direction"="7"]')).toEqual({
            moisturized_amount: 7,
            lit: false,
            direction: '7'
        });
    });

    it('keeps scanning after a long malformed token', () => {
        const malformed = `["${'0'.repeat(100_000)}"x?,"facing"="north"]`;

        expect(parseBlockStates(malformed)).toEqual({ facing: 'north' });
    });
});
