import { jigsawStructureDataPacket } from '../wire/definitions/jigsawStructureData';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import type { ProtocolContext } from '../ProtocolContext';

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
 * The compound is supplied for the negotiated connection through
 * `ProtocolContext.jigsawStructureData`, or explicitly through {@link structureData}. The
 * protocol package writes those bytes unchanged.
 *
 * The wire layout is the `jigsawStructureDataPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/jigsaw-structure-data-packet/
 */
export default class JigsawStructureDataPacket extends FieldNetworkPacket {
    /** The rules as network NBT, or `null` to use the connection's captured bytes. */
    public structureData: Buffer | null = null;

    /** Writes the rules, taking the bytes from the connection context when unset. */
    public encodePayload(context?: ProtocolContext): void {
        const structureData = this.structureData ?? context?.jigsawStructureData;
        if (structureData === undefined) {
            throw new Error('JigsawStructureDataPacket requires structure data in the packet or protocol context');
        }

        layoutAt(jigsawStructureDataPacket, this.codecProtocol).encode(this, { structureData });
    }

    /** Reads the rules, which run to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(jigsawStructureDataPacket, this.codecProtocol).decode(this));
    }
}
