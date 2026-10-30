import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { Attribute } from '../../entity/Attribute';
import { Metadata } from '../../entity/Metadata';
import BlockPosition from '../../world/BlockPosition';
import { SyncedProperties } from '../type/SyncedProperties';
import AddActorPacket, { ActorLinkType } from './AddActorPacket';
import { addActorPacket } from '@jsprismarine/protocol/wire/definitions/addActor';

import type { PassengerOfBlock } from '../type/PassengerOfBlock';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class wrote the 2193
 * fields and then one trailing optional Passenger Block Data; the 2193 class wrote the
 * twelve documented fields.
 */
describe('the declarative AddActor layout against the packet class it replaces', () => {
    const passenger = (): PassengerOfBlock => ({
        blockPosition: new BlockPosition(1, -60, 2),
        offset: new Vector3(0.5, 1, -0.5),
        rotation: 180,
        rotationLimit: 90,
        emoteType: 1
    });

    const fill = (packet: AddActorPacket): AddActorPacket => {
        packet.runtimeEntityId = 12n;
        packet.type = 'minecraft:cow';
        packet.position = new Vector3(1, 2, 3);
        packet.motion = new Vector3(0, -0.5, 0);
        packet.pitch = 0;
        packet.yaw = 90;
        packet.headYaw = 90;
        packet.attributes = [new Attribute({ name: 'minecraft:health', min: 0, max: 10, value: 10, def: 10 })];
        packet.metadata = new Metadata();
        packet.links = [
            {
                targetA: 1n,
                targetB: 12n,
                type: ActorLinkType.Riding,
                immediate: false,
                passengerInitiated: false,
                vehicleAngularVelocity: 0
            }
        ];
        return packet;
    };

    const payload = () => {
        const reference = fill(new AddActorPacket());
        return {
            targetActorId: 12n,
            runtimeEntityId: 12n,
            type: 'minecraft:cow',
            position: new Vector3(1, 2, 3),
            motion: new Vector3(0, -0.5, 0),
            pitch: 0,
            yaw: 90,
            headYaw: 90,
            bodyYaw: 90,
            attributes: reference.attributes,
            metadata: reference.metadata,
            syncedProperties: new SyncedProperties(),
            links: reference.links,
            passengerOfBlock: null as PassengerOfBlock | null
        };
    };

    it('matches the 2193 class byte for byte', () => {
        const classPacket = fill(new AddActorPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(addActorPacket, 2193).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the class stamped 2225 byte for byte, passenger set and absent', () => {
        for (const riding of [null, passenger()]) {
            const classPacket = fill(new AddActorPacket());
            classPacket.codecProtocol = 2225;
            classPacket.passengerOfBlock = riding;
            classPacket.encodePayload();

            const stream = new BinaryStream();
            layoutAt(addActorPacket, 2225).encode(stream, { ...payload(), passengerOfBlock: riding });

            expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
        }
    });

    it('appends exactly the trailing absent Passenger Block Data byte at 2225', () => {
        const base = new BinaryStream();
        layoutAt(addActorPacket, 2193).encode(base, payload());

        const extended = new BinaryStream();
        layoutAt(addActorPacket, 2225).encode(extended, payload());

        expect(extended.getBuffer()).toEqual(Buffer.concat([base.getBuffer(), Buffer.from([0])]));
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(new AddActorPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream(classPacket.getBuffer());
        const read = layoutAt(addActorPacket, 2193).decode(stream);
        expect(stream.feof()).toBe(true);
        expect(read).toMatchObject({
            targetActorId: 12n,
            runtimeEntityId: 12n,
            type: 'minecraft:cow',
            yaw: 90,
            bodyYaw: 90,
            passengerOfBlock: null
        });
        expect(read.links[0]).toMatchObject({ targetA: 1n, targetB: 12n, type: ActorLinkType.Riding });
        expect(read.attributes[0]!.getName()).toBe('minecraft:health');
    });
});
