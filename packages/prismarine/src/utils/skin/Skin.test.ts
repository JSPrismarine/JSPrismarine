import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../../network/NetworkUtil';
import Skin from './Skin';

type ClientData = Parameters<typeof Skin.fromJWT>[0];

const PACK_ID = '12345678-9abc-def0-1122-334455667788';

/** The pack id as gophertunnel's `Writer.UUID` puts it on the wire: both halves reversed. */
const PACK_ID_WIRE = 'f0debc9a785634128877665544332211';

/** The skin fields of a login's client data, as a character-creator skin sends them. */
const clientData = (overrides: Partial<ClientData> = {}): ClientData => ({
    SkinId: 'persona-skin',
    CapeId: '',
    SkinResourcePatch: '',
    PlayFabId: '',
    SkinImageHeight: 1,
    SkinImageWidth: 1,
    SkinGeometryData: '',
    SkinAnimationData: '',
    CapeImageHeight: 0,
    CapeImageWidth: 0,
    CapeOnClassicSkin: false,
    SkinData: Buffer.from([0, 0, 0, 255]).toString('base64'),
    CapeData: '',
    PremiumSkin: false,
    PersonaSkin: true,
    SkinColor: '#b37b62',
    ArmSize: 'slim',
    AnimatedImageData: [],
    PersonaPieces: [
        { IsDefault: true, PackId: PACK_ID, PieceId: 'piece-body', PieceType: 'persona_body', ProductId: '' },
        {
            IsDefault: false,
            PackId: PACK_ID,
            PieceId: 'piece-hand',
            PieceType: 'persona_hand',
            ProductId: 'product-hand'
        }
    ],
    PieceTintColors: [{ PieceType: 'persona_eyes', Colors: ['#ffa12722', '#ff2f1f0f', '#ff3aafd9', '#0'] }],
    ...overrides
});

const readImage = (stream: BinaryStream) => {
    const width = stream.readUnsignedIntLE();
    const height = stream.readUnsignedIntLE();
    const data = stream.read(stream.readUnsignedVarInt());
    return { width, height, data };
};

/**
 * Reads a skin back the way a client of protocol 2193 does, from gophertunnel's
 * `protocol/skin.go`. Written by hand rather than with a decoder of the skin's own, so that
 * the layout is pinned to the protocol and not to the writer. Colors and pack ids come back
 * as hex, so a test asserts the bytes on the wire rather than a decoder's reading of them.
 */
const readBack = (skin: Skin) => {
    const written = new BinaryStream();
    skin.networkSerialize(written);

    const stream = new BinaryStream(written.getBuffer());
    const hex = (length: number) => stream.read(length).toString('hex');

    const id = NetworkUtil.readString(stream);
    const playFabId = NetworkUtil.readString(stream);
    const resourcePatch = NetworkUtil.readString(stream);
    const image = readImage(stream);

    const animations = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        animations.push({
            image: readImage(stream),
            type: stream.readUnsignedVarInt(),
            frames: stream.readFloatLE(),
            expression: stream.readUnsignedVarInt()
        });
    }

    const cape = readImage(stream);
    const geometry = NetworkUtil.readString(stream);
    const geometryVersion = NetworkUtil.readString(stream);
    const animationData = NetworkUtil.readString(stream);
    const capeId = NetworkUtil.readString(stream);
    const fullId = NetworkUtil.readString(stream);
    const armSize = stream.readByte();
    const color = hex(4);

    const pieces = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        pieces.push({
            id: NetworkUtil.readString(stream),
            type: stream.readUnsignedIntLE(),
            packId: hex(16),
            isDefault: stream.readBoolean(),
            productId: NetworkUtil.readString(stream)
        });
    }

    const tints = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        tints.push({
            type: NetworkUtil.readString(stream),
            colors: [hex(4), hex(4), hex(4), hex(4)]
        });
    }

    const premium = stream.readBoolean();
    const persona = stream.readBoolean();
    const capeOnClassicSkin = stream.readBoolean();
    const primaryUser = stream.readBoolean();
    const overrideAppearance = stream.readBoolean();
    const trusted = NetworkUtil.readString(stream);
    const profileHash = NetworkUtil.readString(stream);

    expect(stream.feof()).toBe(true);
    return {
        id,
        playFabId,
        resourcePatch,
        image,
        animations,
        cape,
        geometry,
        geometryVersion,
        animationData,
        capeId,
        fullId,
        armSize,
        color,
        pieces,
        tints,
        premium,
        persona,
        capeOnClassicSkin,
        primaryUser,
        overrideAppearance,
        trusted,
        profileHash
    };
};

describe('utils', () => {
    describe('skin', () => {
        describe('Skin', () => {
            it('writes persona pieces and tints in the 2193 layout', () => {
                const skin = readBack(Skin.fromJWT(clientData()));

                expect(skin.persona).toBe(true);
                expect(skin.armSize).toBe(0);
                // `#b37b62` is opaque, and goes out B, G, R, A.
                expect(skin.color).toBe('627bb3ff');

                // The type is a 32-bit id (`body` 2, `hands` 9) and the pack id 16 bytes.
                expect(skin.pieces).toEqual([
                    { id: 'piece-body', type: 2, packId: PACK_ID_WIRE, isDefault: true, productId: '' },
                    { id: 'piece-hand', type: 9, packId: PACK_ID_WIRE, isDefault: false, productId: 'product-hand' }
                ]);

                // The tint names the piece by its short wire name and carries four colors,
                // `#aarrggbb` in the client data and B, G, R, A on the wire, with no count.
                expect(skin.tints).toEqual([
                    { type: 'eyes', colors: ['2227a1ff', '0f1f2fff', 'd9af3aff', '00000000'] }
                ]);
            });

            it('pads a tint to four colors and cuts one to four', () => {
                const skin = readBack(
                    Skin.fromJWT(
                        clientData({
                            PieceTintColors: [
                                { PieceType: 'persona_mouth', Colors: ['#ff112233'] },
                                {
                                    PieceType: 'persona_hair',
                                    Colors: ['#ff000001', '#ff000002', '#ff000003', '#ff000004', '#ff000005']
                                }
                            ]
                        })
                    )
                );

                expect(skin.tints).toEqual([
                    { type: 'mouth', colors: ['332211ff', '00000000', '00000000', '00000000'] },
                    { type: 'hair', colors: ['010000ff', '020000ff', '030000ff', '040000ff'] }
                ]);
            });

            it('sends a piece type it does not know as unknown and a bad pack id as zeroes', () => {
                const skin = readBack(
                    Skin.fromJWT(
                        clientData({
                            PersonaPieces: [
                                {
                                    IsDefault: false,
                                    PackId: '',
                                    PieceId: 'piece-new',
                                    PieceType: 'persona_something_new',
                                    ProductId: ''
                                }
                            ]
                        })
                    )
                );

                expect(skin.pieces).toEqual([
                    { id: 'piece-new', type: 0, packId: '00'.repeat(16), isDefault: false, productId: '' }
                ]);
            });

            it('writes empty piece and tint lists for a classic skin', () => {
                const skin = readBack(
                    Skin.fromJWT(
                        clientData({ PersonaSkin: false, SkinColor: '#0', PersonaPieces: [], PieceTintColors: [] })
                    )
                );

                expect(skin.persona).toBe(false);
                expect(skin.color).toBe('00000000');
                expect(skin.pieces).toEqual([]);
                expect(skin.tints).toEqual([]);
                expect(skin.trusted).toBe('false');
                expect(skin.profileHash).toBe('');
            });
        });
    });
});
