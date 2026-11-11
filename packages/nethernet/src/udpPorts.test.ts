import { describe, expect, it } from 'vitest';

import { parsePublicIp, parseUdpPorts, UdpPortsError, withMappedCandidates } from './udpPorts';

/**
 * Every value docs/research/bds-server-udp-ports.md started Bedrock Dedicated Server 1.26.70.24
 * with, with `server-port=19610`, and what it did. "Two lines" there is the comma form here,
 * since the config is JSON.
 */
const STARTS: readonly (readonly [string, { start: number; end: number } | undefined])[] = [
    ['', undefined],
    ['19620', { start: 19620, end: 19620 }],
    [' 19620 ', { start: 19620, end: 19620 }],
    ['19620-19620', { start: 19620, end: 19620 }],
    ['19620-19625', { start: 19620, end: 19625 }],
    ['29489:19620', { start: 19620, end: 19620 }],
    ['19620-19625:19620-19625', { start: 19620, end: 19625 }],
    ['19610', { start: 19610, end: 19610 }],
    ['19620,19620', { start: 19620, end: 19620 }],
    ['19620,', { start: 19620, end: 19620 }],
    ['19620-19622,19623-19625', { start: 19620, end: 19625 }],
    ['19620-19623,19622-19625', { start: 19620, end: 19625 }],
    ['29489:19620,19620', { start: 19620, end: 19620 }],
    ['29489:19620,29490:19621', { start: 19620, end: 19621 }],
    ['29489:19620,29500:19620', { start: 19620, end: 19620 }],
    ['29489-29490:19620-19621,19622', { start: 19620, end: 19622 }],
    ['19620,19621', { start: 19620, end: 19621 }],
    ['12.19.20.18:19620:19620', { start: 19620, end: 19620 }],
    ['[2001:db8::1]:19620:19620', { start: 19620, end: 19620 }]
];

const REFUSALS: readonly (readonly [string, string, string])[] = [
    ['19620,19630', '', 'disjoint UDP port ranges are not supported; configure one continuous internal port range.'],
    [
        '19620-19622,19630-19632',
        '',
        'disjoint UDP port ranges are not supported; configure one continuous internal port range.'
    ],
    ['19625-19620', '', "reversed port range '19625-19620'."],
    ['21200-21300:19400-19450', '', "entry '21200-21300:19400-19450' has mismatched range lengths."],
    ['ports', '', 'Invalid Port. Port must be in the range [ 1, 65535 ]'],
    ['0', '', 'Invalid Port. Port must be in the range [ 1, 65535 ]'],
    ['70000', '', 'Invalid Port. Port must be in the range [ 1, 65535 ]'],
    ['12.19.20.18:19620', '', 'Invalid Port. Port must be in the range [ 1, 65535 ]'],
    [
        'example.com:19620:19620',
        '',
        'expected an IPv4 literal, raw or [bracketed] IPv6 literal, or empty; do not include a port or hostname.'
    ],
    [
        '1.2.3.4:19620:19620,5.6.7.8:19621:19621',
        '',
        "conflicting UDP IP prefixes '1.2.3.4' and '5.6.7.8'; only one public IP is supported."
    ],
    [
        '1.2.3.4:19620:19620',
        '5.6.7.8',
        "server-public-ip '5.6.7.8' conflicts with UDP IP prefix '1.2.3.4'; configure only one public IP."
    ]
];

describe('server-udp-ports as Bedrock Dedicated Server 1.26.70.24 reads it', () => {
    it.each(STARTS)('starts with %j', (setting, local) => {
        expect(parseUdpPorts(setting).local).toStrictEqual(local);
    });

    it.each(REFUSALS)('refuses %j (server-public-ip %j) with its message', (setting, publicIp, message) => {
        expect(() => parseUdpPorts(setting, publicIp)).toThrow(UdpPortsError);
        expect(() => parseUdpPorts(setting, publicIp)).toThrow(`server-udp-ports: ${message}`);
    });

    it('keeps the mappings in the order they were written', () => {
        expect(parseUdpPorts('29489-29490:19620-19621,19622').mappings).toStrictEqual([
            { external: { start: 29489, end: 29490 }, internal: { start: 19620, end: 19621 } }
        ]);
    });

    it('takes a prefix as the public address, with the deprecation warning that names server-public-ip', () => {
        const ports = parseUdpPorts('12.19.20.18:19620:19620');

        expect(ports.publicIp).toBe('12.19.20.18');
        expect(ports.warnings).toStrictEqual([
            'IP prefixes in server-udp-ports are deprecated. Set server-public-ip=12.19.20.18 and use port mappings without IP prefixes.'
        ]);
        expect(parseUdpPorts('[2001:db8::1]:19620:19620').publicIp).toBe('2001:db8::1');
    });

    it('accepts a prefix equal to server-public-ip, and warns', () => {
        const ports = parseUdpPorts('1.2.3.4:19620:19620', '1.2.3.4');

        expect([ports.publicIp, ports.warnings.length]).toStrictEqual(['1.2.3.4', 1]);
    });
});

