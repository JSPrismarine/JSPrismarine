import { Client, Server, SignalStructure, SignalType } from 'nethernet';
import { describe, expect, it } from 'vitest';

import { constrainIcePorts } from './constrainIcePorts';
import { parseUdpPorts, withMappedCandidates } from './udpPorts';

describe('parseUdpPorts', () => {
    it('reads nothing as no constraint', () => {
        expect(parseUdpPorts('')).toStrictEqual({ mappings: [] });
    });

    it("reads Bedrock Dedicated Server's examples that werift can serve", () => {
        expect(parseUdpPorts('49152-49200')).toStrictEqual({ local: { start: 49152, end: 49200 }, mappings: [] });
        expect(parseUdpPorts('203.0.113.10:19132-19140:32000-32008')).toStrictEqual({
            local: { start: 32000, end: 32008 },
            mappings: [
                {
                    address: '203.0.113.10',
                    external: { start: 19132, end: 19140 },
                    internal: { start: 32000, end: 32008 }
                }
            ]
        });
        expect(parseUdpPorts('[2001:db8::1]:19132-19133:32000-32001, 32000-32001').mappings[0]?.address).toBe(
            '2001:db8::1'
        );
    });

    it('keeps each candidate address for a mapping that names no address', () => {
        expect(parseUdpPorts('19132-19133:32000-32001').mappings).toStrictEqual([
            { external: { start: 19132, end: 19133 }, internal: { start: 32000, end: 32001 } }
        ]);
    });

    it.each([
        ['an entry in neither form', 'ports', 'neither a port range nor a mapping'],
        ['a port past 65535', '70000-70010', 'between 1 and 65535'],
        ['a backwards range', '50010-50000', 'between 1 and 65535'],
        ['a mapping of different lengths', '19132-19140:32000-32001', 'maps 9 ports onto 2'],
        ['two different local ranges', '40000-40010,50000-50010', 'werift allocates from one range'],
        // Bedrock Dedicated Server multiplexes players on one port; werift takes a port per player.
        ['a single local port', '19132:32000', 'at least two ports']
    ])('refuses %s', (_name, setting, reason) => {
        expect(() => parseUdpPorts(setting)).toThrow(reason);
    });
});

describe('withMappedCandidates', () => {
    const ANSWER = [
        'v=0',
        'a=candidate:1 1 udp 2130706431 10.0.0.5 32001 typ host',
        'a=candidate:2 1 udp 2130706431 10.0.0.5 40000 typ host',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        ''
    ].join('\r\n');

    it('adds a reflexive candidate at the external port for each host candidate a mapping covers', () => {
        const mapped = withMappedCandidates(ANSWER, parseUdpPorts('203.0.113.10:19132-19140:32000-32008').mappings);

        expect(mapped.split('\r\n')).toStrictEqual([
            'v=0',
            'a=candidate:1 1 udp 2130706431 10.0.0.5 32001 typ host',
            'a=candidate:1m 1 udp 2130706430 203.0.113.10 19133 typ srflx raddr 10.0.0.5 rport 32001',
            'a=candidate:2 1 udp 2130706431 10.0.0.5 40000 typ host',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            ''
        ]);
    });

    it('leaves an answer alone when nothing is mapped', () => {
        expect(withMappedCandidates(ANSWER, [])).toBe(ANSWER);
    });
});

describe('constrainIcePorts', () => {
    it('makes the server gather its candidates from the range', async () => {
        const server = new Server();
        constrainIcePorts(server, { start: 47_200, end: 47_299 });
        const client = new Client(server.networkId, '127.0.0.1');
        try {
            const answer = await new Promise<string>((resolve, reject) => {
                client.signalHandler = (signal) => {
                    if (signal.type !== SignalType.ConnectRequest) return;
                    const offer = new SignalStructure(SignalType.ConnectRequest, 1n, signal.data, client.networkId);
                    server
                        .handleOffer(offer, (response) => {
                            if (response.type === SignalType.ConnectResponse) resolve(response.data);
                        })
                        .catch(reject);
                };
                client.connect();
            });

            const ports = [...answer.matchAll(/^a=candidate:\S+ \d+ udp \d+ \S+ (\d+) typ host/gim)].map(([, port]) =>
                Number(port)
            );
            expect(ports.length).toBeGreaterThan(0);
            expect(ports.every((port) => port >= 47_200 && port <= 47_299)).toBe(true);
        } finally {
            client.close();
            server.close();
        }
    });

    it('refuses a server with no backend to wrap', () => {
        expect(() => constrainIcePorts({}, { start: 1, end: 2 })).toThrow('no WebRTC backend');
    });
});
