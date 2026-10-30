import { Vector3 } from '@jsprismarine/math';
import { BuildPlatform, CommandPermissionLevel, Gametype, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import { Metadata, MetadataFlag } from '../wire/structures/Metadata';
import { SyncedProperties } from '../wire/structures/SyncedProperties';
import UUID from '../wire/structures/UUID';
import type { AddPlayerPayload } from '../wire/definitions/addPlayer';
import type { PassengerOfBlock } from '../wire/structures/PassengerOfBlock';
import AddPlayerPacket from './AddPlayerPacket';

const air = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };

const expectedBytes = (slots: {
    gameType: number[];
    playerPermission: number;
    commandPermission: number;
    buildPlatform: number[];
    entityData?: number[];
    rawId?: number[];
}): Buffer =>
    Buffer.concat([
        Buffer.from([0x0c]),
        Buffer.from([0x34, 0x12, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12]),
        Buffer.from([0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0x34, 0x12]),
        Buffer.from([0x05, 0x53, 0x74, 0x65, 0x76, 0x65]),
        Buffer.from([0x02, 0x00]),
        Buffer.from([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40]),
        Buffer.alloc(12),
        Buffer.from([0x00, 0x00, 0x20, 0x41, 0x00, 0x00, 0xa0, 0x41]),
        Buffer.from([0x00, 0x00, 0xf0, 0x41]),
        Buffer.alloc(8),
        Buffer.from(slots.gameType),
        Buffer.from(slots.entityData ?? [0x00]),
        Buffer.from([0x00, 0x00]),
        Buffer.from(slots.rawId ?? [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([slots.playerPermission, slots.commandPermission, 0x00]),
        Buffer.from([0x00]),
        Buffer.from([0x06, 0x64, 0x65, 0x76, 0x69, 0x63, 0x65]),
        Buffer.from(slots.buildPlatform)
    ]);

const payload = (overrides: Partial<AddPlayerPayload> = {}): AddPlayerPayload => ({
    uuid: UUID.fromString('12345678-1234-1234-1234-123456789abc'),
    name: 'Steve',
    runtimeEntityId: 2n,
    platformChatId: '',
    position: new Vector3(1, 2, 3),
    motion: new Vector3(0, 0, 0),
    pitch: 10,
    yaw: 20,
    headYaw: 30,
    carriedItem: air,
    gamemode: Gametype.SURVIVAL,
    metadata: new Metadata(false),
    syncedProperties: new SyncedProperties(),
    abilities: {
        targetPlayerRawId: 1n,
        playerPermission: PlayerPermissionLevel.VISITOR,
        commandPermission: CommandPermissionLevel.ANY,
        layers: []
    },
    links: [],
    passengerOfBlock: null,
    deviceId: 'device',
    buildPlatform: BuildPlatform.UNKNOWN,
    ...overrides
});

describe('AddPlayerPacket', () => {
    it('writes the documented identity, movement, metadata, abilities, and platform fields', () => {
        const packet = new AddPlayerPacket(payload());
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            expectedBytes({
                gameType: [0x00],
                playerPermission: 0x00,
                commandPermission: 0x00,
                buildPlatform: [0xff, 0xff, 0xff, 0xff]
            })
        );
    });

    it('writes game type, permissions, and platform in their documented fields', () => {
        const packet = new AddPlayerPacket(
            payload({
                gamemode: Gametype.CREATIVE,
                abilities: {
                    targetPlayerRawId: 1n,
                    playerPermission: PlayerPermissionLevel.OPERATOR,
                    commandPermission: CommandPermissionLevel.OWNER,
                    layers: []
                },
                buildPlatform: BuildPlatform.WIN32
            })
        );
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            expectedBytes({
                gameType: [0x02],
                playerPermission: 0x02,
                commandPermission: 0x04,
                buildPlatform: [0x08, 0x00, 0x00, 0x00]
            })
        );
    });

    it('writes actor metadata and uses the runtime id as the abilities target when no unique id is supplied', () => {
        const data = payload({ abilities: { ...payload().abilities, targetPlayerRawId: 2n } });
        data.metadata.setFloat(MetadataFlag.SCALE, 1);
        const packet = new AddPlayerPacket(data);
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            expectedBytes({
                gameType: [0x00],
                playerPermission: 0x00,
                commandPermission: 0x00,
                buildPlatform: [0xff, 0xff, 0xff, 0xff],
                entityData: [0x01, 0x26, 0x03, 0x03, 0x00, 0x00, 0x80, 0x3f],
                rawId: [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
            })
        );
    });

    it('round-trips the carried item, actor metadata, and permissions', () => {
        const data = payload({
            gamemode: Gametype.CREATIVE,
            abilities: {
                targetPlayerRawId: 2n,
                playerPermission: PlayerPermissionLevel.OPERATOR,
                commandPermission: CommandPermissionLevel.OWNER,
                layers: []
            }
        });
        data.metadata.setFloat(MetadataFlag.SCALE, 1);

        const encoded = new AddPlayerPacket(data);
        encoded.encode();
        const decoded = new AddPlayerPacket(encoded.getBuffer());
        decoded.decode();

        const result = decoded.getPacketData();
        if (result === null) throw new Error('AddPlayerPacket decoded without payload data');
        expect(result.uuid.toString()).toBe(data.uuid.toString());
        expect(result.name).toBe('Steve');
        expect(result.runtimeEntityId).toBe(2n);
        expect(result.position).toEqual(new Vector3(1, 2, 3));
        expect(result.motion).toEqual(new Vector3(0, 0, 0));
        expect(result.carriedItem).toEqual(air);
        expect(result.gamemode).toBe(Gametype.CREATIVE);
        expect(result.metadata.getData()).toEqual(data.metadata.getData());
        expect(result.abilities).toMatchObject({
            targetPlayerRawId: 2n,
            playerPermission: PlayerPermissionLevel.OPERATOR,
            commandPermission: CommandPermissionLevel.OWNER
        });
        expect(result.deviceId).toBe('device');
        expect(result.buildPlatform).toBe(BuildPlatform.UNKNOWN);
    });

    it('carries optional passenger block data before the device id in protocol 2225', () => {
        const passenger: PassengerOfBlock = {
            blockPosition: new Vector3(1, -60, 2),
            offset: new Vector3(0.25, 0, -0.25),
            rotation: 180,
            rotationLimit: 90,
            emoteType: 1
        };
        const packet = new AddPlayerPacket(payload({ passengerOfBlock: passenger }));
        packet.codecProtocol = 2225;
        packet.encode();

        const decoded = new AddPlayerPacket(packet.getBuffer());
        decoded.codecProtocol = 2225;
        decoded.decode();
        const result = decoded.getPacketData();
        if (result === null) throw new Error('AddPlayerPacket decoded without payload data');
        expect(result.passengerOfBlock).toEqual(passenger);
        expect(result.deviceId).toBe('device');
    });

    it('writes one absent-passenger byte before the device id in protocol 2225', () => {
        const packet2193 = new AddPlayerPacket(payload());
        packet2193.encode();

        const packet2225 = new AddPlayerPacket(payload());
        packet2225.codecProtocol = 2225;
        packet2225.encode();

        const beforeDeviceId = packet2193.getBuffer();
        const afterDeviceId = packet2225.getBuffer();
        const trailingDeviceAndPlatform = 1 + Buffer.byteLength('device') + 4;
        expect(afterDeviceId).toEqual(
            Buffer.concat([
                beforeDeviceId.subarray(0, beforeDeviceId.byteLength - trailingDeviceAndPlatform),
                Buffer.from([0]),
                beforeDeviceId.subarray(beforeDeviceId.byteLength - trailingDeviceAndPlatform)
            ])
        );
    });
});
