import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import UUID from '../../utils/UUID';
import Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
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
                    Buffer.from([Identifiers.PlayerSkinPacket]), // Header.
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

            it('encodes what it decodes', () => {
                const packet = new PlayerSkinPacket();
                packet.uuid = UUID.fromString(PLAYER_UUID);
                packet.skin = personaSkin();
                packet.newSkinName = 'New';
                packet.oldSkinName = 'Old';
                packet.encode();

                expect(packet.getBuffer().subarray(0, 1 + PLAYER_UUID_WIRE.byteLength)).toEqual(
                    Buffer.concat([Buffer.from([Identifiers.PlayerSkinPacket]), PLAYER_UUID_WIRE])
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
