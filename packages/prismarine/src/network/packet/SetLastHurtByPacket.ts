import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Tells the client which kind of actor hit the player last.
 *
 * Wire order at protocol 2193: `LastHurtBy` as a ZigZag varint32, and nothing else.
 *
 * The value is a member of Mojang's `ActorType`, an enum of around 130 members that this
 * repository does not generate, so the field is a plain number. `0` is `Undefined`. No client
 * behavior is known to depend on the packet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-last-hurt-by-packet/
 */
export default class SetLastHurtByPacket extends DataPacket {
    public static NetID = Identifiers.SetLastHurtByPacket;

    /** The `ActorType` of the last attacker. */
    public lastHurtBy = 0;

    /** Reads the actor type. */
    public decodePayload(): void {
        this.lastHurtBy = this.readVarInt();
    }

    /** Writes the actor type. */
    public encodePayload(): void {
        this.writeVarInt(this.lastHurtBy);
    }
}
