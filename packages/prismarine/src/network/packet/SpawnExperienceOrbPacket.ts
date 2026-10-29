import { Vector3 } from '@jsprismarine/math';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Spawns an experience orb on the client.
 *
 * **Bound To:** Client
 *
 * Like `AddPaintingPacket`, this spawns an actor without `AddActorPacket`. The client sizes
 * the orb from XP Value alone, across eleven steps from a single point up to 2477 and above.
 *
 * Protocol 2193 layout (docs id 66), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Position | Vec3 | Three little-endian floats |
 * | XP Value | varint32 | Experience points in the orb |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/spawn-experience-orb-packet/
 */
export default class SpawnExperienceOrbPacket extends DataPacket {
    /** Position, where the orb appears. */
    public position: Vector3 = new Vector3(0, 0, 0);

    /** XP Value, the experience points the orb carries. */
    public xpValue = 0;

    /** Reads the position and the orb's value. */
    public decodePayload(): void {
        this.position = NetworkUtil.readVector3(this);
        this.xpValue = this.readVarInt();
    }

    /** Writes the position and the orb's value. */
    public encodePayload(): void {
        NetworkUtil.writeVector3(this, this.position);
        this.writeVarInt(this.xpValue);
    }
}
