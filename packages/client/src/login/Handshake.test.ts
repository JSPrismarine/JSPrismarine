import { createHash, createSign, diffieHellman, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { deriveEncryptionKey, readHandshake } from './Handshake';

import type { KeyObject } from 'node:crypto';

/** A P-384 pair, the curve every Bedrock identity and server key is on. */
const keyPair = () => generateKeyPairSync('ec', { namedCurve: 'secp384r1' });

const segment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * The token a server builds: `x5u` in the header as base64 DER, `salt` in the payload as
 * base64, signed ES384 with the key the header names.
 */
const handshakeToken = (serverPrivate: KeyObject, serverPublic: KeyObject, salt: Buffer): string => {
    const x5u = serverPublic.export({ type: 'spki', format: 'der' }).toString('base64');
    const signed = `${segment({ alg: 'ES384', x5u })}.${segment({ salt: salt.toString('base64') })}`;
    const signature = createSign('SHA384')
        .update(signed)
        .sign({ key: serverPrivate, dsaEncoding: 'ieee-p1363' }, 'base64url');

    return `${signed}.${signature}`;
};

describe('client', () => {
    describe('Handshake', () => {
        it('reads the public key and the salt out of the token', () => {
            const server = keyPair();
            const salt = Buffer.alloc(16, 0xab);
            const jwt = handshakeToken(server.privateKey, server.publicKey, salt);

            const read = readHandshake(jwt);

            expect(read.publicKeyDer).toBe(server.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
            expect(read.salt).toEqual(salt);
        });

        /**
         * The server side of the derivation, written out independently: ECDH between the
         * server's private key and the client's public key, then SHA-256 over the salt
         * followed by the shared secret. The client must land on the same 32 bytes.
         */
        it('derives the key the server derives', () => {
            const server = keyPair();
            const client = keyPair();
            const salt = Buffer.alloc(16, 0x3c);
            const jwt = handshakeToken(server.privateKey, server.publicKey, salt);

            const secret = diffieHellman({ privateKey: server.privateKey, publicKey: client.publicKey });
            const serverKey = createHash('sha256').update(salt).update(secret).digest();

            const { publicKeyDer, salt: readSalt } = readHandshake(jwt);
            const clientPem = client.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
            const clientKey = deriveEncryptionKey(clientPem, publicKeyDer, readSalt);

            expect(clientKey.byteLength).toBe(32);
            expect(clientKey).toEqual(serverKey);
        });

        it('yields a different key for a different salt', () => {
            const server = keyPair();
            const client = keyPair();
            const x5u = server.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
            const clientPem = client.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

            expect(deriveEncryptionKey(clientPem, x5u, Buffer.alloc(16, 1))).not.toEqual(
                deriveEncryptionKey(clientPem, x5u, Buffer.alloc(16, 2))
            );
        });

        it('refuses a token without a header and payload', () => {
            expect(() => readHandshake('not-a-token')).toThrow('header and a payload');
        });

        it('refuses a token without x5u', () => {
            const jwt = `${segment({ alg: 'ES384' })}.${segment({ salt: 'AA==' })}.sig`;

            expect(() => readHandshake(jwt)).toThrow('x5u');
        });

        it('refuses a token without a salt', () => {
            const jwt = `${segment({ alg: 'ES384', x5u: 'AA==' })}.${segment({})}.sig`;

            expect(() => readHandshake(jwt)).toThrow('salt');
        });
    });
});
