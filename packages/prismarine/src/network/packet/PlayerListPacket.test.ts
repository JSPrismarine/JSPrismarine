import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import UUID from '../../utils/UUID';
import Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from './PlayerListPacket';

const PLAYER_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

/** A character-creator skin, the kind whose pieces and tints the list has to carry. */
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
        ArmSize: 'wide',
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
        PieceTintColors: [{ PieceType: 'persona_hand', Colors: ['#ffa12722', '#0', '#0', '#0'] }]
    });

const serialize = (skin: Skin): Buffer => {
    const stream = new BinaryStream();
    skin.networkSerialize(stream);
    return stream.getBuffer();
};

const encode = (packet: PlayerListPacket): BinaryStream => {
    packet.encode();
    const stream = new BinaryStream(packet.getBuffer());
    expect(stream.readUnsignedVarInt()).toBe(Identifiers.PlayerListPacket); // Header.
    return stream;
};

describe('network', () => {
    describe('packet', () => {
        describe('PlayerListPacket', () => {
            it('frames an added entry around its skin the way 2193 reads it', () => {
                const skin = personaSkin();
                const packet = new PlayerListPacket();
                packet.type = PlayerListAction.TYPE_ADD;
                packet.entries.push(
                    new PlayerListEntry({
                        uuid: UUID.fromString(PLAYER_UUID),
                        runtimeId: 7n,
                        name: 'Steve',
                        xuid: '2535400000000000',
                        platformChatId: '',
                        buildPlatform: 1,
                        skin,
                        isTeacher: false,
                        isHost: false
                    })
                );

                // Read back from gophertunnel's `packet/player_list.go` and `protocol/skin.go`.
                // The skin itself is pinned byte for byte by `Skin.test.ts`; this checks that
                // the entry's own fields sit exactly where the client expects around it.
                const stream = encode(packet);
                expect(stream.readUnsignedVarInt()).toBe(1); // Entries.
                expect(stream.readUnsignedVarInt()).toBe(1); // `Add` selects 1.
                expect(stream.readByte()).toBe(PlayerListAction.TYPE_ADD);
                expect(UUID.networkDeserialize(stream).toString()).toBe(PLAYER_UUID);
                expect(stream.readVarLong()).toBe(7n);
                expect(NetworkUtil.readString(stream)).toBe('Steve');
                expect(NetworkUtil.readString(stream)).toBe('2535400000000000');
                expect(NetworkUtil.readString(stream)).toBe('');
                expect(stream.readIntLE()).toBe(1);

                const skinBytes = serialize(skin);
                expect(stream.read(skinBytes.byteLength).equals(skinBytes)).toBe(true);

                expect(stream.readBoolean()).toBe(false); // Teacher.
                expect(stream.readBoolean()).toBe(false); // Host.
                expect(stream.readBoolean()).toBe(false); // Sub client.
                expect(stream.read(4).toString('hex')).toBe('ffffffff'); // Name color.
                expect(stream.feof()).toBe(true);
            });

            it('writes only the uuid for a removed entry', () => {
                const packet = new PlayerListPacket();
                packet.type = PlayerListAction.TYPE_REMOVE;
                packet.entries.push(new PlayerListEntry({ uuid: UUID.fromString(PLAYER_UUID) }));

                const stream = encode(packet);
                expect(stream.readUnsignedVarInt()).toBe(1); // Entries.
                expect(stream.readUnsignedVarInt()).toBe(0); // `Remove` selects 0.
                expect(stream.readByte()).toBe(PlayerListAction.TYPE_REMOVE);
                expect(UUID.networkDeserialize(stream).toString()).toBe(PLAYER_UUID);
                expect(stream.feof()).toBe(true);
            });
        });
    });
});
