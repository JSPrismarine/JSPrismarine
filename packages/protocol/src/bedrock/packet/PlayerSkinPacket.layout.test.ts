import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import Skin, { SKIN_WIRE_2193, SKIN_WIRE_2225 } from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import PlayerSkinPacket from './PlayerSkinPacket';
import { playerListPacket } from '@jsprismarine/protocol/bedrock/wire/definitions/playerList';
import { playerSkinPacket } from '@jsprismarine/protocol/bedrock/wire/definitions/playerSkin';
import { capture } from '../../testing/evidence.test.helper';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class wrote the same
 * fields with the skin one string shorter: `SerializedSkin` lost its own PlayFab id at
 * ordinal 1, between the skin id and the resource patch.
 */
describe('the declarative PlayerSkin layout against the packet class it replaces', () => {
    const PLAYFAB_ID = 'PFID-abc123';

    const skin = () =>
        Skin.fromJWT({
            SkinId: 'classic-skin',
            CapeId: '',
            SkinResourcePatch: '',
            PlayFabId: PLAYFAB_ID,
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
            PersonaSkin: false,
            SkinColor: '#0',
            ArmSize: 'wide',
            AnimatedImageData: [],
            PersonaPieces: [],
            PieceTintColors: []
        });

    const fill = (packet: PlayerSkinPacket): PlayerSkinPacket => {
        packet.uuid = UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
        packet.skin = skin();
        packet.newSkinName = 'new';
        packet.oldSkinName = 'old';
        return packet;
    };

    const payload = () => ({
        uuid: UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'),
        skinCarryingPlayFabId: skin(),
        skinWithoutPlayFabId: skin(),
        newSkinName: 'new',
        oldSkinName: 'old'
    });

    it('matches the 2193 class byte for byte', () => {
        const classPacket = fill(new PlayerSkinPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(playerSkinPacket, 2193).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the class stamped 2225 byte for byte', () => {
        const classPacket = fill(new PlayerSkinPacket());
        classPacket.codecProtocol = 2225;
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(playerSkinPacket, 2225).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('removes exactly the PlayFab id string from inside the skin at 2225', () => {
        const base = new BinaryStream();
        layoutAt(playerSkinPacket, 2193).encode(base, payload());

        const slim = new BinaryStream();
        layoutAt(playerSkinPacket, 2225).encode(slim, payload());

        // UUID (16 bytes), then the skin id string, then - at 2193 only - the PlayFab id as
        // a varint length and its bytes. Everything after it is unchanged.
        const cut = 16 + 1 + 'classic-skin'.length;
        const removed = Buffer.concat([Buffer.from([PLAYFAB_ID.length]), Buffer.from(PLAYFAB_ID, 'utf8')]);
        expect(base.getBuffer().subarray(cut, cut + removed.byteLength)).toEqual(removed);
        expect(slim.getBuffer()).toEqual(
            Buffer.concat([base.getBuffer().subarray(0, cut), base.getBuffer().subarray(cut + removed.byteLength)])
        );
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(new PlayerSkinPacket());
        classPacket.encodePayload();

        const read = layoutAt(playerSkinPacket, 2193).decode(new BinaryStream(classPacket.getBuffer()));
        expect(read.skinCarryingPlayFabId!.getPlayFabId()).toBe(PLAYFAB_ID);
        expect(read.skinWithoutPlayFabId).toBeNull();
        expect(read.newSkinName).toBe('new');
        expect(read.oldSkinName).toBe('old');
        expect(read.uuid.toString()).toBe('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
    });
});

/**
 * `0x3f.bin` is a `PlayerListPacket` a real Bedrock Dedicated Server sent at each protocol, and
 * its one entry carries a `SerializedSkin`. That skin is the same structure `PlayerSkinPacket`
 * carries, so it proves the skin bytes at each version. The geometry travels as a plain string
 * at 2193 too, where the 1.26.50 page types it `Json::Value`.
 */
describe('the skin a real server sent in a player list', () => {
    for (const protocolVersion of [2193, 2225]) {
        it(`puts the captured skin back on the wire byte for byte at ${protocolVersion}`, () => {
            const captured = capture(protocolVersion, 0x3f);
            const list = layoutAt(playerListPacket, protocolVersion).decode(new BinaryStream(captured));
            const body = list.bodyWithPlayFabIdInSkin ?? list.bodyWithPlayFabIdOnEntry;
            const skin = body!.entries[0]!.getSkin()!;

            const packet = new PlayerSkinPacket();
            packet.codecProtocol = protocolVersion;
            packet.uuid = body!.entries[0]!.getUUID();
            packet.skin = skin;
            packet.newSkinName = 'new';
            packet.oldSkinName = 'old';
            packet.encodePayload();

            const skinBytes = packet
                .getBuffer()
                .subarray(16, packet.getBuffer().length - ('new'.length + 'old'.length + 2));
            expect(captured.includes(skinBytes)).toBe(true);

            const decoded = new PlayerSkinPacket(packet.getBuffer());
            decoded.codecProtocol = protocolVersion;
            decoded.decodePayload();
            expect(decoded.skin.getId()).toBe(skin.getId());
            expect(decoded.skin.getGeometry()).toBe(skin.getGeometry());

            const again = new PlayerSkinPacket();
            again.codecProtocol = protocolVersion;
            Object.assign(again, { uuid: decoded.uuid, skin: decoded.skin, newSkinName: 'new', oldSkinName: 'old' });
            again.encodePayload();
            expect(again.getBuffer()).toEqual(packet.getBuffer());
        });
    }
});

/**
 * `persona::PieceType` gained `CoCo` at 28 in 1.26.60, which moves `Unsupported` to 29. Both
 * pages and the docs changelog say so; no capture carries a persona piece.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/persona-piece-type/
 */
describe('persona piece type numbering across the 2225 renumbering', () => {
    const skinWithPieces = (types: string[]): Skin =>
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
            SkinColor: '#0',
            ArmSize: 'wide',
            AnimatedImageData: [],
            PersonaPieces: types.map((PieceType, index) => ({
                IsDefault: false,
                PackId: '',
                PieceId: `piece-${index}`,
                PieceType,
                ProductId: ''
            })),
            PieceTintColors: types.map((PieceType) => ({ PieceType, Colors: [] }))
        });

    /** The piece types a packet's skin reads back as after crossing the wire at one protocol. */
    const readBackTypes = (protocolVersion: number, types: string[]): string[] => {
        const packet = new PlayerSkinPacket();
        packet.codecProtocol = protocolVersion;
        packet.uuid = UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
        packet.skin = skinWithPieces(types);
        packet.newSkinName = '';
        packet.oldSkinName = '';
        packet.encodePayload();

        const read = layoutAt(playerSkinPacket, protocolVersion).decode(new BinaryStream(packet.getBuffer()));
        const skin = read.skinCarryingPlayFabId ?? read.skinWithoutPlayFabId!;
        return [...skin.getPersonaData().getPieces()].map((piece) => piece.getPieceType());
    };

    it('numbers Unsupported as 28 at 2193 and does not know CoCo', () => {
        expect(SKIN_WIRE_2193.pieceTypeNames[28]).toBe('Unsupported');
        expect(SKIN_WIRE_2193.pieceTypeNames).toHaveLength(29);
        expect(readBackTypes(2193, ['persona_unsupported', 'persona_coco'])).toEqual(['unsupported', 'unknown']);
    });

    it('numbers CoCo as 28 and Unsupported as 29 at 2225', () => {
        expect(SKIN_WIRE_2225.pieceTypeNames[28]).toBe('CoCo');
        expect(SKIN_WIRE_2225.pieceTypeNames[29]).toBe('Unsupported');
        expect(readBackTypes(2225, ['persona_unsupported', 'persona_coco'])).toEqual(['unsupported', 'coco']);
    });

    it('keeps the members below 28 in place at both versions', () => {
        for (const layout of [SKIN_WIRE_2193, SKIN_WIRE_2225]) {
            expect(layout.pieceTypeNames[27]).toBe('Emote');
            expect(layout.pieceTypeNames[2]).toBe('Body');
        }
    });
});
