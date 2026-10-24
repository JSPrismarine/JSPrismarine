import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Tells the client the world time, at login and whenever it changes.
 *
 * Protocol 2193 layout (docs id 10):
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Time | varint32 | ZigZag encoded; the world tick |
 */
export default class SetTimePacket extends DataPacket {
    public static NetID = Identifiers.SetTimePacket;

    public time!: number;

    public decodePayload(): void {
        this.time = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.time);
    }
}
