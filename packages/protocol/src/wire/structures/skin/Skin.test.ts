import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../../networkUtil';
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

/**
 * Writes a skin, reads it back with `Skin.networkDeserialize`, and writes the reading again.
 * The second writing must equal the first byte for byte, which pins the reader to the writer
 * that `readBack` pins to the protocol.
 */
const roundTrip = (skin: Skin) => {
    const written = new BinaryStream();
    skin.networkSerialize(written);

    const stream = new BinaryStream(written.getBuffer());
    const read = Skin.networkDeserialize(stream);
    expect(stream.feof()).toBe(true);

    const rewritten = new BinaryStream();
    read.networkSerialize(rewritten);
    expect(rewritten.getBuffer()).toEqual(written.getBuffer());
    return read;
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

            it('keys a tint by the lower-case enum member name, not the client data spelling', () => {
                // A 1.26.51 client with a bearded character-creator skin closed the connection
                // on the player list: its `persona_facial_hair` tint went out as `facial_hair`,
                // and the enum member is `FacialHair`. Cereal writes string enums in lower case
                // with the member's own spelling, so `High_Pants` keeps its underscore.
                const skin = readBack(
                    Skin.fromJWT(
                        clientData({
                            PersonaPieces: [
                                {
                                    IsDefault: false,
                                    PackId: PACK_ID,
                                    PieceId: 'piece-beard',
                                    PieceType: 'persona_facial_hair',
                                    ProductId: ''
                                },
                                {
                                    IsDefault: false,
                                    PackId: PACK_ID,
                                    PieceId: 'piece-glasses',
                                    PieceType: 'persona_face_accessory',
                                    ProductId: ''
                                }
                            ],
                            PieceTintColors: [
                                { PieceType: 'persona_facial_hair', Colors: ['#ff0e182e', '#0', '#0', '#0'] },
                                { PieceType: 'persona_high_pants', Colors: ['#0', '#0', '#0', '#0'] }
                            ]
                        })
                    )
                );

                expect(skin.pieces.map((piece) => piece.type)).toEqual([11, 17]);
                expect(skin.tints.map((tint) => tint.type)).toEqual(['facialhair', 'high_pants']);
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

            it('reads a persona skin back to the same bytes', () => {
                const skin = roundTrip(Skin.fromJWT(clientData()));

                expect(skin.getId()).toBe('persona-skin');
                expect(skin.isPersona()).toBe(true);
                expect(skin.getArmSize()).toBe('slim');
                // The opaque `#b37b62` of the client data comes back with its alpha spelled out.
                expect(skin.getColor()).toBe('#ffb37b62');

                // Pieces keep their wire type names and their pack id as a UUID string.
                expect(
                    [...skin.getPersonaData().getPieces()].map((piece) => ({
                        id: piece.getPieceId(),
                        type: piece.getPieceType(),
                        packId: piece.getPackId(),
                        isDefault: piece.isDefault(),
                        productId: piece.getProductId()
                    }))
                ).toEqual([
                    { id: 'piece-body', type: 'body', packId: PACK_ID, isDefault: true, productId: '' },
                    { id: 'piece-hand', type: 'hands', packId: PACK_ID, isDefault: false, productId: 'product-hand' }
                ]);
                expect(
                    [...skin.getPersonaData().getTintColors()].map((tint) => ({
                        type: tint.getPieceType(),
                        colors: tint.getColors()
                    }))
                ).toEqual([{ type: 'eyes', colors: ['#ffa12722', '#ff2f1f0f', '#ff3aafd9', '#00000000'] }]);

                expect(skin.isPremium()).toBe(false);
                expect(skin.isCapeOnClassicSkin()).toBe(false);
                expect(skin.isPrimaryUser()).toBe(false);
                expect(skin.overridesAppearance()).toBe(true);
                expect(skin.isTrusted).toBe(false);
                expect(skin.getProfileHash()).toBe('');
            });

            it('reads a classic skin with an animation and a cape back to the same bytes', () => {
                const pixel = Buffer.from([1, 2, 3, 255]);
                const skin = roundTrip(
                    Skin.fromJWT(
                        clientData({
                            SkinId: 'classic-skin',
                            PersonaSkin: false,
                            SkinColor: '#0',
                            ArmSize: 'wide',
                            PersonaPieces: [],
                            PieceTintColors: [],
                            CapeId: 'cape-id',
                            CapeImageWidth: 1,
                            CapeImageHeight: 1,
                            CapeData: pixel.toString('base64'),
                            SkinGeometryData: Buffer.from('{"format_version":"1.12.0"}').toString('base64'),
                            SkinAnimationData: Buffer.from('anim').toString('base64'),
                            AnimatedImageData: [
                                {
                                    ImageWidth: 1,
                                    ImageHeight: 1,
                                    Image: pixel.toString('base64'),
                                    Frames: 2.5,
                                    Type: 1,
                                    AnimationExpression: 1
                                }
                            ]
                        })
                    )
                );

                expect(skin.getId()).toBe('classic-skin');
                expect(skin.getFullId()).toBe('classic-skincape-id');
                expect(skin.isPersona()).toBe(false);
                expect(skin.getArmSize()).toBe('wide');
                expect(skin.getColor()).toBe('#00000000');
                expect(skin.getImage().data).toEqual(Buffer.from([0, 0, 0, 255]));
                expect(skin.getGeometry()).toBe('{"format_version":"1.12.0"}');
                expect(skin.getGeometryDataEngineVersion()).toBe('0.0.0');
                expect(skin.getAnimationData()).toBe('anim');
                expect(skin.getCape().getId()).toBe('cape-id');
                expect(skin.getCape().getImage().data).toEqual(pixel);

                const [animation] = skin.getAnimations();
                expect(animation?.getImage().data).toEqual(pixel);
                expect(animation?.getType()).toBe(1);
                expect(animation?.getFrames()).toBe(2.5);
                expect(animation?.getExpression()).toBe(1);
            });

            it('reads the trusted flag case-insensitively and keeps the profile hash', () => {
                // The writer always ends a skin with `"false"` and an empty profile hash: six
                // bytes and one byte. A client may spell the flag `True`, as the docs do.
                const written = new BinaryStream();
                Skin.fromJWT(clientData()).networkSerialize(written);
                const tail = new BinaryStream();
                NetworkUtil.writeString(tail, 'True');
                NetworkUtil.writeString(tail, 'profile-hash');
                const stream = new BinaryStream(Buffer.concat([written.getBuffer().subarray(0, -7), tail.getBuffer()]));

                const skin = Skin.networkDeserialize(stream);

                expect(stream.feof()).toBe(true);
                expect(skin.isTrusted).toBe(true);
                expect(skin.getProfileHash()).toBe('profile-hash');
            });
        });
    });
});
