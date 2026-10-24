import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class ChangeDimensionPacket extends DataPacket {
    public static NetID = Identifiers.ChangeDimensionPacket;

    public dimension!: number;
    public position!: Vector3 | null;
    public respawn!: boolean;

    /** The loading screen this change belongs to, if the server is driving one. */
    public loadingScreenId: number | null = null;

    public decodePayload(): void {
        this.dimension = this.readVarInt();
        this.position = NetworkUtil.readVector3(this);
        this.respawn = this.readBoolean();
        this.loadingScreenId = this.readBoolean() ? this.readUnsignedIntLE() : null;
    }

    public encodePayload(): void {
        this.writeVarInt(this.dimension);
        NetworkUtil.writeVector3(this, this.position);
        this.writeBoolean(this.respawn);

        // An optional loading screen id, new to this protocol: a byte saying whether it is
        // there, then a little endian uint32 if it is. Omitting the byte ends the packet early,
        // and a client that reads past the end of a packet calls it malformed and hangs up.
        if (this.loadingScreenId === null) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            this.writeUnsignedIntLE(this.loadingScreenId);
        }
    }
}
