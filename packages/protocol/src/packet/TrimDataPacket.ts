import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { trimDataPacket } from '../wire/definitions/trimData';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

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
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(trimDataPacket, protocolVersion);

/**
 * Every armor trim pattern and material the client should know about. The server sends it
 * once during the join, before the client needs to render trimmed armor.
 *
 * The wire layout is the `trimDataPacket` definition in `wire/definitions`.
 */
export default class TrimDataPacket extends NetworkPacket<TrimData> {
    public get id(): number {
        return PacketIdentifier.TRIM_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: TrimData): void {
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): TrimData {
        return layout().decode(stream);
    }
}
