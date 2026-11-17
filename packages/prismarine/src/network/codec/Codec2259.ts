import { jigsaw_structure_data } from '@jsprismarine/bedrock-data';
import { biome_definitions_network, block_definitions, entity_identifiers } from '@jsprismarine/bedrock-data/v2259';
import { createProtocolCodec, ProtocolVersions } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';

import { itemData2259 } from './itemData';

/** Server-configured codec for the Minecraft Preview protocol 2259, with the tables captured for BDS 1.26.70.24. */
const Codec2259 = createProtocolCodec({
    definition: ProtocolVersions.v2259,
    context: {
        protocolVersion: ProtocolVersions.v2259.protocolVersion,
        itemData: itemData2259,
        blockDefinitions: block_definitions,
        entityIdentifiers: entity_identifiers,
        biomeDefinitions: biome_definitions_network,
        jigsawStructureData: jigsaw_structure_data
    } satisfies ProtocolContext
});

export { Codec2259 };
export default Codec2259;
