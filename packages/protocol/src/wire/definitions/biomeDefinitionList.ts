/**
 * `BiomeDefinitionListPacket` described as a declarative field list; layout unchanged between
 * protocols 2193 and 2225.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/biome-definition-list-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * Both payload fields - `Map of Biome names to data` and `String list` - carried opaque to the
 * end of the packet. This server defines no custom biomes and replays a captured vanilla
 * payload verbatim; modeling the map field by field would only create ways to disagree with
 * the client about a blob that is identical for every server of this version.
 */
const biomeDefinitionsTail = t.custom<Buffer>(
    'BiomeDefinitionsTail',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/**
 * The `BiomeDefinitionListPacket` field list: every biome the client can render. A client
 * that reaches the world-generation screen with an empty list disconnects.
 */
export const biomeDefinitionListPacket = definePacket('BiomeDefinitionListPacket', {
    /** The biome map and its string list as the network carries them; see {@link biomeDefinitionsTail}. */
    definitions: biomeDefinitionsTail
});
