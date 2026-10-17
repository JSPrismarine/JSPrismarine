import BinaryStream from '@jsprismarine/binaryutils';
import { createSigner } from 'fast-jwt';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import LoginPacket from './LoginPacket';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const KEY = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const sign = createSigner({
    algorithm: 'ES384',
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    noTimestamp: true
});

/** The client data every login carries, with only the fields this reads filled in. */
const clientData = (overrides: Record<string, unknown> = {}) =>
    sign({
        DeviceId: '00000000-0000-0000-0000-000000000000',
        DeviceOS: 7,
        DeviceModel: 'test',
        CurrentInputMode: 1,
        GuiScale: 0,
        SelfSignedId: '11111111-2222-3333-4444-555555555555',
        ThirdPartyName: 'Steve',
        // Everything the skin reader touches. Empty is fine - none of it is what these
        // assert - but absent is not: it decodes each of these from base64.
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

/** A login as it arrives: the protocol, then the two length-prefixed JSON blobs. */
const encode = (chain: unknown, data: string) => {
    const stream = new BinaryStream();
    stream.writeInt(Identifiers.Protocol);

    const body = new BinaryStream();
    NetworkUtil.writeLELengthASCIIString(body, JSON.stringify(chain));
    NetworkUtil.writeLELengthASCIIString(body, data);

    const payload = body.getBuffer();
    stream.writeUnsignedVarInt(payload.byteLength);
    stream.write(payload);

    const packet = new LoginPacket();
    packet.setBuffer(Buffer.concat([Buffer.from([Identifiers.LoginPacket]), stream.getBuffer()]));
    packet.decode();

    return packet;
};

describe('network', () => {
    describe('packet', () => {
        describe('LoginPacket', () => {
            it('reads the identity out of a legacy certificate chain', () => {
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

                const packet = encode(chain, clientData());

                expect(packet.displayName).toBe('Alex');
                expect(packet.identity).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
                expect(packet.XUID).toBe('123');
            });

            it('reads the identity out of a multiplayer token', () => {
                const chain = {
                    Certificate: JSON.stringify({ chain: [''] }),
                    AuthenticationType: 2,
                    Token: sign({ cpk: KEY, xid: '', xname: 'Alex', leguuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
                };

                const packet = encode(chain, clientData());

                expect(packet.displayName).toBe('Alex');
                expect(packet.identity).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
            });

            /**
             * What a real client that is not signed in to Xbox Live actually sends. Nothing
             * names the player anywhere but the client data: the chain holds one empty link and
             * the token has no name to give, because there is no account behind it.
             */
            it('falls back to the client data when nothing else names the player', () => {
                const chain = {
                    Certificate: JSON.stringify({ chain: [''] }),
                    AuthenticationType: 2,
                    Token: sign({ cpk: KEY, xid: '', xname: '' })
                };

                const packet = encode(chain, clientData());

                expect(packet.displayName).toBe('Steve');
                expect(packet.identity).toBe('11111111-2222-3333-4444-555555555555');
            });

            /**
             * What a client signed in to Xbox Live sends on the token format: an XUID and no
             * uuid at all, because the uuid is not a fact to be sent - both ends derive the
             * same one from the XUID.
             */
            it('derives the identity from the XUID when the token sends no uuid', () => {
                const chain = {
                    Certificate: JSON.stringify({ chain: [''] }),
                    AuthenticationType: 0,
                    Token: sign({ cpk: KEY, xid: '2535428286950384', xname: 'Alex' })
                };

                const packet = encode(chain, clientData());

                expect(packet.XUID).toBe('2535428286950384');
                expect(packet.displayName).toBe('Alex');
                // A version 3 uuid, and the same one every other implementation derives.
                expect(packet.identity).toMatch(/^[\da-f]{8}-[\da-f]{4}-3[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
                // Stable: derived, not invented, so it is the same across reconnects.
                expect(encode(chain, clientData()).identity).toBe(packet.identity);
                // And not the id the client made up for itself, which is only for a player
                // with no XUID to derive one from.
                expect(packet.identity).not.toBe('11111111-2222-3333-4444-555555555555');
            });

            /** An authenticated login has both, and the chain is the better source. */
            it('does not let an empty token erase what the chain established', () => {
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

                const packet = encode(chain, clientData());

                expect(packet.XUID).toBe('123');
                expect(packet.displayName).toBe('Alex');
            });
        });
    });
});
