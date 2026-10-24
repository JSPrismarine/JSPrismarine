/** A struct value, implicitly defined by usage such as `v.location.x = 1;`. */
export interface MolangStruct {
    kind: 'struct';
    members: Map<string, MolangValue>;
}

/**
 * A reference to another evaluation scope, used by the arrow operator and `this`. The engine's
 * actor references map to this: `context.other->query.remaining_durability` evaluates its right
 * side against the referenced scope.
 */
export interface MolangScopeRef {
    kind: 'scope';
    scope: MolangScope;
}

/** An actor array, as produced by queries the arrow and `for_each` constructs consume. */
export interface MolangArray {
    kind: 'array';
    elements: readonly MolangValue[];
}

/** A runtime Molang value. Numbers carry booleans as 0.0 and 1.0. */
export type MolangValue = number | string | MolangStruct | MolangScopeRef | MolangArray;

/** Entity state the entity queries read. Implement the members your entities can answer. */
export interface EntityContext {
    /** The warden's anger level, [0, n). */
    angerLevel?(): number;
    /** Armor pieces equipped, 0 to 5, hands excluded. */
    equipmentCount?(): number;
    /** Whether the entity was loaded from data saved with the named component group. */
    hadComponentGroup?(name: string): boolean;
    /** Whether the entity belongs to any of the given type families. */
    hasAnyFamily?(families: readonly string[]): boolean;
    /** Whether the entity's head is in water. */
    headIsInWater?(): boolean;
    isBaby?(): boolean;
    isOnGround?(): boolean;
    isUsingItem?(): boolean;
    /** Whether a player dealt the last hit. */
    lastHitByPlayer?(): boolean;
    /** The player's experience level, or 0 for non-players. */
    playerLevel?(): number;
    /** The value of the named entity property, or undefined when it does not exist. */
    property?(name: string): number | string | undefined;
    /** The entity's variant index. */
    variant?(): number;
    /** Read-write `variable.*` storage on the entity; not persisted. */
    variables?: Map<string, MolangValue>;
}

/** Block permutation state for `query.block_state` and tag queries on blocks. */
export interface BlockContext {
    /** The value of the named block state, or undefined when the permutation lacks it. */
    blockState?(name: string): number | string | boolean | undefined;
    /** The block's tags, for `query.any_tag` and `query.all_tags`. */
    tags?(): readonly string[];
}

/** Item stack state for the durability and tag queries. */
export interface ItemContext {
    maxDurability?(): number;
    remainingDurability?(): number;
    /** The item's tags, for `query.any_tag` and `query.all_tags`. */
    tags?(): readonly string[];
}

/** Level state the world queries read. */
export interface WorldContext {
    /** Time of day in [0, 1): midnight 0.0, sunrise 0.25, noon 0.5, sunset 0.75. */
    timeOfDay?(): number;
    day?(): number;
    moonPhase?(): number;
    moonBrightness?(): number;
    timeStamp?(): number;
}

/** Feature placement state for the worldgen queries. */
export interface PlacementContext {
    /** The world-surface height (Y) at (x, z). */
    heightmap?(x: number, z: number): number;
    /** The height of the block above the highest solid block at (x, z). */
    aboveTopSolid?(x: number, z: number): number;
    /** A Perlin noise value near [-1, 1] for (x, z). */
    noise?(x: number, z: number): number;
    /** Whether the biome at the placement position (or the given one) has the tag. */
    hasBiomeTag?(tag: string, x?: number, y?: number, z?: number): boolean;
}

/**
 * Everything one evaluation can see. Queries declare which of these members they need; the
 * compiler reports a query bound against a scope that was declared without its context.
 */
export interface MolangScope {
    entity?: EntityContext;
    block?: BlockContext;
    item?: ItemContext;
    world?: WorldContext;
    placement?: PlacementContext;
    /** Read-only values the game supplies for the expression, such as `context.other`. */
    context?: ReadonlyMap<string, MolangValue>;
    /** `variable.*` storage when no entity carries it, as for feature-rule engine variables. */
    variables?: Map<string, MolangValue>;
}
