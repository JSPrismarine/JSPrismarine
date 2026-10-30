import { layoutAt, serverboundStonecutterSetRecipePacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * A client picking a recipe in an open stonecutter.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ServerboundStonecutterSetRecipePacket extends FieldNetworkPacket {
    /** `containerId`. */
    public containerId: number = 0;

    /** `recipeIndex`. */
    public recipeIndex: number = 0;
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(serverboundStonecutterSetRecipePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(serverboundStonecutterSetRecipePacket, this.codecProtocol).decode(this));
    }
}
