import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientStoreEntryPointConfig from './ClientStoreEntryPointConfig';

/** A store on the wire: storeId "store-1" then storeName "Example Store". */
const STORE = Buffer.from([
    ...[0x07, ...Buffer.from('store-1', 'utf8')], // storeId
    ...[0x0d, ...Buffer.from('Example Store', 'utf8')] // storeName, 13 bytes
]);

describe('ClientStoreEntryPointConfig', () => {
    it('writes the id then the name', () => {
        const stream = new NetworkBinaryStream();
        new ClientStoreEntryPointConfig('store-1', 'Example Store').serialize(stream);

        expect(stream.getBuffer()).toEqual(STORE);
    });

    it('writes two empty strings by default', () => {
        const stream = new NetworkBinaryStream();
        new ClientStoreEntryPointConfig().serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.from([0x00, 0x00]));
    });

    it('reads both strings and consumes exactly them', () => {
        const stream = new NetworkBinaryStream(STORE);
        const config = ClientStoreEntryPointConfig.deserialize(stream);

        expect(config).toEqual(new ClientStoreEntryPointConfig('store-1', 'Example Store'));
        expect(stream.feof()).toBe(true);
    });
});
