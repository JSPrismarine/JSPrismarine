import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import { Metadata, MetadataFlag } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import AddPlayerPacket from './AddPlayerPacket';

/**
 * The 2193 layout written out by hand, one docs field per line and in docs order. The
 * parameters are the slots the tests change; everything else is fixed so a shifted field
 * fails the whole comparison.
 */
const expectedBytes = (slots: {
    gameType: number[];
    playerPermission: number;
    commandPermission: number;
    buildPlatform: number[];
    /** Entity Data; no entries unless a test adds one. */
    entityData?: number[];
    /** Abilities Data's Target Player Raw Id, int64 LE; 1 unless a test changes it. */
    rawId?: number[];
}): Buffer =>
    Buffer.concat([
        Buffer.from([0x0c]), // Header: packet id 12.
        // UUID 12345678-1234-1234-1234-123456789abc as two uint64 LE, most significant first.
        Buffer.from([0x34, 0x12, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12]),
        Buffer.from([0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0x34, 0x12]),
        Buffer.from([0x05, 0x53, 0x74, 0x65, 0x76, 0x65]), // Player Name "Steve".
        Buffer.from([0x02]), // Target Runtime ID 2.
        Buffer.from([0x00]), // Platform Chat Id "".
        Buffer.from([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40]), // Position (1, 2, 3).
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Velocity (0, 0, 0).
        Buffer.from([0x00, 0x00, 0x20, 0x41, 0x00, 0x00, 0xa0, 0x41]), // Rotation: pitch 10, yaw 20.
        Buffer.from([0x00, 0x00, 0xf0, 0x41]), // Y-Head Rotation 30.
        // Carried Item, air: int16 id, uint16 count, varuint aux, no stack net id, varuint block runtime id, varuint user data length.
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from(slots.gameType), // Player Game Type.
        Buffer.from(slots.entityData ?? [0x00]), // Entity Data.
        Buffer.from([0x00, 0x00]), // Synched Properties: no int entries, no float entries.
        Buffer.from(slots.rawId ?? [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Abilities Data: Target Player Raw Id.
        Buffer.from([slots.playerPermission, slots.commandPermission, 0x00]), // Player Permissions, Command Permissions, no Layers.
        Buffer.from([0x00]), // Actor Links: none.
        Buffer.from([0x06, 0x64, 0x65, 0x76, 0x69, 0x63, 0x65]), // Device Id "device".
        Buffer.from(slots.buildPlatform) // Build Platform int32 LE.
    ]);

/** A packet with every field set, or without a unique id when `uniqueEntityId` is omitted. */
const buildPacket = ({ uniqueEntityId }: { uniqueEntityId?: bigint } = { uniqueEntityId: 1n }): AddPlayerPacket => {
    const pk = new AddPlayerPacket();
    pk.uuid = UUID.fromString('12345678-1234-1234-1234-123456789abc');
    pk.name = 'Steve';
    if (uniqueEntityId !== undefined) pk.uniqueEntityId = uniqueEntityId;
    pk.runtimeEntityId = 2n;
    pk.platformChatId = '';
    pk.positionX = 1;
    pk.positionY = 2;
    pk.positionZ = 3;
    pk.pitch = 10;
    pk.yaw = 20;
    pk.headYaw = 30;
    pk.item = Item.air();
    pk.metadata = new Metadata(false);
    pk.deviceId = 'device';
    return pk;
};

describe('network', () => {
    describe('packet', () => {
        describe('AddPlayerPacket', () => {
            it('encodes the 2193 layout with the default enum values', () => {
                const pk = buildPacket();
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        gameType: [0x00], // SURVIVAL is 0, zigzag 0.
                        playerPermission: 0x00, // VISITOR.
                        commandPermission: 0x00, // ANY.
                        buildPlatform: [0xff, 0xff, 0xff, 0xff] // UNKNOWN is -1.
                    })
                );
            });

            it('writes the game type, both permissions and the build platform in their own slots', () => {
                const pk = buildPacket();
                pk.gamemode = Gametype.CREATIVE;
                pk.playerPermission = PlayerPermissionLevel.OPERATOR;
                pk.commandPermission = CommandPermissionLevel.OWNER;
                pk.buildPlatform = BuildPlatform.WIN32;
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        gameType: [0x02], // CREATIVE is 1, zigzag 2.
                        playerPermission: 0x02,
                        commandPermission: 0x04,
                        buildPlatform: [0x08, 0x00, 0x00, 0x00]
                    })
                );
            });

            it('writes a data item as its id, the type twice and the value, and targets the runtime id without a unique id', () => {
                // `sendSpawn` never sets a unique id; the server uses the runtime id for both.
                const pk = buildPacket({});
                pk.metadata.setFloat(MetadataFlag.SCALE, 1);
                pk.encode();

                expect(pk.getBuffer()).toEqual(
                    expectedBytes({
                        gameType: [0x00],
                        playerPermission: 0x00,
                        commandPermission: 0x00,
                        buildPlatform: [0xff, 0xff, 0xff, 0xff],
                        // One DataItemEntry: ID 38 as a varuint, the Float alternative selected as
                        // varuint 3, DataItemType Float as a byte, then the Value 1.0 as a float LE.
                        entityData: [0x01, 0x26, 0x03, 0x03, 0x00, 0x00, 0x80, 0x3f],
                        rawId: [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
                    })
                );
            });
        });
    });
});
