import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { isFfiExperimentalWarning, suppressFfiWarning } from './warnings';

const warning = (name: string, message: string): Error => Object.assign(new Error(message), { name });

describe('isFfiExperimentalWarning', () => {
    it('matches the warning Node prints when node:ffi loads', () => {
        expect(isFfiExperimentalWarning(warning('ExperimentalWarning', 'FFI is an experimental feature'))).toBe(true);
    });

    it.each([
        ['another experimental feature', warning('ExperimentalWarning', 'SQLite is an experimental feature')],
        ['a deprecation that mentions FFI', warning('DeprecationWarning', 'FFI callbacks are deprecated')],
        ['a plain error', new Error('FFI is an experimental feature')]
    ])('leaves %s alone', (_name, error) => {
        expect(isFfiExperimentalWarning(error)).toBe(false);
    });
});

describe('suppressFfiWarning', () => {
    it('drops the FFI warning before the existing printer sees it and passes others through', () => {
        const process = new EventEmitter<{ warning: [Error] }>();
        const printer = vi.fn<(error: Error) => void>();
        process.on('warning', printer);

        suppressFfiWarning(process);
        process.emit('warning', warning('ExperimentalWarning', 'FFI is an experimental feature'));
        const deprecation = warning('DeprecationWarning', 'Buffer() is deprecated');
        process.emit('warning', deprecation);

        expect(printer).toHaveBeenCalledTimes(1);
        expect(printer).toHaveBeenCalledWith(deprecation);
    });
});
