import { describe, expect, it } from 'vitest';

import { MAXIMUM_NUMBER_OF_INTERNAL_IDS } from '../../Constants';
import InetAddress from '../../utils/InetAddress';
import { MessageIdentifiers } from '../MessageIdentifiers';
import NewIncomingConnection from './NewIncomingConnection';

const SERVER = Buffer.from([4, ~10 & 0xff, 0xff, 0xff, ~1 & 0xff, 0x4a, 0xbc]); // 10.0.0.1:19132
const UNASSIGNED = Buffer.from([4, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00]); // 0.0.0.0:0
const LINK_LOCAL_V6 = Buffer.from([
    6, 0x17, 0x00, 0xea, 0x60, 0, 0, 0, 0, 0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0, 0
]); // [fe80::1]:60000
const REQUEST_TIME = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0xd2]); // 1234
const ACCEPTED_TIME = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0xe1]); // 4321

describe('NewIncomingConnection', () => {
    it('writes the server address, twenty internal addresses, then both timestamps', () => {
        const packet = new NewIncomingConnection();
        packet.address = new InetAddress('10.0.0.1', 19_132, 4);
        packet.systemAddresses = [new InetAddress('fe80::1', 60_000, 6)];
        packet.requestTimestamp = 1234n;
        packet.acceptedTimestamp = 4321n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.concat([
                Buffer.from([MessageIdentifiers.NEW_INCOMING_CONNECTION]),
                SERVER,
                LINK_LOCAL_V6,
                ...new Array<Buffer>(MAXIMUM_NUMBER_OF_INTERNAL_IDS - 1).fill(UNASSIGNED),
                REQUEST_TIME,
                ACCEPTED_TIME
            ])
        );
    });

    it('walks past internal addresses of either family to reach the timestamps', () => {
        // The Bedrock client on a dual stack host lists IPv6 interfaces here, and those
        // records are 29 bytes rather than 7, so there is no fixed number of bytes to skip.
        const wire = Buffer.concat([
            Buffer.from([MessageIdentifiers.NEW_INCOMING_CONNECTION]),
            SERVER,
            ...new Array<Buffer>(3).fill(LINK_LOCAL_V6),
            ...new Array<Buffer>(MAXIMUM_NUMBER_OF_INTERNAL_IDS - 3).fill(UNASSIGNED),
            REQUEST_TIME,
            ACCEPTED_TIME
        ]);

        const packet = new NewIncomingConnection(wire);
        packet.decode();

        expect(packet.address.toString()).toBe('10.0.0.1:19132');
        expect(packet.systemAddresses).toHaveLength(MAXIMUM_NUMBER_OF_INTERNAL_IDS);
        expect(packet.systemAddresses[2]!.toString()).toBe('fe80::1:60000');
        expect(packet.systemAddresses[3]!.toString()).toBe('0.0.0.0:0');
        expect(packet.requestTimestamp).toBe(1234n);
        expect(packet.acceptedTimestamp).toBe(4321n);
        expect(packet.feof()).toBe(true);
    });
});
