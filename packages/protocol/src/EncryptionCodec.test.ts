import { describe, expect, it } from 'vitest';

import { BATCH_PACKET_ID } from './BatchCodec';
import { EncryptionCodec } from './EncryptionCodec';

/** Two ends of one connection, each deriving the same key. */
const pair = () => {
    const key = Buffer.alloc(32, 7);
    return { client: new EncryptionCodec(key), server: new EncryptionCodec(key) };
};

const batch = (body: string) => Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from(body, 'utf8')]);

describe('protocol', () => {
    describe('EncryptionCodec', () => {
        it('refuses a key that is not 32 bytes', () => {
            expect(() => new EncryptionCodec(Buffer.alloc(16))).toThrow('32 bytes');
        });

        it('leaves the batch header in the clear', () => {
            const { client } = pair();
            const encrypted = client.encrypt(batch('hello'));

            expect(encrypted[0]).toBe(BATCH_PACKET_ID);
            expect(encrypted.subarray(1)).not.toEqual(Buffer.from('hello', 'utf8'));
        });

        it('adds eight bytes of checksum', () => {
            const { client } = pair();

            expect(client.encrypt(batch('hello')).byteLength).toBe(batch('hello').byteLength + 8);
        });

        it('round trips a batch between the two ends', () => {
            const { client, server } = pair();
            const original = batch('a packet or two');

            expect(server.decrypt(client.encrypt(original))).toEqual(original);
        });

        /**
         * The keystream is continuous, so this is the case that a per-batch cipher would pass
         * and a real connection would fail on the second packet.
         */
        it('round trips several batches in a row', () => {
            const { client, server } = pair();

            for (const body of ['first', 'second', 'a rather longer third one', 'fourth']) {
                expect(server.decrypt(client.encrypt(batch(body)))).toEqual(batch(body));
            }
        });

        /** Each direction has its own stream, so one side sending does not move the other on. */
        it('keeps the two directions independent', () => {
            const { client, server } = pair();

            client.encrypt(batch('client to server'));
            client.encrypt(batch('and another'));

            expect(client.decrypt(server.encrypt(batch('server to client')))).toEqual(batch('server to client'));
        });

        it('rejects a batch whose checksum does not match', () => {
            const { client, server } = pair();
            const tampered = client.encrypt(batch('hello'));
            tampered[3] ^= 0xff;

            expect(() => server.decrypt(tampered)).toThrow('Checksum mismatch');
        });

        /**
         * A batch that never arrives desynchronises the counters, and the failure surfaces on
         * the *next* batch rather than the missing one - which is why it is worth a test.
         */
        it('rejects everything after a batch is skipped', () => {
            const { client, server } = pair();

            client.encrypt(batch('the one that is lost'));

            expect(() => server.decrypt(client.encrypt(batch('the one after')))).toThrow('Checksum mismatch');
        });

        it('refuses a batch too short to hold a checksum', () => {
            const { server } = pair();

            expect(() => server.decrypt(Buffer.from([BATCH_PACKET_ID, 1, 2]))).toThrow('at least 8 bytes');
        });
    });
});
