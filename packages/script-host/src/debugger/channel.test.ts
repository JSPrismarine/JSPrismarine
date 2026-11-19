import { describe, expect, it } from 'vitest';

import { DebuggerChannelBridge, PortDebuggerChannel } from './channel';

describe('the debugger channel', () => {
    /**
     * What a `receive` that saw the connection open and had not yet started to wait would wait on:
     * the first word of the shared signal, which counts deliveries and closes, as it read it.
     */
    const waitedOn = (bridge: DebuggerChannelBridge) => {
        const signal = new Int32Array(bridge.endpoint.signal);
        const seen = Atomics.load(signal, 0);
        // A zero timeout, so a wait that would block reports `timed-out` instead of hanging the test.
        return { wait: () => Atomics.wait(signal, 0, seen, 0) };
    };

    it('wakes a receive whose wait starts after the connection side closed', () => {
        const bridge = new DebuggerChannelBridge();
        const channel = new PortDebuggerChannel(bridge.endpoint);
        const before = waitedOn(bridge);
        bridge.close();

        expect(before.wait()).toBe('not-equal');
        expect(channel.receive()).toBeUndefined();
        channel.close();
    });

    it('wakes a receive whose wait starts after the engine side closed', () => {
        const bridge = new DebuggerChannelBridge();
        const channel = new PortDebuggerChannel(bridge.endpoint);
        const before = waitedOn(bridge);
        channel.close();

        expect(before.wait()).toBe('not-equal');
        expect(channel.receive()).toBeUndefined();
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
