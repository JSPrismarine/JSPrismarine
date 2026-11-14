import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { spawnExperienceOrbPacket } from '../wire/definitions/spawnExperienceOrb';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { SpawnExperienceOrbPayload } from '../wire/definitions/spawnExperienceOrb';

/** Data needed to spawn an experience orb actor. */
export type SpawnExperienceOrb = SpawnExperienceOrbPayload;

/**
 * Spawns an experience orb on the client without an accompanying actor-add packet. The client
 * uses the experience value to choose the orb's displayed size.
 *
 * Protocol 2193 and 2225 layout (docs id 66, identical in both): `Position` as three little-endian floats, followed by
 * `XP Value` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/spawn-experience-orb-packet/
 */
export default class SpawnExperienceOrbPacket extends NetworkPacket<SpawnExperienceOrb> {
    public get id(): number {
        return PacketIdentifier.SPAWN_EXPERIENCE_ORB;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SpawnExperienceOrb): void {
        layoutAt(spawnExperienceOrbPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SpawnExperienceOrb {
        return layoutAt(spawnExperienceOrbPacket, this.codecProtocol).decode(stream);
    }
}
