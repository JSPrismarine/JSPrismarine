import { createHash, createPublicKey, diffieHellman, generateKeyPairSync } from 'node:crypto';

import { EncryptionCodec } from '@jsprismarine/protocol';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import SessionEncryption from './SessionEncryption';

const clientKeys = () => {
    const keys = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    return { keys, identityKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
};

/** What a client does with the token: verify it, then derive the same key the server did. */
const clientCodec = async (jwt: string, privateKey: ReturnType<typeof clientKeys>['keys']['privateKey']) => {
    const { alg, x5u } = decodeProtectedHeader(jwt);
    const serverKey = createPublicKey({ key: Buffer.from(String(x5u), 'base64'), format: 'der', type: 'spki' });
    const { payload } = await jwtVerify(jwt, serverKey, { algorithms: ['ES384'] });
    const salt = Buffer.from(String(payload.salt), 'base64');
    const secret = diffieHellman({ privateKey, publicKey: serverKey });

    return { alg, codec: new EncryptionCodec(createHash('sha256').update(salt).update(secret).digest()) };
};

const batch = (body: string): Buffer => Buffer.concat([Buffer.from([0xfe]), Buffer.from(body)]);

describe('SessionEncryption', () => {
    it('hands the client a signed token whose key both ends derive', async () => {
        const { keys, identityKey } = clientKeys();
        const handshake = await new SessionEncryption().begin(identityKey);
        const client = await clientCodec(handshake.jwt, keys.privateKey);

        expect(client.alg).toBe('ES384');
        expect(client.codec.decrypt(handshake.codec.encrypt(batch('to the client')))).toEqual(batch('to the client'));
        expect(handshake.codec.decrypt(client.codec.encrypt(batch('to the server')))).toEqual(batch('to the server'));
    });

    it('rejects a batch altered on the wire', async () => {
        const { keys, identityKey } = clientKeys();
        const handshake = await new SessionEncryption().begin(identityKey);
        const client = await clientCodec(handshake.jwt, keys.privateKey);

        const sent = client.codec.encrypt(batch('mine'));
        sent[sent.byteLength - 1]! ^= 0xff;

        expect(() => handshake.codec.decrypt(sent)).toThrow(/Checksum mismatch/);
    });

    it('uses a fresh salt, so two sessions of one client never share a key', async () => {
        const { identityKey } = clientKeys();
        const encryption = new SessionEncryption();
        const first = await encryption.begin(identityKey);
        const second = await encryption.begin(identityKey);

        expect(first.jwt).not.toBe(second.jwt);
        expect(() => second.codec.decrypt(first.codec.encrypt(batch('x')))).toThrow();
    });

    it('refuses an identity key that is not P-384', async () => {
        const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const key = other.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

        await expect(new SessionEncryption().begin(key)).rejects.toThrow(/secp384r1/);
        await expect(new SessionEncryption().begin('not a key')).rejects.toThrow();
    });
});
