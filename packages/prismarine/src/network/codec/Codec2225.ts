import { Codec2193 } from './Codec2193';
import { itemData2225 } from './itemData';
import { minecraftVersions, packetIds, protocolVersion } from '@jsprismarine/protocol/wire/versions/v2225';
import { biome_definitions_network, block_definitions } from '@jsprismarine/bedrock-data/v2225';
import { entity_identifiers, jigsaw_structure_data } from '@jsprismarine/bedrock-data';

import type { ProtocolContext } from '@jsprismarine/protocol';

/**
 * The codec for protocol 2225 (Minecraft 1.26.60): the first delta codec, carrying only what
 * moved since 2193. The id table is 2193's plus the eight packets 1.26.60 added; the packets
 * whose wire layout changed carry the difference as data in their declarative definitions
 * and read the protocol stamp, so nothing else is overridden here.
 * docs/research/protocol-2225-delta.md records the full delta, what of it is implemented,
 * and the sources each change was verified against.
 */
class Codec2225 extends Codec2193 {
    public override readonly protocolVersion = protocolVersion;
    public override readonly minecraftVersions = minecraftVersions;
    public override readonly ids = packetIds;
    public override readonly itemData = itemData2225;
    public override readonly context: ProtocolContext = {
        protocolVersion,
        itemData: itemData2225,
        blockDefinitions: block_definitions,
        entityIdentifiers: entity_identifiers,
        biomeDefinitions: biome_definitions_network,
        jigsawStructureData: jigsaw_structure_data
    };

    public override netIdOf(name: string): number | undefined {
        return this.ids[name];
    }
}

export default new Codec2225();
