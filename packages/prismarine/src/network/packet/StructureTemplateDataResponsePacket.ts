import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Which request this answers, as the Response Type byte numbers it. */
export enum StructureTemplateResponseType {
    None = 0,
    Export = 1,
    Query = 2
}

/**
 * The server's answer to a `StructureTemplateDataRequestPacket`.
 *
 * The structure arrives as one network NBT compound, which the client loads into the structure
 * block screen. Mojang's docs say the feature is switched off, so a real server answers every
 * request with no template.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Structure Name as a string, a Success boolean, the structure
 * as a network NBT compound when Success is set, then Response Type as a
 * `StructureTemplateResponseType` byte.
 *
 * The docs collapse the boolean and the compound into one `unknown` field. Both are written
 * here, following gophertunnel at 2193; with the boolean left out the Response Type byte that
 * follows reads off by one.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/structure-template-data-response-packet/
 */
export default class StructureTemplateDataResponsePacket extends DataPacket {
    public static NetID = Identifiers.StructureTemplateDataResponsePacket;

    /** Name from the request this answers. */
    public structureName = '';

    /**
     * The structure, or null when the server found none.
     *
     * Null is what sets the Success boolean to false, so there is no separate field for it.
     */
    public structureTemplate: NBTTagCompound | null = null;

    public responseType: StructureTemplateResponseType = StructureTemplateResponseType.None;

    /** Reads the name, the template if one is present, and the response type. */
    public decodePayload(): void {
        this.structureName = NetworkUtil.readString(this);

        if (this.readBoolean()) {
            const reader = new NBTReader(this, ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(true);
            this.structureTemplate = reader.parse();
        } else {
            this.structureTemplate = null;
        }

        this.responseType = this.readByte();
    }

    /** Writes the name, the template if one is set, and the response type. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.structureName);

        if (this.structureTemplate === null) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            const writer = new NBTWriter(this, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            writer.writeCompound(this.structureTemplate);
        }

        this.writeByte(this.responseType);
    }
}
