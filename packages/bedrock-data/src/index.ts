import block_definitions_data from './jsp/block_definitions';
import { creative_groups, creativeitems } from './generated/creativeitems';
import item_components_data from './generated/item_components.json';
import item_table_data from './generated/item_table.json';
import legacy_item_aliases_data from './vendor/r16_to_current_item_map.json';
import item_tags_data from './vendor/item_tags.json';

export type { CreativeGroupEntry, CreativeItemEntry } from './generated/creativeitems';

/** One item as the item table names it. */
export interface ItemTypeEntry {
    /** The numeric id the client will know this name by. Negative for a block's item form. */
    runtime_id: number;
    /** Whether the item is defined by components rather than being one the client already knows. */
    component_based: boolean;
    /**
     * `Item Version` as `ItemRegistryPacket` carries it: 0 `Legacy`, 1 `DataDriven`, 2 `None`.
     *
     * A `DataDriven` item is one the client builds from {@link item_components}; a Bedrock
     * Dedicated Server sends 31 vanilla items that way (the bundles, the spears, the trial keys,
     * the apple). Most vanilla items are `None`, including 44 that are `component_based` and
     * still travel with an empty compound, such as the arrow, the cake and the music discs.
     */
    version: number;
}

/**
 * The item table: every name the client can be told about, and the number it travels as.
 *
 * The authority on the mapping - the client builds its registry from what we send, so
 * everything naming an item has to agree with this one file.
 *
 * Captured from the Bedrock Dedicated Server `sources.json` names as the default, not taken from
 * a third party: the server sends it as `ItemRegistryPacket`, so a client that can log in can
 * simply record it. Each protocol version's own table is in its `v<protocol>` module.
 * `packages/client/tools/capture-server-data.mjs` is that client, and its output is
 * `jsp/v<protocol>/required_item_list.json`.
 *
 * That file records no `version`. `utils/build.js` takes the column from the same capture's
 * `ItemRegistryPacket` payload, `jsp/v<protocol>/wire/0xa2.bin`, and refuses to generate the
 * table unless the two agree on every name, id and component flag.
 *
 * The version matters more than it looks. Against the 1.21.40 table this has 240 names it did
 * not, and - the part that breaks quietly - **528 items whose number changed**. A server on
 * the old table does not fail; it puts the wrong number on the wire for a quarter of the
 * items it knows, and the client shows something else.
 */
export const item_table: Record<string, ItemTypeEntry> = item_table_data;

/**
 * Item name to its `Item Component Data`, as network NBT, for every item that has any.
 *
 * A Bedrock Dedicated Server sends 78 vanilla items with a non-empty compound: the 31
 * `DataDriven` entries of {@link item_table}, which the client cannot build without one, and
 * 47 foods that are not `component_based` yet carry their `minecraft:food` values anyway. Every
 * other item travels with the empty compound, and is absent here.
 *
 * Copied by `utils/build.js` from the `ItemRegistryPacket` payload the item table was captured
 * with, as the network NBT the server sent, so a server writes the bytes to the wire as they are.
 */
export const item_components: Readonly<Record<string, Buffer>> = Object.fromEntries(
    Object.entries(item_components_data).map(([name, data]) => [name, Buffer.from(data, 'base64')])
);

/** Legacy Bedrock item identifiers still used by vanilla definitions, mapped to current names. */
export const legacy_item_aliases: Readonly<Record<string, string>> = legacy_item_aliases_data.simple;

/** Legacy Bedrock item identifiers whose auxiliary value selects a current item name. */
export const legacy_item_aux_aliases: Readonly<Record<string, Readonly<Record<string, string>>>> =
    legacy_item_aliases_data.complex;

/** A vanilla block the client only knows if the server declares it. */
export interface BlockDefinitionEntry {
    name: string;
    /** The definition as network NBT, exactly as a Bedrock Dedicated Server sends it. */
    definition: Buffer;
}

