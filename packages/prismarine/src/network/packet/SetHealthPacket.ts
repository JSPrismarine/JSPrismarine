import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

/**
 * Packet for handling a player's health.
 *
 * @public
 */
export default class SetHealthPacket extends DataPacket {
    public static NetID = Identifiers.SetHealthPacket;

    /**
     * The health value (between 0 and 20 by default).
     *
     * @defaultValue 20
     */
    public health: number = 20;

    public decodePayload() {
        this.health = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.health);
    }
}
