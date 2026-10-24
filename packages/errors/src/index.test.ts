import { describe, expect, it } from 'vitest';
// biome-ignore lint/plugin/no-barrel-imports: the barrel itself is what this test checks
import * as AllFromErrors from './';

const { ErrorKind: _errorKind, Error: _error, ...Errors } = AllFromErrors;

describe('errors', () => {
    for (const [key, ErrorClass] of Object.entries(Errors)) {
        describe(key, () => {
            it('should have correct name', () => {
                const error = new ErrorClass();
                expect(error.name).toBe(key);
            });

            it('should have a message', () => {
                const error = new ErrorClass();
                expect(error.message).not.toBe('');
            });

            it('should have a code', () => {
                const error = new ErrorClass();
                expect(error.code).not.toBe('');
            });
        });
    }
});
