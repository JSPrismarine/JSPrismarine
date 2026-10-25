import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { BATCH_PACKET_ID } from './BatchCodec';
import { EncryptionCodec } from './EncryptionCodec';

const KEY = Buffer.alloc(32, 7);

/** Two ends of one connection, each deriving the same key. */
const pair = () => {
    return { client: new EncryptionCodec(KEY), server: new EncryptionCodec(KEY) };
};

const batch = (body: string) => Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from(body, 'utf8')]);

/** The checksum the docs describe: SHA-256(counter LE64 || body || key), cut to eight bytes. */
const checksum = (counter: number, body: Buffer): Buffer => {
    const counted = Buffer.alloc(8);
    counted.writeBigUInt64LE(BigInt(counter));

    return createHash('sha256').update(counted).update(body).update(KEY).digest().subarray(0, 8);
};

describe('protocol', () => {
    describe('EncryptionCodec', () => {
        /**
         * Two batches for `KEY`, worked out by hand with AES-256-GCM streamed over the key's
         * first twelve bytes. The ciphertext is pinned so a change to the IV construction
         * cannot pass by round-tripping against itself.
         */
        it('produces the bytes AES-256-GCM over the first twelve key bytes produces', () => {
            const { client } = pair();

            expect(checksum(0, Buffer.from('hello')).toString('hex')).toBe('c18007d16685ff01');
            expect(checksum(1, Buffer.from('second')).toString('hex')).toBe('1dd9f88aa956af71');

            expect(client.encrypt(batch('hello')).toString('hex')).toBe('fea6fe265369273f629d8f04c53e');
            expect(client.encrypt(batch('second')).toString('hex')).toBe('feaac31723cbe30d2086eec8382e64');
        });

        /** The same equivalence over a longer run, so block boundaries get crossed. */
        it('keeps matching a streamed GCM cipher across many batches', () => {
            const { client } = pair();
            const gcm = createCipheriv('aes-256-gcm', KEY, KEY.subarray(0, 12));

            for (let counter = 0; counter < 40; counter++) {
                const body = Buffer.from(`batch number ${counter} with some padding to cross blocks`);
                const expected = Buffer.concat([
                    Buffer.from([BATCH_PACKET_ID]),
                    gcm.update(Buffer.concat([body, checksum(counter, body)]))
                ]);

                expect(client.encrypt(Buffer.concat([Buffer.from([BATCH_PACKET_ID]), body]))).toEqual(expected);
            }
        });

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
            tampered.writeUInt8(tampered.readUInt8(3) ^ 0xff, 3);

            expect(() => server.decrypt(tampered)).toThrow('Checksum mismatch');
        });

        /**
         * A batch that never arrives desynchronizes the counters, and the failure surfaces on
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