/**
 * The data driven vanilla blocks, and the definitions a client needs to draw them.
 *
 * Since 1.26.50 vanilla defines some of its own blocks in data rather than in the client -
 * the wool stairs and slabs, the concrete slabs - and a server has to declare them in
 * `StartGamePacket` the way it would a plugin's. Captured from the same server as the item
 * table, by the same tool; each definition is handed back to the wire verbatim.
 */
export const block_definitions: readonly BlockDefinitionEntry[] = block_definitions_data.blocks.map((block) => ({
    name: block.name,
    definition: Buffer.from(block.definition, 'base64')
}));

export {
    // The headings of the creative menu, and the entries filed under them. `CreativeItemEntry.group`
    // indexes this list, so the two travel together or neither means anything.
    creative_groups,
    creativeitems
};

/**
 * Tag name to the items carrying it.
 *
 * A recipe may ask for "any plank" rather than name the thirteen, and this is the only place
 * that question has an answer. Typed by the question rather than by the file: a caller asks
 * about a tag name a recipe gave it, which is a string and not one of the 77 keys the JSON
 * happens to hold.
 */
export const item_tags: Readonly<Record<string, readonly string[]>> = item_tags_data;

import biome_definitions_network_data from './generated/biome_definitions_network.json';
import entity_identifiers_data from './generated/entity_identifiers.json';
import jigsaw_structure_data_data from './generated/jigsaw_structure_data.json';

const toBuffer = ({ data }: { data: string }) => Buffer.from(data, 'base64');

/**
 * Every actor type a client may be asked to render, as `AvailableActorIdentifiersPacket`
 * carries it: one network NBT compound holding an `idlist`, replayed verbatim.
 */
export const entity_identifiers: Buffer = toBuffer(entity_identifiers_data);

/**
 * The jigsaw structure rules, as `JigsawStructureDataPacket` carries them: one network NBT
 * compound, the payload of the packet the default version's Bedrock Dedicated Server sent. A
 * client refuses to join a server that has not sent this before `StartGamePacket`.
 */
export const jigsaw_structure_data: Buffer = toBuffer(jigsaw_structure_data_data);

/**
 * The vanilla biome definitions, as `BiomeDefinitionListPacket` carries them: the whole payload
 * of the packet the default version's Bedrock Dedicated Server sends, replayed verbatim.
 *
 * At 1.26.x the packet became a map of biome data plus a shared string table the entries index
 * into. An empty one is no longer enough - a client reaches the world-generation screen with no
 * biomes and gives up - so a server that generates any world has to send the real thing.
 */
export const biome_definitions_network: Buffer = toBuffer(biome_definitions_network_data);

import java_entity_attributes_data from './jsp/java/entity_attributes';
import java_entity_navigation_data from './jsp/java/entity_navigation';
import java_entity_goals_data from './jsp/java/entity_goals';

/** One Java entity type's hitbox, the attributes its class declares and its peaceful rule. */
export interface JavaEntityAttributes {
    /** The `MobCategory` the class belongs to, such as `monster` or `creature`. */
    category: string;
    /**
     * Java's `EntityType.isAllowedInPeaceful`: false for a type built with `notInPeaceful()`,
     * which `Mob.checkDespawn` discards while the world is on peaceful.
     */
    allowedInPeaceful: boolean;
    /** The hitbox width in blocks, which Bedrock writes as `minecraft:collision_box.width`. */
    width: number;
    /** The hitbox height in blocks, which Bedrock writes as `minecraft:collision_box.height`. */
    height: number;
    /** Java attribute id to its base value, such as `minecraft:max_health`. */
    attributes: Record<string, number>;
}

/**
 * Every attribute Java Edition's entity classes declare, by entity type.
 *
 * 2619 values over 93 types, dumped from the pinned unobfuscated 26.3 server jar by
 * `utils/java-dump/run.mjs`. Bedrock publishes the same stats as entity components, so this is
 * what a cross-edition check compares those components against; the two editions genuinely
 * differ on some of them, which is a finding rather than a defect.
 */
