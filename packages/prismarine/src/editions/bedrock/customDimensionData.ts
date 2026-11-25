import DimensionDataPacket from '@jsprismarine/protocol/bedrock/packet/DimensionDataPacket';
import DimensionDefinition from '@jsprismarine/protocol/bedrock/structure/DimensionDefinition';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Level } from '../../world/Level';

/**
 * The `DimensionData` that tells the client about the level's custom dimension types, or
 * undefined for a level of vanilla dimensions, which the client knows without it.
 *
 * One entry per custom type, keyed by the type's name, with the bounds and the id from
 * 1000 up that the level chose. The cloud fields go on the wire only when the connection
 * encodes the packet at protocol 2225 or later; the definition carries them either way.
 * Sent before the chunks so the client has the bounds when the first `LevelChunk` with
 * that dimension id arrives. Whether a client accepts an id of 1000 or more has not been
 * checked against a real client.
 */
export const customDimensionData = (level: Level): DimensionDataPacket | undefined => {
    const definitions = level.customDimensionDefinitions();
    if (definitions.length === 0) return undefined;

    const types = [...level.getDimensionTypes().values()];
    return new DimensionDataPacket({
        definitions: definitions.map((fields) => {
            const type = types.find((candidate) => candidate.bedrockId === fields.dimensionType);
            if (type === undefined) {
                throw new PrismarineNetworkErrors.DimensionWithoutType({
                    name: level.getName(),
                    dimensionType: fields.dimensionType
                });
            }

            return {
                id: type.name,
                definition: new DimensionDefinition(
                    fields.minimumY,
                    fields.heightRange,
                    fields.generatorType,
                    fields.dimensionType,
                    fields.packId,
                    fields.defaultBiome,
                    fields.cloudHeight,
                    fields.renderClouds
                )
            };
        })
    });
};
