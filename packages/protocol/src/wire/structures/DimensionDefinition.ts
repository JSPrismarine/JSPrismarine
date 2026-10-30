/**
 * The docs' `DimensionDefinition`: the height bounds, generator and sky of one data-driven
 * dimension, as `DimensionDataPacket` lists them, described as a declarative field list.
 *
 * Field names and order follow the schema's `x-ordinal-index`. Protocol 2225 appended
 * `Cloud Height` (ordinal 6) and `Render Clouds` (ordinal 7), verified against the v1.26.60
 * `metadata.zip` (`DimensionDefinition.json`) side by side with the v1.26.51 one, which ends
 * at `Default Biome` (ordinal 5). Nothing before them changed.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/dimension-definition/}
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { layoutAt } from '../WireLayout';
import { SINCE_2225 } from '../wireGates';
import { protocolVersion as protocolVersion2193 } from '../versions/v2193';
import UUID from '../../structure/UUID';

import type BinaryStream from '@jsprismarine/binaryutils';
import type { PayloadOf } from '../define';

/** `mce::UUID` as the `structure/UUID` of two unsigned 64-bit halves, which `Pack Id` has always been. */
const packId = t.custom<UUID>(
    'mce::UUID',
    (stream, value) => {
        stream.writeUnsignedLongLE(value.most);
        stream.writeUnsignedLongLE(value.least);
    },
    (stream) => new UUID(stream.readUnsignedLongLE(), stream.readUnsignedLongLE())
);

/** The `DimensionDefinition` field list; the module doc carries the wire provenance. */
export const dimensionDefinition = definePacket('DimensionDefinition', {
    /** `Minimum Y`: the lowest block y of the dimension. */
    minimumY: t.varint32,
    /** `Height Range`: how many blocks sit above `Minimum Y`. */
    heightRange: t.varint32,
    /** `Generator Type`: a `Generator` value (0 Legacy, 1 Overworld, 2 Flat, 3 Nether, 4 TheEnd, 5 Void, 6 Undefined). */
    generatorType: t.varint32,
    /** `Dimension Type`: the dimension's runtime id. Vanilla uses 0 to 2; custom dimensions count from 1000. */
    dimensionType: t.varint32,
    /** `Pack Id`: the behavior pack that registered the dimension. */
    packId,
    /** `Default Biome`: the biome identifier the dimension generates with. */
    defaultBiome: t.string,
    /** `Cloud Height`: the block y clouds render at; 2225 on. */
    cloudHeight: gated(SINCE_2225, t.varint32, 0),
    /** `Render Clouds`: whether the dimension draws clouds at all; 2225 on. */
    renderClouds: gated(SINCE_2225, t.bool, false)
});

/** The fields of one `DimensionDefinition`, the same shape at every protocol version. */
export type DimensionDefinitionFields = PayloadOf<typeof dimensionDefinition>;

/**
 * Writes a `DimensionDefinition` in the layout of the given protocol version.
 * @param stream - The stream to write to.
 * @param value - The definition's fields.
 * @param protocolVersion - The negotiated protocol version; defaults to 2193.
 */
export const writeDimensionDefinition = (
    stream: BinaryStream,
    value: DimensionDefinitionFields,
    protocolVersion = protocolVersion2193
): void => {
    layoutAt(dimensionDefinition, protocolVersion).encode(stream, value);
};

/**
 * Reads a `DimensionDefinition` in the layout of the given protocol version, the mirror of
 * {@link writeDimensionDefinition}. Fields the version leaves off the wire take their
 * fallbacks, so a 2193 read still yields `cloudHeight` and `renderClouds`.
 * @param stream - The stream to read from.
 * @param protocolVersion - The negotiated protocol version; defaults to 2193.
 */
export const readDimensionDefinition = (
    stream: BinaryStream,
    protocolVersion = protocolVersion2193
): DimensionDefinitionFields => layoutAt(dimensionDefinition, protocolVersion).decode(stream);
