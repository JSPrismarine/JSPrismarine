import BinaryStream from '@jsprismarine/binaryutils';
import { BuildPlatform } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Metadata } from '../../entity/Metadata';
import { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import BlockPosition from '../../world/BlockPosition';
import { SyncedProperties } from '../type/SyncedProperties';
import AddPlayerPacket from './AddPlayerPacket';
import { addPlayerPacket } from './addPlayer.wire';

import type { PassengerOfBlock } from '../type/PassengerOfBlock';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class inserted one
 * optional Passenger Block Data between the actor links and the device id; the 2193 class
 * wrote the sixteen documented fields.
 */
describe('the declarative AddPlayer layout against the packet class it replaces', () => {
    const passenger = (): PassengerOfBlock => ({
        blockPosition: new BlockPosition(0, 0, 0),
        offset: new Vector3(0, 0, 0),
        rotation: 0,
        rotationLimit: 0,
        emoteType: 0
    });

    const fill = (packet: AddPlayerPacket): AddPlayerPacket => {
        packet.uuid = UUID.fromString('00000000-0000-4000-8000-000000000001');
        packet.name = 'Steve';
        packet.runtimeEntityId = 3n;
        packet.platformChatId = '';
        packet.pitch = 0;
        packet.yaw = 0;
        packet.headYaw = 0;
        packet.deviceId = 'device';
        return packet;
    };

    const payload = () => {
        const reference = fill(new AddPlayerPacket());
        return {
            uuid: UUID.fromString('00000000-0000-4000-8000-000000000001'),
            name: 'Steve',
            runtimeEntityId: 3n,
            platformChatId: '',
            position: new Vector3(0, 5, 0),
            motion: new Vector3(0, 0, 0),
            pitch: 0,
            yaw: 0,
            headYaw: 0,
            carriedItem: Item.air(),
            gamemode: reference.gamemode,
            metadata: new Metadata(),
            syncedProperties: new SyncedProperties(),
            abilities: {
                targetPlayerRawId: 3n,
                playerPermission: reference.playerPermission,
                commandPermission: reference.commandPermission,
                layers: []
            },
            links: [],
            passengerOfBlock: null as PassengerOfBlock | null,
            deviceId: 'device',
            buildPlatform: BuildPlatform.UNKNOWN
        };
    };

    it('matches the 2193 class byte for byte', () => {
        const classPacket = fill(new AddPlayerPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(addPlayerPacket, 2193).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the class stamped 2225 byte for byte, passenger set and absent', () => {
        for (const riding of [null, passenger()]) {
            const classPacket = fill(new AddPlayerPacket());
            classPacket.codecProtocol = 2225;
            classPacket.passengerOfBlock = riding;
            classPacket.encodePayload();

            const stream = new BinaryStream();
            layoutAt(addPlayerPacket, 2225).encode(stream, { ...payload(), passengerOfBlock: riding });

            expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
        }
    });

    it('inserts exactly the absent-passenger byte before the device id at 2225', () => {
        const base = new BinaryStream();
        layoutAt(addPlayerPacket, 2193).encode(base, payload());

        const extended = new BinaryStream();
        layoutAt(addPlayerPacket, 2225).encode(extended, payload());

        // Device Id and Build Platform close the packet: a length byte, 'device', and four
        // little-endian bytes. The inserted presence byte sits right in front of them.
        const tail = 1 + 'device'.length + 4;
        const bytes = base.getBuffer();
        expect(extended.getBuffer()).toEqual(
            Buffer.concat([
                bytes.subarray(0, bytes.byteLength - tail),
                Buffer.from([0]),
                bytes.subarray(bytes.byteLength - tail)
            ])
        );
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(new AddPlayerPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream(classPacket.getBuffer());
        const read = layoutAt(addPlayerPacket, 2193).decode(stream);
        expect(stream.feof()).toBe(true);
        expect(read).toMatchObject({ name: 'Steve', deviceId: 'device', passengerOfBlock: null });
        expect(read.abilities).toMatchObject({ targetPlayerRawId: 3n, layers: [] });
        expect(read.position.getY()).toBe(5);
    });
});
