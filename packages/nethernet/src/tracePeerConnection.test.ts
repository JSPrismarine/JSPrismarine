import { describe, expect, it } from 'vitest';

import { describeCandidates, tracePeerConnection } from './tracePeerConnection';

/** One of werift's events: subscribers, and a way to fire it. */
const event = () => {
    const listeners: ((state: unknown) => void)[] = [];
    return {
        subscribe: (listener: (state: unknown) => void) => void listeners.push(listener),
        fire: (state: unknown) => listeners.forEach((listener) => listener(state))
    };
};

describe('describeCandidates', () => {
    it('lists each candidate as address, port and type, naming a protocol other than UDP', () => {
        const description = [
            'v=0',
            'a=candidate:1 1 udp 2130706431 10.0.0.5 50026 typ host',
            'a=candidate:2 1 tcp 1518280447 2001:db8::1 9 typ host tcptype active',
            'a=candidate:3 1 UDP 1677729535 203.0.113.4 61000 typ srflx raddr 10.0.0.5 rport 50026'
        ].join('\r\n');

        expect(describeCandidates(description)).toStrictEqual([
            '10.0.0.5:50026 host',
            '2001:db8::1:9 host tcp',
            '203.0.113.4:61000 srflx'
        ]);
    });
});

describe('tracePeerConnection', () => {
    it('reports state changes, and the pair ICE chose once it connects', () => {
        const ice = event();
        const connection = event();
        const lines: string[] = [];
        tracePeerConnection(
            {
                iceConnectionStateChange: ice,
                connectionStateChange: connection,
                iceTransports: [
                    {
                        // Werift's candidate strings leave out the `candidate:` prefix.
                        getSelectedCandidatePair: () => ({
                            local: { candidate: '1 1 udp 2130706431 51.81.203.68 49638 typ host' },
                            remote: { candidate: 'candidate:2 1 udp 1677729535 176.7.225.134 61420 typ prflx' }
                        })
                    }
                ]
            },
            (line) => void lines.push(line)
        );

        ice.fire('checking');
        ice.fire('connected');
        connection.fire('connected');

        expect(lines).toStrictEqual([
            'ICE checking',
            'ICE connected',
            'ICE pair 51.81.203.68:49638 host <-> 176.7.225.134:61420 prflx',
            'connection connected'
        ]);
    });

    it('reports nothing for a peer connection without the events', () => {
        const lines: string[] = [];
        tracePeerConnection({}, (line) => void lines.push(line));
        tracePeerConnection(undefined, (line) => void lines.push(line));

        expect(lines).toStrictEqual([]);
    });
});
