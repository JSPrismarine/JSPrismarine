import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One `TrimPattern` entry of the `TrimPattern List`. */
export interface TrimPattern {
    /** `Item Name`, the smithing template item that applies the pattern. */
    itemName: string;
    /** `Pattern Id`, the pattern's name, for example `sentry`. */
    patternId: string;
}

/** One `TrimMaterial` entry of the `TrimMaterial List`. */
export interface TrimMaterial {
    /** `Material Id`, the material's name, for example `quartz`. */
    materialId: string;
    /** `Color`, the formatting code the client colors the trim's tooltip line with. */
    color: string;
    /** `Item Name`, the ingredient item that applies the material. */
    itemName: string;
}

/** The fields of a `TrimDataPacket`, in wire order. */
export interface TrimData {
    /** `TrimPattern List`, every armor trim pattern the client may show. */
    patterns: TrimPattern[];
    /** `TrimMaterial List`, every armor trim material the client may show. */
    materials: TrimMaterial[];
}

/**
 * Every armor trim pattern and material the client should know about. The server sends it
 * once during the join, before the client needs to render trimmed armor.
 *
 * Protocol 2193 layout, in wire order: `TrimPattern List` as a varuint32 count followed by one
 * {@link TrimPattern} per entry (`Item Name`, then `Pattern Id`), then `TrimMaterial List` as a
 * varuint32 count followed by one {@link TrimMaterial} per entry (`Material Id`, `Color`, then
 * `Item Name`). The docs type the ids and item names as `hashed_string`, which the wire carries
 * as a plain string: a varuint32 byte length followed by UTF-8. The client hashes it on receipt.
 */
export default class TrimDataPacket extends NetworkPacket<TrimData> {
    public get id(): number {
        return PacketIdentifier.TRIM_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: TrimData): void {
        stream.writeUnsignedVarInt(data.patterns.length);
        for (const pattern of data.patterns) {
            stream.writeString(pattern.itemName);
            stream.writeString(pattern.patternId);
        }

        stream.writeUnsignedVarInt(data.materials.length);
        for (const material of data.materials) {
            stream.writeString(material.materialId);
            stream.writeString(material.color);
            stream.writeString(material.itemName);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): TrimData {
        const patterns: TrimPattern[] = [];
        let patternCount = stream.readUnsignedVarInt();
        while (patternCount-- > 0) {
            patterns.push({
                itemName: stream.readString(),
                patternId: stream.readString()
            });
        }

        const materials: TrimMaterial[] = [];
        let materialCount = stream.readUnsignedVarInt();
        while (materialCount-- > 0) {
            materials.push({
                materialId: stream.readString(),
                color: stream.readString(),
                itemName: stream.readString()
            });
        }

        return { patterns, materials };
    }
}
