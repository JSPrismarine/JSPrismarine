import { describe, expect, it } from 'vitest';

import { tracePeerConnection } from './tracePeerConnection';
import type { DriverPeer, IceState, PeerState } from './WebRtcDriver';

/** A peer whose states a test sets, with the listeners a trace installs. */
const fakePeer = () => {
    const onState: ((state: PeerState) => void)[] = [];
    const onIce: ((state: IceState) => void)[] = [];
    let state: PeerState = 'connecting';
    let iceState: IceState = 'checking';
    const peer: DriverPeer = {
        get state() {
            return state;
        },
        get iceState() {
            return iceState;
        },
        setRemoteDescription: () => {},
        addRemoteCandidate: () => {},
        createDataChannel: () => {
            throw new Error('The trace opens no channel');
        },
        localDescription: async () => '',
        onDataChannel: () => {},
        onStateChange: (listener) => void onState.push(listener),
        onIceStateChange: (listener) => void onIce.push(listener),
        remoteAddress: () => ({ address: '198.51.100.7', port: 50_000 }),
        localAddress: () => ({ address: '203.0.113.9', port: 19_132 }),
        close: () => {}
    };
    return {
        peer,
        ice: (next: IceState) => {
            iceState = next;
            for (const listener of onIce) listener(next);
        },
        state: (next: PeerState) => {
            state = next;
            for (const listener of onState) listener(next);
        }
    };
};

describe('tracePeerConnection', () => {
    it('says no check passed when a peer closes while ICE is still checking', () => {
        const fake = fakePeer();
        const lines: string[] = [];
        tracePeerConnection(fake.peer, (line, failed) => lines.push(failed ? `failed: ${line}` : line));

        fake.ice('closed');
        fake.state('closed');

        expect(lines).toStrictEqual([
            'failed: connection closed before it connected; ICE was checking: no connectivity check passed, so the client reached no address in the answer'
        ]);
    });

    it('says the handshake stalled when a peer closes after ICE connected', () => {
        const fake = fakePeer();
        const lines: string[] = [];
        tracePeerConnection(fake.peer, (line, failed) => lines.push(failed ? `failed: ${line}` : line));

        fake.ice('connected');
        fake.ice('closed');
        fake.state('closed');

        expect(lines).toStrictEqual([
            'failed: connection closed before it connected; ICE was connected: the client reached the server, and the handshake after it did not finish'
        ]);
    });

    it('reports a peer that connected and later closed as it did before', () => {
        const fake = fakePeer();
        const lines: string[] = [];
        tracePeerConnection(fake.peer, (line, failed) => lines.push(failed ? `failed: ${line}` : line));

        fake.ice('connected');
        fake.state('connected');
        fake.state('disconnected');
        fake.state('closed');

        expect(lines).toStrictEqual([
            'connection connected',
            'ICE pair 203.0.113.9:19132 <-> 198.51.100.7:50000',
            'connection disconnected',
            'connection closed'
        ]);
    });
});
