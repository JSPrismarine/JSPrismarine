import { describe, expect, it } from 'vitest';
import * as Errors from './index';

const keys = Object.keys(Errors).filter((key) => key.endsWith('Error') && !['ErrorKind'].includes(key));

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
