import { constants, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { decryptFromClient, hasJoined } from './javaAuth';

describe('decryptFromClient', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const encrypt = (message: Buffer) =>
        publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, message);

    it('reads what a client encrypted with PKCS #1 v1.5 padding', () => {
        const secret = randomBytes(16);

        expect(decryptFromClient(privateKey, encrypt(secret), 16)).toStrictEqual(secret);
    });

    it('gives other bytes of the asked length for a message of another length, or a block that is not one', () => {
        const token = Buffer.from([1, 2, 3, 4]);
        const wrongLength = decryptFromClient(privateKey, encrypt(token), 16);
        const unpadded = decryptFromClient(
            privateKey,
            publicEncrypt({ key: publicKey, padding: constants.RSA_NO_PADDING }, Buffer.alloc(128, 1)),
            4
        );
        const truncated = decryptFromClient(privateKey, Buffer.alloc(3), 4);

        expect(wrongLength).toHaveLength(16);
        expect(unpadded).toHaveLength(4);
        expect(unpadded.equals(Buffer.alloc(4, 1))).toBe(false);
        expect(truncated).toHaveLength(4);
    });
});

describe('hasJoined', () => {
    it('asks for the name and the hash, and reads the profile Mojang answers with', async () => {
        const urls: string[] = [];
        const profile = await hasJoined('Notch', '-7c9d', async (url) => {
            urls.push(url);
            return {
                status: 200,
                json: async () => ({
                    id: '069a79f444e94726a5befca90e38aaf5',
                    name: 'Notch',
                    properties: [{ name: 'textures', value: 'e30=', signature: 'c2ln' }]
                })
            };
        });

        expect(urls).toEqual([
            'https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch&serverId=-7c9d'
        ]);
        expect(profile).toEqual({
            id: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            properties: [{ name: 'textures', value: 'e30=', signature: 'c2ln' }]
        });
    });

    it('reads no profile from an empty answer', async () => {
        expect(await hasJoined('Notch', '0', async () => ({ status: 204, json: async () => null }))).toBeUndefined();
    });
});
