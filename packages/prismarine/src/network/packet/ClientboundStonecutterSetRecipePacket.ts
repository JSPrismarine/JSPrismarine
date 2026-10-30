import { layoutAt, clientboundStonecutterSetRecipePacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * The stonecutter recipe the server settled on, echoed to the players watching it.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ClientboundStonecutterSetRecipePacket extends DataPacket {
    /** `playerId`. */
    public playerId: bigint = 0n;

    /** `containerId`. */
    public containerId: number = 0;

    /** `recipeIndex`. */
    public recipeIndex: number = 0;
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(clientboundStonecutterSetRecipePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientboundStonecutterSetRecipePacket, this.codecProtocol).decode(this));
    }
}
