/**
 * `DimensionDataPacket`: the height bounds and generator of each data-driven dimension the
 * server registered.
 *
 * The payload is the `Definitions` map: a varuint32 entry count, then per entry the dimension
 * identifier string and a `DimensionDefinition`. Protocol 2225 appended `Cloud Height` and
 * `Render Clouds` to every definition. A gate cannot reach inside a list item, so the whole
 * map is one gated field per layout, and `DimensionDataPacket` fills whichever one the
 * stamped protocol version puts on the wire.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/dimension-data-packet/
 */
import DimensionDefinition from '../../structure/DimensionDefinition';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { readDimensionDefinition, writeDimensionDefinition } from '../structures/DimensionDefinition';
import { protocolVersion as protocolVersion2193 } from '../versions/v2193';
import { protocolVersion as protocolVersion2225 } from '../versions/v2225';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type { PayloadOf } from '../define';

/** One entry of the `Definitions` map: the dimension identifier and its definition. */
export interface DimensionDataEntry {
    /** The map key: the dimension identifier, for example "minecraft:overworld". */
    id: string;
    /** The `DimensionDefinition` the key maps to. */
    definition: DimensionDefinition;
}

/**
 * A `DimensionDefinition` in the layout of one protocol version, as the structure class.
 * The two layouts differ in the trailing cloud fields, which the nested field list gates
 * itself, so each layout of the map names the version its entries are written at.
 */
const dimensionDefinitionAt = (protocolVersion: number) =>
    t.custom<DimensionDefinition>(
        'DimensionDefinition',
        (stream, value) => writeDimensionDefinition(stream, value, protocolVersion),
        (stream) => {
            const fields = readDimensionDefinition(stream, protocolVersion);
            return new DimensionDefinition(
                fields.minimumY,
                fields.heightRange,
                fields.generatorType,
                fields.dimensionType,
                fields.packId,
                fields.defaultBiome,
                fields.cloudHeight,
                fields.renderClouds
            );
        }
    );

/** `Definitions` with its entries in the layout of one protocol version. */
const definitionsAt = (protocolVersion: number) =>
    t.list(t.record({ id: t.string, definition: dimensionDefinitionAt(protocolVersion) }));

/** `Definitions` as protocol 2193 sends it: each definition ends at `Default Biome`. */
const definitions2193 = definitionsAt(protocolVersion2193);

/** `Definitions` as protocol 2225 sends it: each definition adds `Cloud Height` and `Render Clouds`. */
const definitions2225 = definitionsAt(protocolVersion2225);

/** The `DimensionDataPacket` field list; the module doc carries the wire provenance. */
export const dimensionDataPacket = definePacket('DimensionDataPacket', {
    /** `Definitions` in the 2193 layout; the packet class leaves it empty from 2225 on. */
    definitionsWithoutClouds: gated<DimensionDataEntry[]>(UNTIL_2225, definitions2193, []),
    /** `Definitions` in the 2225 layout; the packet class leaves it empty before 2225. */
    definitionsWithClouds: gated<DimensionDataEntry[]>(SINCE_2225, definitions2225, [])
});

/** Wire-shaped payload of `DimensionDataPacket`: the map under the key its layout travels as. */
export type DimensionDataLayoutPayload = PayloadOf<typeof dimensionDataPacket>;
