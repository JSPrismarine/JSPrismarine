import { createDecoder } from 'fast-jwt';
import { createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SKIN_HEIGHT, SKIN_WIDTH, createDefaultSkinImage } from './DefaultSkin';
import OfflineAuthProvider from './OfflineAuthProvider';

const decode = createDecoder();
const decodeComplete = createDecoder({ complete: true });

const REQUEST = { serverAddress: '127.0.0.1:19132', protocolVersion: 748 };

describe('OfflineAuthProvider', () => {
    it('signs a single self-signed chain link', async () => {
        const auth = new OfflineAuthProvider({ displayName: 'Steve' });
        const { chainData } = await auth.createLoginCredentials(REQUEST);

        const chain = JSON.parse(chainData).chain;
        expect(chain).toHaveLength(1);

        const { header, payload } = decodeComplete(chain[0]);
        expect(header.alg).toBe('ES384');
        // Self-signed is precisely this: the key in the header is the key in the claim.
        expect(header.x5u).toBe(payload.identityPublicKey);
        expect(header.x5u).toBe(await auth.getIdentityPublicKey());
    });

    it('carries the identity the server reads out of extraData', async () => {
        const auth = new OfflineAuthProvider({ displayName: 'Alex' });
        const identity = await auth.getIdentity();
        const { chainData } = await auth.createLoginCredentials(REQUEST);

        const { extraData } = decode(JSON.parse(chainData).chain[0]);

        expect(extraData.displayName).toBe('Alex');
        expect(extraData.identity).toBe(identity.identity);
        // No XUID, which is what makes this offline and what a server in online mode checks.
        expect(extraData.XUID).toBe('');
    });

    it('gives each instance its own identity and key', async () => {
        const [first, second] = [
            new OfflineAuthProvider({ displayName: 'Bot' }),
            new OfflineAuthProvider({ displayName: 'Bot' })
        ];

        // Five hundred bots under one name still need five hundred identities: sharing a key
        // would have two connections claim to be the same client, and the encryption
        // handshake would derive one secret for both.
        expect((await first.getIdentity()).identity).not.toBe((await second.getIdentity()).identity);
        expect(await first.getIdentityPublicKey()).not.toBe(await second.getIdentityPublicKey());
    });

    it('keeps a supplied identity across logins, so a world can be come back to', async () => {
        const auth = new OfflineAuthProvider({
            displayName: 'Steve',
            identity: '11111111-2222-3333-4444-555555555555'
        });

        expect((await auth.getIdentity()).identity).toBe('11111111-2222-3333-4444-555555555555');
        const first = decode(JSON.parse((await auth.createLoginCredentials(REQUEST)).chainData).chain[0]);
        const second = decode(JSON.parse((await auth.createLoginCredentials(REQUEST)).chainData).chain[0]);
        expect(first.extraData.identity).toBe(second.extraData.identity);
    });

    it('exports a key pair the encryption handshake can actually use', async () => {
        const auth = new OfflineAuthProvider({ displayName: 'Steve' });

        // The public half travels as base64 DER, not PEM and not a JWK - and it has to be a
        // P-384 key, because that is the curve the shared secret is derived on.
        const key = createPublicKey({
            key: Buffer.from(await auth.getIdentityPublicKey(), 'base64'),
            format: 'der',
            type: 'spki'
        });

        expect(key.asymmetricKeyType).toBe('ec');
        expect((key.asymmetricKeyDetails as any).namedCurve).toBe('secp384r1');
        expect(await auth.getIdentityPrivateKey()).toContain('BEGIN PRIVATE KEY');
    });

    it('reports the address it was asked to connect to', async () => {
        const auth = new OfflineAuthProvider({ displayName: 'Steve' });
        const { clientData } = await auth.createLoginCredentials({ ...REQUEST, serverAddress: 'example.org:19133' });

        expect(decode(clientData).ServerAddress).toBe('example.org:19133');
    });

    it('carries every skin field the server dereferences without checking', async () => {
        // `Skin.fromJWT` reads all of these unconditionally, so a client that omits one
        // crashes the login handler rather than being politely refused.
        const auth = new OfflineAuthProvider({ displayName: 'Steve' });
        const data = decode((await auth.createLoginCredentials(REQUEST)).clientData);

        for (const field of [
            'SkinId',
            'SkinResourcePatch',
            'SkinImageWidth',
            'SkinImageHeight',
            'SkinData',
            'PlayFabId',
            'SkinColor',
            'ArmSize',
            'AnimatedImageData',
            'CapeId',
            'CapeData',
            'CapeImageWidth',
            'CapeImageHeight',
            'SkinGeometryData',
            'SkinAnimationData',
            'PremiumSkin',
            'PersonaSkin',
            'CapeOnClassicSkin'
        ]) {
            expect(data, `missing ${field}`).toHaveProperty(field);
        }

        // Not a persona skin, which is what lets PersonaPieces and PieceTintColors be absent.
        expect(data.PersonaSkin).toBe(false);
        expect(Buffer.from(data.SkinData, 'base64')).toHaveLength(SKIN_WIDTH * SKIN_HEIGHT * 4);
        expect(JSON.parse(Buffer.from(data.SkinResourcePatch, 'base64').toString())).toHaveProperty('geometry');
    });
});

describe('the generated skin', () => {
    it('is a full RGBA sheet, opaque where the model samples it', () => {
        const image = createDefaultSkinImage();

        expect(image).toHaveLength(SKIN_WIDTH * SKIN_HEIGHT * 4);
        // The face, which the head region covers: opaque and not black.
        const face = (8 * SKIN_WIDTH + 8) * 4;
        expect(image[face + 3]).toBe(0xff);
        expect(image[face]! + image[face + 1]! + image[face + 2]!).toBeGreaterThan(0);
        // A corner the geometry never samples stays transparent, as it does on a real sheet.
        expect(image[(60 * SKIN_WIDTH + 60) * 4 + 3]).toBe(0);
    });

    it('is deterministic, so two clients are not accidentally different', () => {
        expect(createDefaultSkinImage().equals(createDefaultSkinImage())).toBe(true);
    });
});
