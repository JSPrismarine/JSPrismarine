import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebuggerChannelBridge, PortDebuggerChannel } from './channel';

describe('the debugger channel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Makes the engine's end close the connection after `receive` has seen it open and before
     * `receive` waits, the order a thread switch can produce. The wait itself never blocks: it
     * reports whether it would have returned at once.
     */
    const closeBeforeWait = (close: () => void): string[] => {
        const wait = Atomics.wait.bind(Atomics);
        const outcomes: string[] = [];
        vi.spyOn(Atomics, 'wait').mockImplementation((array, index, value) => {
            close();
            const outcome = wait(array, index, value, 0);
            outcomes.push(outcome);
            return outcome;
        });
        return outcomes;
    };

    it('wakes a receive whose wait starts after the connection side closed', () => {
        const bridge = new DebuggerChannelBridge();
        const channel = new PortDebuggerChannel(bridge.endpoint);
        const outcomes = closeBeforeWait(() => bridge.close());

        expect(channel.receive()).toBeUndefined();
        expect(outcomes).toEqual(['not-equal']);
        channel.close();
    });

    it('wakes a receive whose wait starts after the engine side closed', () => {
        const bridge = new DebuggerChannelBridge();
        const channel = new PortDebuggerChannel(bridge.endpoint);
        const outcomes = closeBeforeWait(() => channel.close());

        expect(channel.receive()).toBeUndefined();
        expect(outcomes).toEqual(['not-equal']);
        bridge.close();
    });

    it('hands over the messages delivered before the connection closed, then reports the close', () => {
        const bridge = new DebuggerChannelBridge();
        const channel = new PortDebuggerChannel(bridge.endpoint);
        bridge.deliver({ type: 'resume' });
        bridge.close();

        expect(channel.closed).toBe(true);
        expect(channel.receive()).toEqual({ type: 'resume' });
        expect(channel.receive()).toBeUndefined();
        channel.close();
    });
});
