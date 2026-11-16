import type { ProtocolContext } from '@jsprismarine/protocol';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import AddPaintingPacket from '@jsprismarine/protocol/packet/AddPaintingPacket';
import Vec3 from '@jsprismarine/protocol/structure/Vec3';
import { describe, expect, it } from 'vitest';

import { firstSightPackets } from './firstSight';

const context: ProtocolContext = { protocolVersion: 2193 };

describe('a painting first sight', () => {
    it('is one AddPaintingPacket with the motif, the facing and the center of the face', () => {
        const packets = firstSightPackets(
            {
                kind: 'painting',
                runtimeId: 42n,
                painting: { position: { x: 1, y: 65.5, z: 1.03125 }, direction: 0, motif: 'Pool' }
            },
            context
        );

        expect(packets).toHaveLength(1);
        const [packet] = packets;
        expect(packet).toBeInstanceOf(AddPaintingPacket);
        // What a client reads off the wire.
        const bytes = packet?.serialize(new NetworkBinaryStream(), context);
        expect(new AddPaintingPacket().deserialize(new NetworkBinaryStream(bytes))).toEqual({
            targetActorId: 42n,
            targetRuntimeId: 42n,
            position: new Vec3(1, 65.5, 1.03125),
            direction: 0,
            motif: 'Pool'
        });
    });
});
