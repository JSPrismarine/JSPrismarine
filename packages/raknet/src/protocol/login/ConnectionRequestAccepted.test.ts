import { describe, expect, it } from 'vitest';

import { MAXIMUM_NUMBER_OF_INTERNAL_IDS } from '../../Constants';
import InetAddress from '../../utils/InetAddress';
import { MessageIdentifiers } from '../MessageIdentifiers';
import ConnectionRequestAccepted from './ConnectionRequestAccepted';

const CLIENT = Buffer.from([4, ~192 & 0xff, ~168 & 0xff, ~0 & 0xff, ~1 & 0xff, 0xea, 0x60]); // 192.168.0.1:60000
const LOOPBACK = Buffer.from([4, ~127 & 0xff, 0xff, 0xff, ~1 & 0xff, 0x00, 0x00]); // 127.0.0.1:0
const UNASSIGNED = Buffer.from([4, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00]); // 0.0.0.0:0
const LINK_LOCAL_V6 = Buffer.from([
    6, 0x17, 0x00, 0x4a, 0xbc, 0, 0, 0, 0, 0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0, 0
]); // [fe80::1]:19132
const REQUEST_TIME = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xd2]); // 1234
const ACCEPTED_TIME = Buffer.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]); // 2^63 + 1

describe('ConnectionRequestAccepted', () => {
    it('writes the client address, the system index, twenty addresses, then both timestamps', () => {
        const packet = new ConnectionRequestAccepted();
        packet.clientAddress = new InetAddress('192.168.0.1', 60_000, 4);
        packet.requestTimestamp = 1234n;
        packet.acceptedTimestamp = 0x8000_0000_0000_0001n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.concat([
                Buffer.from([MessageIdentifiers.CONNECTION_REQUEST_ACCEPTED]),
                CLIENT,
                Buffer.from([0x00, 0x00]), // system index
                LOOPBACK,
                ...new Array<Buffer>(MAXIMUM_NUMBER_OF_INTERNAL_IDS - 1).fill(UNASSIGNED),
                REQUEST_TIME,
                ACCEPTED_TIME
            ])
        );
    });

    it('reads the system index and walks past internal addresses of either family', () => {
        // A server on a dual stack host lists IPv6 interfaces among its internal addresses,
        // and those records are 29 bytes rather than 7. Skipping twenty times seven bytes
        // would land the timestamps in the middle of an address.
        const wire = Buffer.concat([
            Buffer.from([MessageIdentifiers.CONNECTION_REQUEST_ACCEPTED]),
            CLIENT,
            Buffer.from([0x00, 0x07]), // system index 7
            LOOPBACK,
            LINK_LOCAL_V6,
            ...new Array<Buffer>(MAXIMUM_NUMBER_OF_INTERNAL_IDS - 2).fill(UNASSIGNED),
            REQUEST_TIME,
            ACCEPTED_TIME
        ]);

        const packet = new ConnectionRequestAccepted(wire);
        packet.decode();

        expect(packet.clientAddress.toString()).toBe('192.168.0.1:60000');
        expect(packet.systemIndex).toBe(7);
        expect(packet.systemAddresses).toHaveLength(MAXIMUM_NUMBER_OF_INTERNAL_IDS);
        expect(packet.systemAddresses[0]!.toString()).toBe('127.0.0.1:0');
        expect(packet.systemAddresses[1]!.toString()).toBe('fe80::1:19132');
        expect(packet.systemAddresses[1]!.getVersion()).toBe(6);
        expect(packet.requestTimestamp).toBe(1234n);
        // Unsigned: read signed this was a negative number.
        expect(packet.acceptedTimestamp).toBe(0x8000_0000_0000_0001n);
        expect(packet.feof()).toBe(true);
    });

    it('writes the internal addresses it is given, padding the rest with unassigned slots', () => {
        const packet = new ConnectionRequestAccepted();
        packet.clientAddress = new InetAddress('192.168.0.1', 60_000, 4);
        packet.systemAddresses = [new InetAddress('fe80::1', 19_132, 6)];
        packet.requestTimestamp = 1234n;
        packet.acceptedTimestamp = 0x8000_0000_0000_0001n;
        packet.encode();

        const decoded = new ConnectionRequestAccepted(packet.getBuffer());
        decoded.decode();
        expect(decoded.systemAddresses[0]!.toString()).toBe('fe80::1:19132');
        expect(decoded.systemAddresses.slice(1).every((address) => address.toString() === '0.0.0.0:0')).toBe(true);
    });
});
