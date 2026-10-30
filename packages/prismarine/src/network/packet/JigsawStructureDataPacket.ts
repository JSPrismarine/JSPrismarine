import { jigsaw_structure_data } from '@jsprismarine/bedrock-data';
import { jigsawStructureDataPacket, layoutAt } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The jigsaw structure rules: how villages, bastions, trail ruins and the rest are assembled
 * from their pieces.
 *
 * One network NBT compound and nothing else. The client wants a copy because it generates
 * chunks itself when the server lets it, and from protocol 2193 (Minecraft 1.26.50) it wants
 * it *before* `StartGamePacket`: a client that reaches StartGame without having been sent
 * this disconnects with `MissingStructureData`, whether or not it was ever going to generate
 * anything.
 *
 * This server has no jigsaw rules of its own, so it sends vanilla's - the payload a Bedrock
 * Dedicated Server 1.26.51.1 sent, recorded by `packages/client/tools/capture-server-data.mjs`
 * and handed on verbatim. Two hundred kilobytes, once per join, and mostly repeated names that
 * compress well.
 *
 * The wire layout is the `jigsawStructureDataPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 */
export default class JigsawStructureDataPacket extends FieldNetworkPacket {
    /** The rules as network NBT. Defaults to vanilla's. */
    public structureData: Buffer = jigsaw_structure_data;

    /** Writes the rules, which are the whole payload. */
    public encodePayload(): void {
        layoutAt(jigsawStructureDataPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the rules, which run to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(jigsawStructureDataPacket, this.codecProtocol).decode(this));
    }
}
