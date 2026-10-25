/**
 * Which builder lays out each of Java's sixteen structure types.
 *
 * The registry is the whole of the dispatch. A type with no row here generates nothing and is
 * reported through `StructureStartSource.unbuiltTypes`, so a missing structure is visible rather
 * than silent.
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

/** The sixteen `worldgen/structure` types Java 26.3 registers, and how many structures use each. */
export const STRUCTURE_TYPE_COUNTS: Readonly<Record<string, number>> = {
    'minecraft:jigsaw': 28,
    'minecraft:ruined_portal': 7,
    'minecraft:mineshaft': 2,
    'minecraft:ocean_ruin': 2,
    'minecraft:shipwreck': 2,
    'minecraft:buried_treasure': 1,
    'minecraft:desert_pyramid': 1,
    'minecraft:end_city': 1,
    'minecraft:fortress': 1,
    'minecraft:igloo': 1,
    'minecraft:jungle_temple': 1,
    'minecraft:nether_fossil': 1,
    'minecraft:ocean_monument': 1,
    'minecraft:stronghold': 1,
    'minecraft:swamp_hut': 1,
    'minecraft:woodland_mansion': 1
};

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
