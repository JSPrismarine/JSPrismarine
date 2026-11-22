import FieldNetworkPacket from '../../FieldNetworkPacket';
import { layoutAt } from '../../wire/WireLayout';
import { clientboundStonecutterSetRecipePacket } from '../wire/definitions/added2225';

/**
 * The stonecutter recipe the server settled on, echoed to the players watching it.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-stonecutter-set-recipe-packet/
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class ClientboundStonecutterSetRecipePacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundStonecutterSetRecipePacket';
    }

    /** `Player Id`, an `ActorUniqueID` (ZigZag varint64). */
    public playerId: bigint = 0n;

    /** `Container Id`, one byte. */
    public containerId: number = 0;

    /** `Recipe Index`, a ZigZag varint32. */
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
