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
        // Everything the skin reader touches. Empty is fine, since none of it is what these
        // assert, but absent is not: it decodes each of these from base64.
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

/**
 * A login as it arrives, built by hand in the docs' order: the packet id, `Client Network
 * Version` as a big endian int32, then `Connection Request` as a varuint length over the two
 * little endian length prefixed strings. `trailing` goes inside the request, after the client
 * data, where a well formed request has nothing. `protocol` is the version the client claims.
 */
const bytes = (chain: unknown, data: string, trailing = Buffer.alloc(0), protocol = Identifiers.Protocol) => {
    const stream = new BinaryStream();
    stream.writeInt(protocol);

    const body = new BinaryStream();
    NetworkUtil.writeLELengthASCIIString(body, JSON.stringify(chain));
    NetworkUtil.writeLELengthASCIIString(body, data);
    body.write(trailing);

    const payload = body.getBuffer();
    stream.writeUnsignedVarInt(payload.byteLength);
    stream.write(payload);

    return Buffer.concat([Buffer.from([Identifiers.LoginPacket]), stream.getBuffer()]);
};

/** The packet decoded from hand-built bytes. */
const decode = (buffer: Buffer) => {
    const packet = new LoginPacket();
    packet.setBuffer(buffer);
    packet.decode();
    return packet;
};

/** The packet decoded from a chain and client data. */
const encode = (chain: unknown, data: string) => decode(bytes(chain, data));

/** The chain a 1.26.51 client sends when it is not signed in to Xbox Live. */
const selfSigned = () => ({
    Certificate: JSON.stringify({ chain: [''] }),
    AuthenticationType: 2,
    Token: sign({ cpk: KEY, xid: '', xname: 'Alex', leguuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
});

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
                const packet = encode(selfSigned(), clientData());

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
             * uuid at all, because the uuid is not a fact to be sent. Both ends derive the
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

            it('reads the authentication type from the envelope', () => {
                expect(encode(selfSigned(), clientData()).authenticationType).toBe(2);
            });

            it('reports authentication type 0 for the bare chain shape, which has none', () => {
                const chain = { chain: [sign({ identityPublicKey: KEY })] };

                expect(encode(chain, clientData()).authenticationType).toBe(0);
            });

            it('keeps the raw chain and client data as they arrived', () => {
                const chain = selfSigned();
                const data = clientData();

                const packet = encode(chain, data);

                expect(packet.chainData).toBe(JSON.stringify(chain));
                expect(packet.clientData).toBe(data);
            });

            it('consumes the packet exactly', () => {
                const packet = encode(selfSigned(), clientData());

                expect(packet.feof()).toBe(true);
            });

            /**
             * The request's length used to be read and dropped, and the two strings read
             * straight from the packet. A request carrying more than its two strings then
             * left the extra bytes where the next packet in the batch would be read from.
             */
            it('rejects a connection request with bytes after the client data', () => {
                const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

                expect(() => decode(bytes(selfSigned(), clientData(), garbage))).toThrow(
                    'The connection request has 4 unread bytes after the client data'
                );
            });

            it('rejects a connection request that claims more bytes than the packet carries', () => {
                const truncated = bytes(selfSigned(), clientData());

                expect(() => decode(truncated.subarray(0, truncated.byteLength - 1))).toThrow();
            });

            /**
             * A client of another version is refused on the version alone, so nothing past the
             * framing is read. Its chain and client data need not have this shape, and a decode
             * error would drop the packet before the handler could send the `PlayStatus` that
             * tells the player to update.
             */
            it('reads only the version and framing from a client of another protocol', () => {
                const older = bytes('not an envelope', 'not a jwt', Buffer.alloc(0), Identifiers.Protocol - 10);

                const packet = decode(older);

                expect(packet.protocol).toBe(Identifiers.Protocol - 10);
                expect(packet.chainData).toBe('"not an envelope"');
                expect(packet.clientData).toBe('not a jwt');
                expect(packet.displayName).toBeUndefined();
                expect(packet.feof()).toBe(true);
            });

            it('encodes a decoded login back to the same bytes', () => {
                const expected = bytes(selfSigned(), clientData());

                const packet = decode(expected);
                packet.encode();

                expect(packet.getBuffer().equals(expected)).toBe(true);
            });

            it('encodes the protocol, chain and client data in the docs order', () => {
                const chain = selfSigned();
                const data = clientData();

                const packet = new LoginPacket();
                packet.protocol = Identifiers.Protocol;
                packet.chainData = JSON.stringify(chain);
                packet.clientData = data;
                packet.encode();

                expect(packet.getBuffer().equals(bytes(chain, data))).toBe(true);
            });
        });
    });
});