describe('server-public-ip as Bedrock Dedicated Server 1.26.70.24 reads it', () => {
    it('takes a raw IPv4, a raw or bracketed IPv6, or nothing', () => {
        expect(parsePublicIp('203.0.113.7')).toBe('203.0.113.7');
        expect(parsePublicIp('2001:db8::1')).toBe('2001:db8::1');
        expect(parsePublicIp('[2001:db8::1]')).toBe('2001:db8::1');
        expect(parsePublicIp('')).toBeUndefined();
        expect(parseUdpPorts('', '[2001:db8::1]').publicIp).toBe('2001:db8::1');
    });

    it.each(['example.com', '1.2.3.4:19620', '[1.2.3.4]'])('refuses %j with its message', (value) => {
        expect(() => parsePublicIp(value)).toThrow(
            `Invalid value '${value}' for server-public-ip: expected an IPv4 literal, raw or [bracketed] IPv6 literal, or empty; do not include a port or hostname.`
        );
    });
});

describe('withMappedCandidates', () => {
    // As libdatachannel answers: a host candidate per interface, on the mux port.
    const ANSWER = [
        'v=0',
        'a=candidate:1 1 UDP 2122194687 192.0.2.10 19620 typ host',
        'a=candidate:2 1 UDP 2122265343 2001:db8::5 19620 typ host',
        'a=candidate:3 1 UDP 2122194687 192.0.2.10 40000 typ host',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        ''
    ].join('\r\n');

    it('adds the public port at each host address for a mapping, as Bedrock Dedicated Server answers', () => {
        const mapped = withMappedCandidates(ANSWER, parseUdpPorts('29489:19620').mappings);

        expect(mapped.split('\r\n')).toStrictEqual([
            'v=0',
            'a=candidate:1 1 UDP 2122194687 192.0.2.10 19620 typ host',
            'a=candidate:1m 1 UDP 1685987071 192.0.2.10 29489 typ srflx raddr 192.0.2.10 rport 19620',
            'a=candidate:2 1 UDP 2122265343 2001:db8::5 19620 typ host',
            'a=candidate:2m 1 UDP 1686057727 2001:db8::5 29489 typ srflx raddr 2001:db8::5 rport 19620',
            'a=candidate:3 1 UDP 2122194687 192.0.2.10 40000 typ host',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            ''
        ]);
    });

    it('puts the public address on hosts of its family only', () => {
        const ports = parseUdpPorts('29489:19620', '203.0.113.9');
        const mapped = withMappedCandidates(ANSWER, ports.mappings, ports.publicIp);

        expect(mapped.split('\r\n').filter((line) => line.includes('srflx'))).toStrictEqual([
            'a=candidate:1m 1 UDP 1685987071 203.0.113.9 29489 typ srflx raddr 192.0.2.10 rport 19620',
            'a=candidate:3m 1 UDP 1685987071 203.0.113.9 40000 typ srflx raddr 192.0.2.10 rport 40000'
        ]);
    });

    it('advertises the public address on the local port when nothing maps it', () => {
        const mapped = withMappedCandidates(ANSWER, [], '203.0.113.9');

        expect(mapped.split('\r\n').filter((line) => line.includes('srflx'))).toStrictEqual([
            'a=candidate:1m 1 UDP 1685987071 203.0.113.9 19620 typ srflx raddr 192.0.2.10 rport 19620',
            'a=candidate:3m 1 UDP 1685987071 203.0.113.9 40000 typ srflx raddr 192.0.2.10 rport 40000'
        ]);
    });

    it('leaves an answer alone when nothing is mapped and no address is public', () => {
        expect(withMappedCandidates(ANSWER, [])).toBe(ANSWER);
    });
});
