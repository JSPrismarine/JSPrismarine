import { describe, expect, it } from 'vitest';

import { frozen } from './frozen';
import { uint8 } from './fieldTypes';
import { since } from '../bedrock/wire/wireGates';

describe('frozen', () => {
    it('freezes the object and returns the same reference', () => {
        const value = { a: 1 };

        expect(frozen(value)).toBe(value);
        expect(Object.isFrozen(value)).toBe(true);
    });

    it('still freezes the wire types and gates built with it', () => {
        expect(Object.isFrozen(uint8)).toBe(true);
        expect(Object.isFrozen(since(1, 'test'))).toBe(true);
    });
});
