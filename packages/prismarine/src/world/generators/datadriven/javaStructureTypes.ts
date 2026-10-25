/**
 * Which builder lays out each of Java's sixteen structure types.
 *
 * The registry is the whole of the dispatch. A type with no row here generates nothing and is
 * reported through `StructureStartSource.unbuiltTypes`, so a missing structure is visible rather
 * than silent. Fourteen of the sixteen are here; the end city and the nether fortress are not,
 * and neither has a dimension to generate in.
 */
import { buildJigsawStructure } from './javaStructureJigsaw';
import { buildIgloo, buildNetherFossil, buildOceanRuin, buildShipwreck } from './javaStructureLegacyTemplates';
import { buildWoodlandMansion } from './javaStructureMansion';
import { buildMineshaft } from './javaStructureMineshaft';
import { buildOceanMonument } from './javaStructureOceanMonument';
import { buildRuinedPortal } from './javaStructureRuinedPortal';
import { buildBuriedTreasure, buildDesertPyramid, buildJungleTemple, buildSwampHut } from './javaStructureScattered';
import { buildStronghold } from './javaStructureStronghold';
import type { StructureBuilder } from './javaStructureStarts';

/** The builder for each structure type this server generates. */
export const STRUCTURE_BUILDERS: ReadonlyMap<string, StructureBuilder> = new Map<string, StructureBuilder>([
    ['minecraft:jigsaw', buildJigsawStructure],
    ['minecraft:buried_treasure', buildBuriedTreasure],
    ['minecraft:desert_pyramid', buildDesertPyramid],
    ['minecraft:igloo', buildIgloo],
    ['minecraft:jungle_temple', buildJungleTemple],
    ['minecraft:mineshaft', buildMineshaft],
    ['minecraft:nether_fossil', buildNetherFossil],
    ['minecraft:ocean_monument', buildOceanMonument],
    ['minecraft:ocean_ruin', buildOceanRuin],
    ['minecraft:ruined_portal', buildRuinedPortal],
    ['minecraft:shipwreck', buildShipwreck],
    ['minecraft:stronghold', buildStronghold],
    ['minecraft:swamp_hut', buildSwampHut],
    ['minecraft:woodland_mansion', buildWoodlandMansion]
]);
