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

/** A classic skin with no persona data and no color of its own. */
const classicSkin = () =>
    Skin.fromJWT({
        SkinId: 'classic-skin',
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
        PersonaSkin: false,
        SkinColor: '#0',
        ArmSize: 'wide',
        AnimatedImageData: [],
        PersonaPieces: [],
        PieceTintColors: []
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

/** Reads one Add entry up to and including its skin, leaving the three booleans next. */
const skipToFlags = (stream: BinaryStream, skin: Skin): void => {
    stream.readUnsignedVarInt(); // Entries.
    stream.readUnsignedVarInt(); // Selector.
    stream.readByte(); // Action.
    UUID.networkDeserialize(stream);
    stream.readVarLong();
    NetworkUtil.readString(stream);
    NetworkUtil.readString(stream);
    NetworkUtil.readString(stream);
    stream.readIntLE();
    stream.read(serialize(skin).byteLength);
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

            it('writes an added entry as the PlayerListAddEntry bytes in docs order', () => {
                const skin = classicSkin();
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
                        isHost: false,
                        color: 0xff112233
                    })
                );
                packet.encode();

                const stream = new BinaryStream(packet.getBuffer());
                const expectBytes = (length: number, hex: string): void => {
                    expect(stream.read(length).toString('hex')).toBe(hex);
                };

                expectBytes(1, '3f'); // Header: packet id 63.
                expectBytes(1, '01'); // Entries: one.
                expectBytes(1, '01'); // Variant selector: Add.
                expectBytes(1, '00'); // Action: Add.
                expectBytes(16, '78695a4b3c2d1e0ff0e1d2c3b4a59687'); // UUID.
                expectBytes(1, '0e'); // Actor Unique ID: 7, ZigZag.
                expectBytes(6, '055374657665'); // Player Name: "Steve".
                expectBytes(17, '1032353335343030303030303030303030'); // XBL XUID.
                expectBytes(1, '00'); // Platform Online ID: empty.
                expectBytes(4, '01000000'); // Build Platform: iOS, little-endian.

                const skinBytes = serialize(skin);
                expect(stream.read(skinBytes.byteLength).equals(skinBytes)).toBe(true); // Serialized Skin.

                expectBytes(3, '000000'); // Is Teacher, Is Host, Is SubClient.
                expectBytes(4, '332211ff'); // Player Color: ARGB 0xff112233, little-endian.
                expect(stream.feof()).toBe(true);
            });

            it('writes a sub client as the third boolean', () => {
                const skin = classicSkin();
                const packet = new PlayerListPacket();
                packet.type = PlayerListAction.TYPE_ADD;
                packet.entries.push(
                    new PlayerListEntry({
                        uuid: UUID.fromString(PLAYER_UUID),
                        skin,
                        isTeacher: false,
                        isHost: false,
                        isSubClient: true
                    })
                );

                const stream = encode(packet);
                skipToFlags(stream, skin);
                expect(stream.readBoolean()).toBe(false); // Is Teacher.
                expect(stream.readBoolean()).toBe(false); // Is Host.
                expect(stream.readBoolean()).toBe(true); // Is SubClient.
                expect(stream.read(4).toString('hex')).toBe('ffffffff'); // Player Color.
                expect(stream.feof()).toBe(true);
            });

            it('refuses to add an entry that has no skin', () => {
                const packet = new PlayerListPacket();
                packet.type = PlayerListAction.TYPE_ADD;
                packet.entries.push(new PlayerListEntry({ uuid: UUID.fromString(PLAYER_UUID), name: 'Steve' }));

                expect(() => packet.encode()).toThrow(PLAYER_UUID);
            });

            it('copies an entry with another skin and leaves the original alone', () => {
                const entry = new PlayerListEntry({
                    uuid: UUID.fromString(PLAYER_UUID),
                    runtimeId: 7n,
                    name: 'Steve',
                    xuid: '2535400000000000',
                    platformChatId: 'chat',
                    buildPlatform: 8,
                    skin: classicSkin(),
                    isTeacher: false,
                    isHost: true,
                    isSubClient: true,
                    color: 0xff112233
                });
                const skin = personaSkin();

                const copy = entry.withSkin(skin);

                expect(copy).not.toBe(entry);
                expect(copy.getSkin()).toBe(skin);
                expect(entry.getSkin()?.getId()).toBe('classic-skin');
                expect(copy.getUUID().equals(entry.getUUID())).toBe(true);
                expect(copy.getRuntimeId()).toBe(7n);
                expect(copy.getName()).toBe('Steve');
                expect(copy.getXUID()).toBe('2535400000000000');
                expect(copy.getPlatformChatId()).toBe('chat');
                expect(copy.getBuildPlatform()).toBe(8);
                expect(copy.isTeacher()).toBe(false);
                expect(copy.isHost()).toBe(true);
                expect(copy.isSubClient()).toBe(true);
                expect(copy.getColor()).toBe(0xff112233 | 0);
            });
        });
    });
});
