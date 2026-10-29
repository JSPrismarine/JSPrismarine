import { describe, expect, expectTypeOf, it } from 'vitest';

import { createToken } from './token';
import type { ServiceToken } from './token';

describe('createToken', () => {
    it('accepts namespaced ids and carries the service type', () => {
        const token = createToken<{ ping(): number }>('prismarine:worlds');

        expect(token.id).toBe('prismarine:worlds');
        expectTypeOf(token).toEqualTypeOf<ServiceToken<{ ping(): number }>>();
        expectTypeOf(token).toExtend<ServiceToken<unknown>>();
    });

    it('rejects ids without a namespace', () => {
        expect(() => createToken('worlds')).toThrow(/must be namespaced/);
        expect(() => createToken(':worlds')).toThrow(/must be namespaced/);
        expect(() => createToken('prismarine:')).toThrow(/must be namespaced/);
    });
});
