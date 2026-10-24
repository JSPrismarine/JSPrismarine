import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The stack of fog settings the receiving player renders with.
 *
 * Bound to the client. The whole stack goes out every time, so an empty list clears the fog
 * the `/fog` command pushed. The identifiers name fog definitions from the active resource
 * packs, such as `minecraft:fog_ocean`.
 *
 * Wire order at protocol 2193: Fog Stack as a varuint32 count followed by that many strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-fog-packet/
 */
export default class PlayerFogPacket extends DataPacket {
    public static NetID = Identifiers.PlayerFogPacket;

    /** Fog Stack: the fog identifiers, bottom of the stack first. */
    public fogStack: string[] = [];

    /** Reads the fog count and each identifier. */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();

        this.fogStack = [];
        for (let index = 0; index < count; index++) {
            this.fogStack.push(NetworkUtil.readString(this));
        }
    }

    /** Writes the fog count and each identifier. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.fogStack.length);

        for (const fog of this.fogStack) {
            NetworkUtil.writeString(this, fog);
        }
    }
}
