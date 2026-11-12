import { describe, expect, it } from 'vitest';

import {
    hasPublicCandidate,
    parsePublicIp,
    parseUdpPorts,
    UdpPortsError,
    withAdvertisedCandidates,
    withDialedCandidates,
    withMappedCandidates
} from './udpPorts';

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

describe('withDialedCandidates', () => {
    // As a server in a container answers: its bridge addresses, on the port signaling shares.
    const ANSWER = [
        'v=0',
        'a=candidate:1 1 UDP 2122317823 fdba:17c8:6c97::e 19132 typ host',
        'a=candidate:2 1 UDP 2122317311 172.21.0.15 19132 typ host',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        ''
    ].join('\r\n');
    const added = (answer: string) => answer.split('\r\n').filter((line) => line.includes('srflx'));

    it('adds the address the client dialed, on the port it dialed, beside the host of its family', () => {
        const dialed = { addresses: ['203.0.113.9'], port: 19132, localPort: 19132 };

        expect(added(withDialedCandidates(ANSWER, dialed))).toStrictEqual([
            'a=candidate:2d 1 UDP 1686109695 203.0.113.9 19132 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
    });

    it('follows a forwarded port: the dialed port stands in for the one signaling listens on', () => {
        const dialed = { addresses: ['203.0.113.9', '2001:db8::7'], port: 25565, localPort: 19132 };

        expect(added(withDialedCandidates(ANSWER, dialed))).toStrictEqual([
            'a=candidate:1d 1 UDP 1686110207 2001:db8::7 25565 typ srflx raddr fdba:17c8:6c97::e rport 19132',
            'a=candidate:2d 1 UDP 1686109695 203.0.113.9 25565 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
    });

    it('uses a mapping for the port, and a port of its own for players apart from signaling', () => {
        const mapped = { addresses: ['203.0.113.9'], port: 19132, localPort: 19132 };
        const apart = { addresses: ['203.0.113.9'], port: 19132, localPort: 19000 };

        expect(added(withDialedCandidates(ANSWER, mapped, parseUdpPorts('29489:19132').mappings))).toStrictEqual([
            'a=candidate:2d 1 UDP 1686109695 203.0.113.9 29489 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
        expect(added(withDialedCandidates(ANSWER, apart))).toStrictEqual([
            'a=candidate:2d 1 UDP 1686109695 203.0.113.9 19132 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
    });

    it('adds one candidate for an address two hosts of a family would both give', () => {
        const twoHosts = ANSWER.replace(
            'm=application',
            'a=candidate:3 1 UDP 2122317055 10.0.0.4 19132 typ host\r\nm=application'
        );
        const dialed = { addresses: ['203.0.113.9'], port: 19132, localPort: 19132 };

        expect(added(withDialedCandidates(twoHosts, dialed))).toHaveLength(1);
    });

    it('leaves an answer alone that lists the address already, however it is spelled, or has none dialed', () => {
        const listed = withMappedCandidates(ANSWER, [], '2001:db8::7');

        expect(withDialedCandidates(listed, { addresses: ['2001:DB8:0::7'], port: 19132, localPort: 19132 })).toBe(
            listed
        );
        expect(withDialedCandidates(ANSWER, { addresses: ['172.21.0.15'], port: 19132, localPort: 19132 })).toBe(
            ANSWER
        );
        expect(withDialedCandidates(ANSWER, undefined)).toBe(ANSWER);
    });
});

describe('withAdvertisedCandidates', () => {
    // As a server behind NAT answers: its private addresses only.
    const ANSWER = [
        'v=0',
        'a=candidate:1 1 UDP 2122317823 fdba:17c8:6c97::e 19132 typ host',
        'a=candidate:2 1 UDP 2122317311 172.21.0.15 19132 typ host',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        ''
    ].join('\r\n');
    const added = (answer: string) => answer.split('\r\n').filter((line) => line.includes('srflx'));
    const unset = parseUdpPorts('');

    it('offers the fallback address when the answer would carry no public address', () => {
        const local = { addresses: ['172.21.0.15'], port: 19132, localPort: 19132 };

        expect(added(withAdvertisedCandidates(ANSWER, unset, local, '203.0.113.9'))).toStrictEqual([
            'a=candidate:2f 1 UDP 1686109695 203.0.113.9 19132 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
        expect(
            added(withAdvertisedCandidates(ANSWER, parseUdpPorts('29489:19132'), undefined, '203.0.113.9'))
        ).toStrictEqual([
            'a=candidate:1m 1 UDP 1686110207 fdba:17c8:6c97::e 29489 typ srflx raddr fdba:17c8:6c97::e rport 19132',
            'a=candidate:2f 1 UDP 1686109695 203.0.113.9 29489 typ srflx raddr 172.21.0.15 rport 19132',
            'a=candidate:2m 1 UDP 1686109695 172.21.0.15 29489 typ srflx raddr 172.21.0.15 rport 19132'
        ]);
    });

    it('keeps the mapped candidates of a host whose family the fallback address is not', () => {
        const ipv6Only = ANSWER.replace(/^a=candidate:2 .*\r\n/m, '');
        const ports = parseUdpPorts('29489:19132');

        expect(withAdvertisedCandidates(ipv6Only, ports, undefined, '203.0.113.9')).toBe(
            withMappedCandidates(ipv6Only, ports.mappings)
        );
        expect(added(withMappedCandidates(ipv6Only, ports.mappings))).toHaveLength(1);
    });

    it('leaves the fallback out when the client dialed a public address or server-public-ip names one', () => {
        const dialed = { addresses: ['198.51.100.4'], port: 19132, localPort: 19132 };
        const configured = parseUdpPorts('', '192.0.2.1');

        expect(withAdvertisedCandidates(ANSWER, unset, dialed, '203.0.113.9')).toBe(
            withDialedCandidates(ANSWER, dialed)
        );
        expect(withAdvertisedCandidates(ANSWER, configured, undefined, '203.0.113.9')).toBe(
            withMappedCandidates(ANSWER, [], '192.0.2.1')
        );
    });

    it('answers as withMappedCandidates and withDialedCandidates do without a fallback', () => {
        expect(withAdvertisedCandidates(ANSWER, unset)).toBe(ANSWER);
    });
});

describe('hasPublicCandidate', () => {
    const answerAt = (...addresses: string[]) =>
        addresses.map((address, index) => `a=candidate:${index} 1 UDP 1 ${address} 19132 typ host`).join('\r\n');

    it.each([
        ['a container network', ['172.21.0.15', 'fdba:17c8:6c97::e']],
        ['a home network, carrier NAT and loopback', ['192.168.2.52', '10.199.87.208', '100.122.230.7', '127.0.0.1']],
        ['link-local and loopback IPv6', ['fe80::1', '::1']],
        ['no candidate', []]
    ])('finds none in an answer with %s', (_name, addresses) => {
        expect(hasPublicCandidate(answerAt(...addresses))).toBe(false);
    });

    it.each(['203.0.113.9', '2003:f3:4f35:b230::1'])('finds %s beside private ones', (address) => {
        expect(hasPublicCandidate(answerAt('172.21.0.15', address))).toBe(true);
    });
});
