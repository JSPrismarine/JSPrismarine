import { createSigner } from 'fast-jwt';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { protocolVersion } from '@jsprismarine/protocol/wire/versions/v2193';
import { parseLoginIdentity } from './LoginIdentity';

import type { Login } from '@jsprismarine/protocol/packet/LoginPacket';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const KEY = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const sign = createSigner({
    algorithm: 'ES384',
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    noTimestamp: true
});

/** The client data every login carries, with only the fields this parser reads filled in. */
const clientData = (overrides: Record<string, unknown> = {}) =>
    sign({
        DeviceId: '00000000-0000-0000-0000-000000000000',
        DeviceOS: 7,
        DeviceModel: 'test',
        CurrentInputMode: 1,
        GuiScale: 0,
        ClientRandomId: 1,
        ServerAddress: 'localhost',
        LanguageCode: 'en_US',
        SelfSignedId: '11111111-2222-3333-4444-555555555555',
        ThirdPartyName: 'Steve',
        SkinId: 'test',
        SkinData: '',
        SkinImageWidth: 0,
        SkinImageHeight: 0,
        SkinResourcePatch: '',
        SkinGeometryData: '',
        SkinAnimationData: '',
        SkinColor: '#0',
        ArmSize: 'wide',
        PlayFabId: '',
        AnimatedImageData: [],
        CapeId: '',
        CapeData: '',
        CapeImageWidth: 0,
        CapeImageHeight: 0,
        PremiumSkin: false,
        PersonaSkin: false,
        CapeOnClassicSkin: false,
        PersonaPieces: [],
        PieceTintColors: [],
        ...overrides
    });

/** A Login body as the Protocol packet decodes it, without interpreting its JWT fields. */
const login = (chain: unknown, data: string): Login => ({
    protocolVersion,
    chainData: JSON.stringify(chain),
    clientData: data
});

/** The chain a 1.26.51 client sends when it is not signed in to Xbox Live. */
const selfSigned = () => ({
    Certificate: JSON.stringify({ chain: [''] }),
    AuthenticationType: 2,
    Token: sign({ cpk: KEY, xid: '', xname: 'Alex', leguuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
});

describe('Login identity parsing', () => {
    it('reads identity from a legacy certificate chain', () => {
        const chain = {
            chain: [
                sign({
                    identityPublicKey: KEY,
                    extraData: {
                        XUID: '123',
                        identity: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                        displayName: 'Alex'
                    }
                })
            ]
        };

        const identity = parseLoginIdentity(login(chain, clientData()));

        expect(identity.displayName).toBe('Alex');
        expect(identity.identity).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        expect(identity.xuid).toBe('123');
    });

    it('reads identity from a multiplayer token', () => {
        const identity = parseLoginIdentity(login(selfSigned(), clientData()));

        expect(identity.displayName).toBe('Alex');
        expect(identity.identity).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    });

    it('falls back to client data when the chain and token do not name the player', () => {
        const chain = {
            Certificate: JSON.stringify({ chain: [''] }),
            AuthenticationType: 2,
            Token: sign({ cpk: KEY, xid: '', xname: '' })
        };

        const identity = parseLoginIdentity(login(chain, clientData()));

        expect(identity.displayName).toBe('Steve');
        expect(identity.identity).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('derives a stable identity UUID from the XUID when the token has no uuid', () => {
        const chain = {
            Certificate: JSON.stringify({ chain: [''] }),
            AuthenticationType: 0,
            Token: sign({ cpk: KEY, xid: '2535428286950384', xname: 'Alex' })
        };

        const identity = parseLoginIdentity(login(chain, clientData()));
        const repeated = parseLoginIdentity(login(chain, clientData()));

        expect(identity.xuid).toBe('2535428286950384');
        expect(identity.displayName).toBe('Alex');
        expect(identity.identity).toMatch(/^[\da-f]{8}-[\da-f]{4}-3[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
        expect(repeated.identity).toBe(identity.identity);
        expect(identity.identity).not.toBe('11111111-2222-3333-4444-555555555555');
    });

    it('does not let an empty token erase identity from the certificate chain', () => {
        const chain = {
            Certificate: JSON.stringify({
                chain: [
                    sign({
                        identityPublicKey: KEY,
                        extraData: {
                            XUID: '123',
                            identity: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                            displayName: 'Alex'
                        }
                    })
                ]
            }),
            AuthenticationType: 0,
            Token: sign({ cpk: KEY })
        };

        const identity = parseLoginIdentity(login(chain, clientData()));

        expect(identity.xuid).toBe('123');
        expect(identity.displayName).toBe('Alex');
    });

    it('reads the envelope authentication type and defaults the legacy shape to Xbox Live', () => {
        expect(parseLoginIdentity(login(selfSigned(), clientData())).authenticationType).toBe(2);

        const legacy = { chain: [sign({ identityPublicKey: KEY })] };
        expect(parseLoginIdentity(login(legacy, clientData())).authenticationType).toBe(0);
    });

    it('reads device and client fields alongside the skin', () => {
        const identity = parseLoginIdentity(login({ chain: [] }, clientData()));

        expect(identity.clientRandomId).toBe(1);
        expect(identity.serverAddress).toBe('localhost');
        expect(identity.languageCode).toBe('en_US');
        expect(identity.device.id).toBe('00000000-0000-0000-0000-000000000000');
        expect(identity.skin.getId()).toBe('test');
    });
});
