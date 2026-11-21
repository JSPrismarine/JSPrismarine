import { describe, expect, it } from 'vitest';

import { NativeLibraryError } from '@jsprismarine/errors/native-library';

import { nodeFfiOf } from './ffi';

describe('nodeFfiOf', () => {
    it('names the node:ffi requirement when the runtime has no FFI', () => {
        const missing = () => nodeFfiOf(undefined, 'v26.0.0');
        expect(missing).toThrow(NativeLibraryError);
        expect(missing).toThrow('node:ffi is not available in Node.js v26.0.0');
    });
});
