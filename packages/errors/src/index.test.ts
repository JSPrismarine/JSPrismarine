import { describe, expect, it } from 'vitest';
import * as AllFromErrors from './';

const { ErrorKind: _errorKind, Error: _error, ...Errors } = AllFromErrors;
const keys = Object.keys(Errors) as Array<keyof typeof Errors>;

describe('errors', () => {
    for (const key of keys) {
        describe(key, () => {
            it('should have correct name', () => {
                const error = new Errors[key]();
                expect(error.name).toBe(key);
            });

            it('should have a message', () => {
                const error = new Errors[key]();
                expect(error.message).not.toBe('');
            });

            it('should have a code', () => {
                const error = new Errors[key]();
                expect(error.code).not.toBe('');
            });
        });
    }
});
