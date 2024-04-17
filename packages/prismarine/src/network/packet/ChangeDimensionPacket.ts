import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

export default class ChangeDimensionPacket extends DataPacket {
    public static NetID = Identifiers.ChangeDimensionPacket;

    public dimension!: number;
    public position!: Vector3 | null;
    public respawn!: boolean;

    public decodePayload() {
        this.dimension = this.readVarInt();
        this.position = NetworkUtil.readVector3(this);
        this.respawn = this.readBoolean();
    }

    public encodePayload() {
        this.writeVarInt(this.dimension);
        NetworkUtil.writeVector3(this, this.position);
        this.writeBoolean(this.respawn);
    }
}
