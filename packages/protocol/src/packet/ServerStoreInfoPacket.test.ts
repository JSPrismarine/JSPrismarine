import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientStoreEntryPointConfig from '../structure/ClientStoreEntryPointConfig';
import ServerStoreInfoPacket from './ServerStoreInfoPacket';

import type { ServerStoreInfo } from './ServerStoreInfoPacket';

const DATA: ServerStoreInfo = {
    clientStoreEntryPointConfiguration: new ClientStoreEntryPointConfig('store-1', 'Example Store')
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xda, 0x02], // packet id header: 346 as a varuint32
    ...[0x07, ...Buffer.from('store-1', 'utf8')], // storeId
    ...[0x0d, ...Buffer.from('Example Store', 'utf8')] // storeName, 13 bytes
]);

describe('ServerStoreInfoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ServerStoreInfoPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerStoreInfoPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a populated packet', () => {
        const buffer = new ServerStoreInfoPacket(DATA).serialize(new NetworkBinaryStream());
        const data = new ServerStoreInfoPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(DATA);
    });
});