export const java_entity_attributes: Record<string, JavaEntityAttributes> = java_entity_attributes_data;

/** One Java mob's navigation, path costs, and entity-push behavior. */
export interface JavaEntityNavigationEntry {
    /** The Java path-navigation class instantiated for the entity type. */
    navigationClass: string;
    /** Whether Java's registered goals enabled floating through liquid. */
    canFloat: boolean;
    /** Whether Java's navigator can follow paths on solid ground. */
    canNavigateGround: boolean;
    /** Whether Java's node evaluator routes through closed wooden doors, which the mob opens. */
    canOpenDoors: boolean;
    /** Whether Java's node evaluator routes through open doors. */
    canPassDoors: boolean;
    /** Whether Java's node evaluator treats fences and walls as a step rather than a wall. */
    canWalkOverFences: boolean;
    /** The Java move-control class the mob turns and steers with. */
    moveControlClass: string;
    /** The degrees a `SmoothSwimmingMoveControl` turns the body each tick, present only for one. */
    maxTurnY?: number;
    /** Whether Java lets this living entity push and be pushed by other entities. */
    pushable: boolean;
    /** Java's per-`PathType` route cost, with negative values marking blocked terrain. */
    pathfindingMalus: Record<string, number>;
}

/** The path navigation Java's mob classes construct, keyed by Java entity identifier. */
export const java_entity_navigation: Record<string, JavaEntityNavigationEntry> = java_entity_navigation_data;

/**
 * One argument a Java goal was constructed with. A number or string is the constant itself. A
 * class literal lists every entity type whose class is, or extends, it. A predicate lambda lists
 * the item tags and items its code reads. `null` is a value the capture could not resolve.
 */
export type JavaGoalArgument =
    | number
    | string
    | null
    | { readonly class: string; readonly entities: readonly string[] }
    | { readonly field: string }
    | {
          readonly lambda: string | null;
          readonly itemTags?: readonly string[];
          readonly items?: readonly string[];
      }
    | { readonly array: readonly JavaGoalArgument[] }
    | { readonly call: string; readonly args: readonly JavaGoalArgument[] }
    | { readonly object: string };

/** One goal a Java mob registers in `registerGoals` or a method it calls. */
export interface JavaEntityGoal {
    /** The vanilla goal class it is, by simple name, such as `LookAtPlayerGoal`. */
    readonly goal: string;
    /** Every class from the one constructed down to `Goal`, by simple name, such as `Fox$FoxPanicGoal`. */
    readonly classes: readonly string[];
    /** Which selector it was added to: `goal` or `target`. */
    readonly selector: string;
    /** The priority it was added with, or null when that was not a constant. */
    readonly priority: number | null;
    /** Each named constructor parameter along the chain, with the value the vanilla class ends up with. */
    readonly params: Readonly<Record<string, JavaGoalArgument | undefined>>;
    /** The instance methods called on the goal after construction, such as `setAlertOthers`. */
    readonly calls: readonly { readonly name: string; readonly args: readonly JavaGoalArgument[] }[];
    /**
     * On a goal that calls `setAlertOthers`, the entity types whose class is, or extends, the class
     * of the mob that registers it: what `HurtByTargetGoal.alertOthers` searches with
     * `getEntitiesOfClass(mob.getClass(), ...)`.
     */
    readonly selfEntities?: readonly string[];
}

/**
 * The goals each Java mob registers, with the arguments it passes them, keyed by Java entity
 * identifier. `utils/java-goals/run.ts` reads them out of the pinned server jar's bytecode; a mob
 * whose AI is a brain, or that registers no goals, is absent.
 */
export const java_entity_goals: Readonly<Record<string, readonly JavaEntityGoal[]>> = java_entity_goals_data;
