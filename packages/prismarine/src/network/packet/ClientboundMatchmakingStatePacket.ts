import { MatchmakingState, layoutAt, clientboundMatchmakingStatePacket } from '@jsprismarine/protocol';
import type { MatchmakingStateOptions } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Tells a client how its matchmaking request is going.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ClientboundMatchmakingStatePacket extends FieldNetworkPacket {
    /** `state`. */
    public state: number = MatchmakingState.Idle;

    /** `destinationName`. */
    public destinationName: string = '';

    /** `options`. */
    public options: MatchmakingStateOptions | null = null;
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(clientboundMatchmakingStatePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientboundMatchmakingStatePacket, this.codecProtocol).decode(this));
    }
}
