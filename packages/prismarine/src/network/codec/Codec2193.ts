import {
    biome_definitions_network,
    block_definitions,
    entity_identifiers,
    jigsaw_structure_data
} from '@jsprismarine/bedrock-data';
import { createProtocolCodec, ProtocolVersions } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';

import { itemData2193 } from './itemData';

/** Server-configured protocol 2193 codec with the tables captured from BDS 1.26.51.1. */
const Codec2193 = createProtocolCodec({
    definition: ProtocolVersions.v2193,
    context: {
        protocolVersion: ProtocolVersions.v2193.protocolVersion,
        itemData: itemData2193,
        blockDefinitions: block_definitions,
        entityIdentifiers: entity_identifiers,
        biomeDefinitions: biome_definitions_network,
        jigsawStructureData: jigsaw_structure_data
    } satisfies ProtocolContext
});

export { Codec2193 };
export default Codec2193;
