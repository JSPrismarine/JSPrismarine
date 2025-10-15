import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Packet for handling a player's health.
 */
export default class SetHealthPacket extends DataPacket {
    public static NetID = Identifiers.SetHealthPacket;

    /**
     * The health value (between 0 and 20 by default).
     *
     * @defaultValue 20
     */
    public health: number = 20;

    public decodePayload(): void {
        this.health = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.health);
    }
}
