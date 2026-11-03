import { describe, expect, it } from 'vitest';

import LiteralMessage from '../LiteralMessage';
import type Message from '../Message';
import StringReader from '../StringReader';
import CommandSyntaxException from './CommandSyntaxException';
import { SimpleCommandExceptionType } from './SimpleCommandExceptionType';

describe('CommandSyntaxException', () => {
    it('preserves its type and contextual message without capturing a stack by default', () => {
        const type = new SimpleCommandExceptionType(new LiteralMessage('error'));
        const reader = new StringReader('Hello world!');
        reader.setCursor(5);
        const previousStackTraceLimit = Error.stackTraceLimit;

        const exception = type.createWithContext(reader);

        expect(exception).toBeInstanceOf(CommandSyntaxException);
        expect(exception).toBeInstanceOf(Error);
        expect(exception.getType()).toBe(type);
        expect(exception.getRawMessage().getString()).toBe('error');
        expect(exception.getMessage()).toBe('error at position 5: Hello<--[HERE]');
        expect(exception.message).toBe('error at position 5: Hello<--[HERE]');
        expect(exception.toString()).toBe('error at position 5: Hello<--[HERE]');
        expect(exception.getInput()).toBe('Hello world!');
        expect(exception.getCursor()).toBe(5);
        expect(exception.stack).toBeUndefined();
        expect(Error.stackTraceLimit).toBe(previousStackTraceLimit);
    });

    it('captures a stack when developer diagnostics enable it', () => {
        const previousSetting = CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES;
        try {
            CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES = true;
            const exception = CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand().create();

            expect(exception.stack).toContain('CommandSyntaxException');
        } finally {
            CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES = previousSetting;
        }
    });

    it('restores the stack trace limit when contextual formatting throws', () => {
        let calls = 0;
        const message: Message = {
            getString() {
                calls++;
                if (calls > 1) throw new Error('context formatting failed');
                return 'error';
            }
        };
        const previousStackTraceLimit = Error.stackTraceLimit;

        expect(() => new CommandSyntaxException({}, message, 'input', 3)).toThrow('context formatting failed');
        expect(Error.stackTraceLimit).toBe(previousStackTraceLimit);
    });
});
