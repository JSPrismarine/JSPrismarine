import { layoutAt, serverboundMatchmakingCancelPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Asks the server to cancel the matchmaking request in flight. The payload is empty.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ServerboundMatchmakingCancelPacket extends FieldNetworkPacket {
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(serverboundMatchmakingCancelPacket, this.codecProtocol).encode(this, {});
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        layoutAt(serverboundMatchmakingCancelPacket, this.codecProtocol).decode(this);
    }
}
