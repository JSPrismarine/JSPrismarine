import { describe, expect, it } from 'vitest';

import type { PrefixCacheOptions } from './prefixCache';
import { prefixCacheKeyFor } from './prefixCache';
import type { PackStack } from './sources';

const stack: PackStack = [{ kind: 'directory', path: './vanilla' }];
const options: PrefixCacheOptions = {
    filePath: './cache/prefix.v8',
    prefixLength: 1,
    fingerprint: 'overlay-a',
    validatorKey: 'structural-v1'
};

describe('composed prefix cache key', () => {
    it('invalidates when a resolved source path, overlay fingerprint, validator, or package version changes', () => {
        const key = prefixCacheKeyFor(stack, options);

        expect(prefixCacheKeyFor([{ kind: 'directory', path: './other-vanilla' }], options)).not.toBe(key);
        expect(prefixCacheKeyFor(stack, { ...options, fingerprint: 'overlay-b' })).not.toBe(key);
        expect(prefixCacheKeyFor(stack, { ...options, validatorKey: 'schema-validator-v1' })).not.toBe(key);
        expect(prefixCacheKeyFor(stack, options, '0.17.0')).not.toBe(key);
    });
});
