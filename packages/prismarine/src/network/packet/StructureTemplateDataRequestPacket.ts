import BlockPosition from '../../world/BlockPosition';
import { NetworkUtil } from '../NetworkUtil';
import type { StructureSettings } from '../type/StructureSettings';
import { defaultStructureSettings, readStructureSettings, writeStructureSettings } from '../type/StructureSettings';
import DataPacket from './DataPacket';

/** What the client wants done with the structure, as the Requested Operation byte numbers it. */
export enum StructureTemplateRequestOperation {
    None = 0,
    ExportFromSaveMode = 1,
    ExportFromLoadMode = 2,
    QuerySavedStructure = 3
}

/**
 * A structure block asking the server for a structure's data.
 *
 * Sent when the player presses Export or Load in the structure block screen. Mojang's docs say
 * the feature is switched off server-side and the request does nothing.
 *
 * Wire layout at protocol 2193: Structure Name as a string, Structure Position as a `BlockPos`
 * (three ZigZag varint32), Structure Settings as a {@link StructureSettings}, then Requested
 * Operation as a `StructureTemplateRequestOperation` byte.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-template-data-request-packet/
 */
export default class StructureTemplateDataRequestPacket extends DataPacket {
    /** Name typed into the structure block, which is also the file name on export. */
    public structureName = '';

    /** Where the structure block stands. */
    public structurePosition = new BlockPosition(0, 0, 0);

    public structureSettings: StructureSettings = defaultStructureSettings();

    public requestedOperation: StructureTemplateRequestOperation = StructureTemplateRequestOperation.None;

    /** Reads the name, the block position, the settings and the operation. */
    public decodePayload(): void {
        this.structureName = NetworkUtil.readString(this);
        this.structurePosition = NetworkUtil.readBlockPosition(this);
        this.structureSettings = readStructureSettings(this);
        this.requestedOperation = this.readByte();
    }

    /** Writes the name, the block position, the settings and the operation. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.structureName);
        NetworkUtil.writeBlockPosition(this, this.structurePosition);
        writeStructureSettings(this, this.structureSettings);
        this.writeByte(this.requestedOperation);
    }
}
