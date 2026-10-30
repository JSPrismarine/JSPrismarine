import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import UUID from '../../utils/UUID';
import Skin from '../../utils/skin/Skin';
import PlayerSkinPacket from './PlayerSkinPacket';
import { playerSkinPacket } from '@jsprismarine/protocol/wire/definitions/playerSkin';

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
