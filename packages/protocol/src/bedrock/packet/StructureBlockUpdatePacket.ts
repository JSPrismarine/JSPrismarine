import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    StructureBlockType,
    StructureRedstoneSaveMode,
    structureBlockUpdatePacket
} from '../wire/definitions/structureBlockUpdate';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { StructureBlockUpdatePayload } from '../wire/definitions/structureBlockUpdate';

export { StructureBlockType, StructureRedstoneSaveMode };

/** The unfiltered and optional filtered forms of a user-entered structure name. */
export type RedactableString = StructureEditorData['structureName'];

/**
 * The contents of the structure block editor.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/structure-editor-data/
 */
export type StructureEditorData = StructureBlockUpdate['structureData'];

/** The full editor state sent when a player closes a structure block screen. */
export type StructureBlockUpdate = StructureBlockUpdatePayload;

/**
 * Reports the structure block editor state to the server.
 *
 * Protocol 2193 and 2225 share one layout: `Block Position`, then `Structure Data` (name, data field, two
 * booleans, mode, `StructureSettings`, and redstone save mode), followed by `Trigger?`
 * and `Is Waterlogged`. The redacted structure name is an optional string after its
 * unredacted form. The reference labels `Redstone Save Mode` as `uint8` yet marks it compressed;
 * this codec writes a ZigZag varint32, where `SavesToDisk` is `0x02`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-block-update-packet/
 */
export default class StructureBlockUpdatePacket extends NetworkPacket<StructureBlockUpdate> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'StructureBlockUpdatePacket';
    }

    public get id(): number {
        return PacketIdentifier.STRUCTURE_BLOCK_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureBlockUpdate): void {
        layoutAt(structureBlockUpdatePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureBlockUpdate {
        return layoutAt(structureBlockUpdatePacket, this.codecProtocol).decode(stream);
    }
}
