import {
    biome_definitions_network,
    block_definitions,
    entity_identifiers,
    jigsaw_structure_data
} from '@jsprismarine/bedrock-data/v2225';
import { createProtocolCodec, ProtocolVersions } from '@jsprismarine/protocol';
import type { ProtocolContext } from '@jsprismarine/protocol';

import { itemData2225 } from './itemData';

/** Server-configured protocol 2225 codec with the tables captured from protocol 2225's pinned BDS. */
const Codec2225 = createProtocolCodec({
    definition: ProtocolVersions.v2225,
    context: {
        protocolVersion: ProtocolVersions.v2225.protocolVersion,
        itemData: itemData2225,
        blockDefinitions: block_definitions,
        entityIdentifiers: entity_identifiers,
        biomeDefinitions: biome_definitions_network,
        jigsawStructureData: jigsaw_structure_data
    } satisfies ProtocolContext
});

export { Codec2225 };
export default Codec2225;
