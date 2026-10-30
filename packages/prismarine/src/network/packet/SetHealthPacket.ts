import { layoutAt, setHealthPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Sets the health bar of the client that receives it.
 *
 * The whole payload is the docs' `Health` field, a ZigZag varint32. It describes the
 * receiving client and names no actor, so it cannot be used for anybody else.
 *
 * The health attribute carries both the value and its maximum, which is why Mojang's own
 * docs call this packet superseded, and `PlayerSession.sendAttributes` is what the server
 * uses for health otherwise. A Bedrock Dedicated Server 1.26.52 still sends one when a player
 * respawns, so `PlayerSession.sendRespawned` does too.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-health-packet/
 */
export default class SetHealthPacket extends DataPacket {
    /**
     * The docs' `Health` field, in half hearts (0 to 20 by default).
     *
     * @defaultValue 20
     */
    public health: number = 20;

    public decodePayload(): void {
        Object.assign(this, layoutAt(setHealthPacket, this.codecProtocol).decode(this));
    }

    public encodePayload(): void {
        layoutAt(setHealthPacket, this.codecProtocol).encode(this, this);
    }
}
