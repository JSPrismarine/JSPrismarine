import { layoutAt, playerFogPacket } from '@jsprismarine/protocol';

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
    /** Fog Stack: the fog identifiers, bottom of the stack first. */
    public fogStack: string[] = [];

    /** Reads the fog count and each identifier. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(playerFogPacket, this.codecProtocol).decode(this));
    }

    /** Writes the fog count and each identifier. */
    public encodePayload(): void {
        layoutAt(playerFogPacket, this.codecProtocol).encode(this, this);
    }
}
