import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import { PacketIdentifier } from '../PacketIdentifier';
import PlayerSkinPacket from './PlayerSkinPacket';

const PLAYER_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

/**
 * `PLAYER_UUID` as `mce::UUID` goes on the wire: the most significant half first, then the
 * least, each half as two little-endian 32-bit words with the words swapped.
 */
const PLAYER_UUID_WIRE = Buffer.from([
    0x78, 0x69, 0x5a, 0x4b, 0x3c, 0x2d, 0x1e, 0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87
]);

/** A character-creator skin, whose pieces and tints the packet has to carry. */
const personaSkin = () =>
    Skin.fromJWT({
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
            {
                IsDefault: true,
                PackId: '12345678-9abc-def0-1122-334455667788',
                PieceId: 'piece-body',
                PieceType: 'persona_body',
                ProductId: ''
            }
        ],
        PieceTintColors: [{ PieceType: 'persona_eyes', Colors: ['#ffa12722', '#0', '#0', '#0'] }]
    });

const serialize = (skin: Skin): Buffer => {
    const stream = new BinaryStream();
    skin.networkSerialize(stream);
    return stream.getBuffer();
};

describe('network', () => {
    describe('packet', () => {
        describe('PlayerSkinPacket', () => {
            it('decodes the UUID, the skin, and the two localized names, consuming the buffer', () => {
                // Wire order from the docs: UUID, Serialized Skin, Localized New Skin Name,
                // Localized Old Skin Name. The skin's own bytes are pinned by `Skin.test.ts`.
                const skin = personaSkin();
                const buffer = Buffer.concat([
                    Buffer.from([PacketIdentifier.PLAYER_SKIN]), // Header.
                    PLAYER_UUID_WIRE,
                    serialize(skin),
                    Buffer.from([0x03, 0x4e, 0x65, 0x77]), // "New"
                    Buffer.from([0x03, 0x4f, 0x6c, 0x64]) // "Old"
                ]);

                const packet = new PlayerSkinPacket(buffer);
                packet.decode();

                expect(packet.uuid.toString()).toBe(PLAYER_UUID);
                expect(packet.skin.getId()).toBe('persona-skin');
                expect(packet.skin.isPersona()).toBe(true);
                expect(packet.skin.getArmSize()).toBe('slim');
                expect(packet.skin.getColor()).toBe('#ffb37b62');
                expect([...packet.skin.getPersonaData().getPieces()].map((piece) => piece.getPieceId())).toEqual([
                    'piece-body'
                ]);
                expect([...packet.skin.getPersonaData().getTintColors()].map((tint) => tint.getPieceType())).toEqual([
                    'eyes'
                ]);
                expect(packet.skin.isTrusted).toBe(false);
                expect(serialize(packet.skin)).toEqual(serialize(skin));
                expect(packet.newSkinName).toBe('New');
                expect(packet.oldSkinName).toBe('Old');
                expect(packet.feof()).toBe(true);
            });

            it('decodes a hand-written classic skin and writes it back with the server trusted flag', () => {
                // Every `SerializedSkin` field in docs order, by hand, so the layout is pinned to
                // the protocol and not to the writer.
                const trustedFlag = [0x04, 0x54, 0x72, 0x75, 0x65]; // TrustedSkinFlag "True".
                const bytes = Buffer.from([
                    PacketIdentifier.PLAYER_SKIN, // Header.
                    ...PLAYER_UUID_WIRE, // UUID.
                    0x01,
                    0x73, // ID "s".
                    0x00, // PlayFabID "".
                    0x00, // ResourcePatch "".
                    0x01,
                    0x00,
                    0x00,
                    0x00,
                    0x01,
                    0x00,
                    0x00,
                    0x00,
                    0x04,
                    0x11,
                    0x22,
                    0x33,
                    0x44, // ImageData: 1x1, four bytes.
                    0x00, // AnimatedImageData: none.
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00, // CapeImageData: 0x0, no bytes.
                    0x02,
                    0x7b,
                    0x7d, // GeometryData "{}".
                    0x03,
                    0x31,
                    0x2e,
                    0x30, // GeometryDataMinEngineVersion "1.0".
                    0x00, // AnimationData "".
                    0x00, // CapeID "".
                    0x01,
                    0x73, // FullID "s".
                    0x00, // ArmSize: Slim.
                    0x62,
                    0x7b,
                    0xb3,
                    0xff, // SkinColor: ARGB 0xffb37b62, little-endian.
                    0x00, // PersonaPieces: none.
                    0x00, // PieceTintColors: none.
                    0x01,
                    0x00,
                    0x00,
                    0x01,
                    0x01, // IsPremium, IsPersona, IsPersonaCapeOnClassicSkin, IsPrimaryUser, OverridesPlayerAppearance.
                    ...trustedFlag,
                    0x01,
                    0x68, // ProfileHash "h".
                    0x03,
                    0x4e,
                    0x65,
                    0x77, // Localized New Skin Name "New".
                    0x03,
                    0x4f,
                    0x6c,
                    0x64 // Localized Old Skin Name "Old".
                ]);

                const packet = new PlayerSkinPacket(bytes);
                packet.decode();

                expect(packet.feof()).toBe(true);
                expect(packet.uuid.toString()).toBe(PLAYER_UUID);
                const skin = packet.skin;
                expect(skin.getId()).toBe('s');
                expect(skin.getPlayFabId()).toBe('');
                expect(skin.getResourcePatch()).toBe('');
                expect(skin.getImage().width).toBe(1);
                expect(skin.getImage().height).toBe(1);
                expect(skin.getImage().data).toEqual(Buffer.from([0x11, 0x22, 0x33, 0x44]));
                expect(skin.getAnimations().size).toBe(0);
                expect(skin.getCape().getImage().width).toBe(0);
                expect(skin.getCape().getImage().data.byteLength).toBe(0);
                expect(skin.getGeometry()).toBe('{}');
                expect(skin.getGeometryDataEngineVersion()).toBe('1.0');
                expect(skin.getAnimationData()).toBe('');
                expect(skin.getCape().getId()).toBe('');
                expect(skin.getFullId()).toBe('s');
                expect(skin.getArmSize()).toBe('slim');
                expect(skin.getColor()).toBe('#ffb37b62');
                expect(skin.isPremium()).toBe(true);
                expect(skin.isPersona()).toBe(false);
                expect(skin.isCapeOnClassicSkin()).toBe(false);
                expect(skin.isPrimaryUser()).toBe(true);
                expect(skin.overridesAppearance()).toBe(true);
                expect(skin.isTrusted).toBe(true);
                expect(skin.getProfileHash()).toBe('h');
                expect(packet.newSkinName).toBe('New');
                expect(packet.oldSkinName).toBe('Old');

                // Written back by the server, the same bytes apart from the trusted flag: the
                // server vouches for no skin, whatever the client claimed.
                const relay = new PlayerSkinPacket();
                relay.uuid = packet.uuid;
                relay.skin = skin;
                relay.newSkinName = packet.newSkinName;
                relay.oldSkinName = packet.oldSkinName;
                relay.encode();

                const trustedAt = bytes.indexOf(Buffer.from(trustedFlag));
                expect(relay.getBuffer()).toEqual(
                    Buffer.concat([
                        bytes.subarray(0, trustedAt),
                        Buffer.from([0x05, 0x66, 0x61, 0x6c, 0x73, 0x65]), // TrustedSkinFlag "false".
                        bytes.subarray(trustedAt + trustedFlag.length)
                    ])
                );
            });

            it('encodes what it decodes', () => {
                const packet = new PlayerSkinPacket();
                packet.uuid = UUID.fromString(PLAYER_UUID);
                packet.skin = personaSkin();
                packet.newSkinName = 'New';
                packet.oldSkinName = 'Old';
                packet.encode();

                expect(packet.getBuffer().subarray(0, 1 + PLAYER_UUID_WIRE.byteLength)).toEqual(
                    Buffer.concat([Buffer.from([PacketIdentifier.PLAYER_SKIN]), PLAYER_UUID_WIRE])
                );

                const decoded = new PlayerSkinPacket(packet.getBuffer());
                decoded.decode();

                expect(decoded.uuid.equals(packet.uuid)).toBe(true);
                expect(serialize(decoded.skin)).toEqual(serialize(packet.skin));
                expect(decoded.newSkinName).toBe('New');
                expect(decoded.oldSkinName).toBe('Old');
                expect(decoded.feof()).toBe(true);
            });
        });
    });
});
