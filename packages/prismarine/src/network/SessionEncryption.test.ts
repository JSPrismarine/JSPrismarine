import { createHash, createPublicKey, diffieHellman, generateKeyPairSync, verify } from 'node:crypto';

import { EncryptionCodec } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import SessionEncryption from './SessionEncryption';

const clientKeys = () => {
    const keys = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    return { keys, identityKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
};

/** What a client does with the token: verify it, then derive the same key the server did. */
const clientCodec = (jwt: string, privateKey: ReturnType<typeof clientKeys>['keys']['privateKey']) => {
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    const { alg, x5u } = JSON.parse(Buffer.from(header, 'base64url').toString());
    const serverKey = createPublicKey({ key: Buffer.from(x5u, 'base64'), format: 'der', type: 'spki' });
    const valid = verify(
        'sha384',
        Buffer.from(`${header}.${claims}`),
        { key: serverKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
    );
    const salt = Buffer.from(JSON.parse(Buffer.from(claims, 'base64url').toString()).salt, 'base64');
    const secret = diffieHellman({ privateKey, publicKey: serverKey });

    return { alg, valid, codec: new EncryptionCodec(createHash('sha256').update(salt).update(secret).digest()) };
};

const batch = (body: string): Buffer => Buffer.concat([Buffer.from([0xfe]), Buffer.from(body)]);

describe('SessionEncryption', () => {
    it('hands the client a signed token whose key both ends derive', () => {
        const { keys, identityKey } = clientKeys();
        const handshake = new SessionEncryption().begin(identityKey);
        const client = clientCodec(handshake.jwt, keys.privateKey);

        expect(client.alg).toBe('ES384');
        expect(client.valid).toBe(true);
        expect(client.codec.decrypt(handshake.codec.encrypt(batch('to the client')))).toEqual(batch('to the client'));
        expect(handshake.codec.decrypt(client.codec.encrypt(batch('to the server')))).toEqual(batch('to the server'));
    });

    it('rejects a batch altered on the wire', () => {
        const { keys, identityKey } = clientKeys();
        const handshake = new SessionEncryption().begin(identityKey);
        const client = clientCodec(handshake.jwt, keys.privateKey);

        const sent = client.codec.encrypt(batch('mine'));
        sent[sent.byteLength - 1]! ^= 0xff;

        expect(() => handshake.codec.decrypt(sent)).toThrow(/Checksum mismatch/);
    });

    it('uses a fresh salt, so two sessions of one client never share a key', () => {
        const { identityKey } = clientKeys();
        const encryption = new SessionEncryption();
        const first = encryption.begin(identityKey);
        const second = encryption.begin(identityKey);

        expect(first.jwt).not.toBe(second.jwt);
        expect(() => second.codec.decrypt(first.codec.encrypt(batch('x')))).toThrow();
    });

    it('refuses an identity key that is not P-384', () => {
        const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const key = other.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

        expect(() => new SessionEncryption().begin(key)).toThrow(/secp384r1/);
        expect(() => new SessionEncryption().begin('not a key')).toThrow();
    });
});
