import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Sets the health bar of the client that receives it.
 *
 * The whole payload is the docs' `Health` field, a ZigZag varint32. It describes the
 * receiving client and names no actor, so it cannot be used for anybody else.
 *
 * Nothing sends one. The health attribute carries both the value and its maximum, which is
 * why Mojang's own docs call this packet superseded, and `PlayerSession.sendAttributes` is
 * what the server uses instead. The packet is kept decodable for the bot harness and for
 * packet logging.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-health-packet/
 */
export default class SetHealthPacket extends DataPacket {
    public static NetID = Identifiers.SetHealthPacket;

    /**
     * The docs' `Health` field, in half hearts (0 to 20 by default).
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
