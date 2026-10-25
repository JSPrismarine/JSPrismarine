import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { memoryLinkPair } from '@jsprismarine/console-protocol';
import type { LogRecord } from '@jsprismarine/logger';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlushableLink } from './RemoteLogTransport';
import { RemoteLogTransport } from './RemoteLogTransport';

const record = (message: string, level: LogRecord['level'] = 'info'): LogRecord => ({
    level,
    message,
    namespace: 'test',
    timestamp: '00:00:00',
    formatted: `[${level}] ${message}`
});

/** A link that records what it was asked to send and answers `send` with a scripted value. */
const recordingLink = (options: { accept: () => boolean; flush?: () => Promise<void> }) => {
    const sent: ServerMessage[] = [];
    const link: FlushableLink<ConsoleMessage, ServerMessage> = {
        send(message) {
            sent.push(message);
            return options.accept();
        },
        onMessage: () => () => {},
        onClose: () => () => {},
        close: () => {},
        flush: options.flush
    };
    return { link, sent };
};

const logMessages = (sent: readonly ServerMessage[]) =>
    sent.map((message) => (message.type === 'log' ? `${message.seq}:${message.message}` : message.type));

describe('RemoteLogTransport', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('forwards each record as a log message with increasing seq', async () => {
        const [serverEnd, consoleEnd] = memoryLinkPair<ConsoleMessage, ServerMessage>();
        const received: ServerMessage[] = [];
        consoleEnd.onMessage((message) => received.push(message));
        const transport = new RemoteLogTransport(serverEnd);

        const before = Date.now();
        transport.log(record('one'));
        transport.log(record('two', 'warn'));
        await setImmediate();

        expect(received).toHaveLength(2);
        expect(received[0]).toMatchObject({
            type: 'log',
            v: 1,
            seq: 1,
            level: 'info',
            namespace: 'test',
            message: 'one',
            formatted: '[info] one'
        });
        expect(received[1]).toMatchObject({ type: 'log', seq: 2, level: 'warn', message: 'two' });
        if (received[0]?.type !== 'log') throw new Error('expected a log message');
        expect(received[0].at).toBeGreaterThanOrEqual(before);
        expect(received[0].at).toBeLessThanOrEqual(Date.now());
    });

    it('queues records while the link asks for a pause and flushes them after the retry delay', () => {
        vi.useFakeTimers();
        let accept = false;
        const { link, sent } = recordingLink({ accept: () => accept });
        const transport = new RemoteLogTransport(link, { retryMs: 20 });

        transport.log(record('a'));
        transport.log(record('b'));
        transport.log(record('c'));

        // `a` went out and came back `false`; the rest waited.
        expect(logMessages(sent)).toEqual(['1:a']);
        expect(transport.pending).toBe(2);

        accept = true;
        vi.advanceTimersByTime(20);

        expect(logMessages(sent)).toEqual(['1:a', '2:b', '3:c']);
        expect(transport.pending).toBe(0);
    });

    it('drops the oldest queued records past the capacity and reports the count once', () => {
        vi.useFakeTimers();
        let accept = false;
        const { link, sent } = recordingLink({ accept: () => accept });
        const transport = new RemoteLogTransport(link, { capacity: 2, retryMs: 20 });

        transport.log(record('a'));
        for (const message of ['b', 'c', 'd', 'e']) transport.log(record(message));

        expect(transport.pending).toBe(2);
        expect(transport.dropped).toBe(2);

        accept = true;
        vi.advanceTimersByTime(20);

        expect(sent.map((message) => message.type)).toEqual(['log', 'log.dropped', 'log', 'log']);
        expect(sent[1]).toEqual({ type: 'log.dropped', v: 1, count: 2 });
        expect(logMessages(sent).slice(2)).toEqual(['4:d', '5:e']);
        expect(transport.dropped).toBe(0);
    });

    it('resumes when the link reports it drained instead of polling', async () => {
        vi.useFakeTimers();
        let accept = false;
        let drained = () => {};
        const flush = vi.fn(() => new Promise<void>((resolve) => (drained = resolve)));
        const { link, sent } = recordingLink({ accept: () => accept, flush });
        const transport = new RemoteLogTransport(link, { retryMs: 20 });

        transport.log(record('a'));
        transport.log(record('b'));
        vi.advanceTimersByTime(100);

        expect(logMessages(sent)).toEqual(['1:a']);
        expect(flush).toHaveBeenCalledTimes(1);

        accept = true;
        drained();
        await vi.advanceTimersByTimeAsync(0);

        expect(logMessages(sent)).toEqual(['1:a', '2:b']);
    });

    it('skips records below the subscribed level without consuming a seq', async () => {
        const [serverEnd, consoleEnd] = memoryLinkPair<ConsoleMessage, ServerMessage>();
        const received: ServerMessage[] = [];
        consoleEnd.onMessage((message) => received.push(message));
        const transport = new RemoteLogTransport(serverEnd);

        transport.setLevel('warn');
        transport.log(record('hidden', 'info'));
        transport.log(record('shown', 'error'));
        transport.setLevel('silly');
        transport.log(record('back', 'silly'));
        await setImmediate();

        expect(logMessages(received)).toEqual(['1:shown', '2:back']);
    });

    it('sends what is queued on close even while the link is paused, then ignores later records', () => {
        vi.useFakeTimers();
        const { link, sent } = recordingLink({ accept: () => false });
        const transport = new RemoteLogTransport(link, { capacity: 1, retryMs: 20 });

        transport.log(record('a'));
        transport.log(record('b'));
        transport.log(record('c'));
        transport.close();
        transport.log(record('after'));
        vi.advanceTimersByTime(100);

        expect(sent.map((message) => message.type)).toEqual(['log', 'log.dropped', 'log']);
        expect(logMessages(sent)).toEqual(['1:a', 'log.dropped', '3:c']);
        expect(transport.pending).toBe(0);
    });

    it('does not throw when the link is closed', () => {
        const [serverEnd] = memoryLinkPair<ConsoleMessage, ServerMessage>();
        const transport = new RemoteLogTransport(serverEnd);
        serverEnd.close();

        expect(() => transport.log(record('a'))).not.toThrow();
        expect(() => transport.close()).not.toThrow();
    });
});
