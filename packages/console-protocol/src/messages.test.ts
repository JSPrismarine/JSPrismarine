import { describe, expect, it } from 'vitest';
import { isConsoleMessage, isServerMessage, PROTOCOL_VERSION } from './messages';

describe('isServerMessage', () => {
    it('accepts every server message type', () => {
        const messages = [
            { type: 'hello', v: 1, serverVersion: '0.15.2', pid: 42 },
            { type: 'log', v: 1, seq: 1, level: 'info', namespace: 'Server', at: 1, message: 'm', formatted: 'm' },
            { type: 'log.dropped', v: 1, count: 3 },
            { type: 'status', v: 1, tps: 20, tickMs: 2, players: 0, maxPlayers: 20, rssBytes: 1, uptimeMs: 1 },
            { type: 'lifecycle', v: 1, state: 'running' },
            { type: 'command.result', v: 1, id: 'a', ok: true },
            { type: 'command.result', v: 1, id: 'a', ok: false, error: 'nope' },
            { type: 'complete.result', v: 1, id: 'a', completions: ['help'], replace: 'he' }
        ];
        for (const message of messages) expect(isServerMessage(message), message.type).toBe(true);
    });

    it('rejects non-objects, unknown types, and other protocol versions', () => {
        expect(isServerMessage(null)).toBe(false);
        expect(isServerMessage('hello')).toBe(false);
        expect(isServerMessage({ type: 'chat', v: 1, text: 'x' })).toBe(false);
        expect(isServerMessage({ type: 'hello', v: 2, serverVersion: '1', pid: 1 })).toBe(false);
        expect(isServerMessage({ type: 'hello', serverVersion: '1', pid: 1 })).toBe(false);
        expect(isServerMessage({ type: 'constructor', v: PROTOCOL_VERSION })).toBe(false);
    });

    it('rejects a known type with a missing or mistyped required field', () => {
        expect(isServerMessage({ type: 'hello', v: 1, serverVersion: '1' })).toBe(false);
        expect(isServerMessage({ type: 'hello', v: 1, serverVersion: '1', pid: '42' })).toBe(false);
        expect(isServerMessage({ type: 'complete.result', v: 1, id: 'a', completions: 'help', replace: '' })).toBe(
            false
        );
    });

    it('rejects console messages', () => {
        expect(isServerMessage({ type: 'command', v: 1, id: 'a', line: 'help' })).toBe(false);
    });
});

describe('isConsoleMessage', () => {
    it('accepts every console message type', () => {
        const messages = [
            { type: 'command', v: 1, id: 'a', line: 'help' },
            { type: 'complete', v: 1, id: 'a', line: 'he', cursor: 2 },
            { type: 'shutdown', v: 1 },
            { type: 'subscribe', v: 1, level: 'debug' }
        ];
        for (const message of messages) expect(isConsoleMessage(message), message.type).toBe(true);
    });

    it('rejects server messages, other versions, and bad shapes', () => {
        expect(isConsoleMessage({ type: 'hello', v: 1, serverVersion: '1', pid: 1 })).toBe(false);
        expect(isConsoleMessage({ type: 'shutdown', v: 0 })).toBe(false);
        expect(isConsoleMessage({ type: 'complete', v: 1, id: 'a', line: 'he' })).toBe(false);
        expect(isConsoleMessage(undefined)).toBe(false);
    });
});
