import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Data needed to spawn an experience orb actor. */
export interface SpawnExperienceOrb {
    /** World position where the client should display the orb. */
    position: Vec3;
    /** Experience points carried by the orb. */
    xpValue: number;
}

/**
 * Spawns an experience orb on the client without an accompanying actor-add packet. The client
 * uses the experience value to choose the orb's displayed size.
 *
 * Protocol 2193 layout (docs id 66): `Position` as three little-endian floats, followed by
 * `XP Value` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/spawn-experience-orb-packet/
 */
export default class SpawnExperienceOrbPacket extends NetworkPacket<SpawnExperienceOrb> {
    public get id(): number {
        return PacketIdentifier.SPAWN_EXPERIENCE_ORB;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SpawnExperienceOrb): void {
        data.position.serialize(stream);
        stream.writeVarInt(data.xpValue);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SpawnExperienceOrb {
        const position = new Vec3(0, 0, 0);
        position.deserialize(stream);
        return { position, xpValue: stream.readVarInt() };
    }
}
