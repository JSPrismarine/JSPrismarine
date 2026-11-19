import { describe, expect, it } from 'vitest';

import { DEFAULT_JAVA_DATA_TARGET } from './javaDataTarget';
import type { JavaDataTarget } from './javaDataTarget';
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
        expect(prefixCacheKeyFor(stack, options, '0.0.0-other')).not.toBe(key);
    });

    it('invalidates when the Java data target changes, and keys the default target when given none', () => {
        const key = prefixCacheKeyFor(stack, options);
        const preview: JavaDataTarget = { release: '26.4-snapshot-8', format: [127, 0], dataVersion: 5100 };

        expect(prefixCacheKeyFor(stack, options, undefined, DEFAULT_JAVA_DATA_TARGET)).toBe(key);
        expect(prefixCacheKeyFor(stack, options, undefined, preview)).not.toBe(key);
    });
});
