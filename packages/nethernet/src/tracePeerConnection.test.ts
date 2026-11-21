import { describe, expect, it } from 'vitest';

import { tracePeerConnection } from './tracePeerConnection';
import { fakePeer } from './testing/fakePeer.test-utils';

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

    it('tells once whether the client reached an address in the answer', () => {
        type Fake = ReturnType<typeof fakePeer>;
        const outcome = (...steps: ((fake: Fake) => void)[]) => {
            const fake = fakePeer();
            const told: boolean[] = [];
            tracePeerConnection(
                fake.peer,
                () => {},
                (reached) => told.push(reached)
            );
            for (const step of steps) step(fake);
            return told;
        };
        const ice = (state: Parameters<Fake['ice']>[0]) => (fake: Fake) => fake.ice(state);
        const peer = (state: Parameters<Fake['state']>[0]) => (fake: Fake) => fake.state(state);

        expect(outcome(ice('failed'), peer('failed'))).toStrictEqual([false]);
        expect(outcome(ice('connected'), ice('closed'), peer('closed'))).toStrictEqual([true]);
        expect(outcome(ice('connected'), peer('connected'), peer('closed'))).toStrictEqual([true]);
        expect(outcome()).toStrictEqual([]);
    });
});
