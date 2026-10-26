/**
 * What a behavior family is and how one becomes a `Behavior<BlockHooks>`.
 *
 * A family is a record of handlers, one per hook it implements. Each handler
 * receives the event, the world for the event block's dimension, and the
 * facts the block's own components carry. Resolving the dimension once per
 * event is the only thing this module adds over the registry's own shape, and
 * it is what keeps the dimension out of every family's code.
 */
import type {
    BlockBreakEvent,
    BlockEntityEvent,
    BlockEntityFallOnEvent,
    BlockEvent,
    BlockHookName,
    BlockHooks,
    BlockNeighborChangedEvent,
    BlockPlaceEvent,
    BlockPlayerInteractEvent,
    BlockRedstoneUpdateEvent,
    BlockStateChangeEvent,
    BlockStepOnEvent,
    BlockTickEvent
} from '@jsprismarine/blocks';
import { BLOCK_HOOK_NAMES, blockProperties } from '@jsprismarine/blocks';
import type { Behavior, BindContext, Definition } from '@jsprismarine/content';

import type { BlockProperties, BlockWorld, WorldActions } from './world';
import { DEFAULT_BLOCK_PROPERTIES } from './world';

/** What a family handler knows about the block type it was built for. */
export interface FamilyContext {
    /** The namespaced identifier of the block type, such as `minecraft:oak_door`. */
    readonly identifier: string;
    /** The definition the type resolved from, which the component readers go through. */
    readonly definition: Definition;
    /** The block's `jsprismarine:block_properties`, defaults filled in. */
    readonly properties: BlockProperties;
    /** Every dimension, for the families that reach across one. */
    readonly world: BlockWorld;
}

/** The handlers one family implements, keyed by hook name. */
export interface FamilyHandlers {
    readonly onPlace?: (event: BlockPlaceEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onBreak?: (event: BlockBreakEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onNeighborChanged?: (
        event: BlockNeighborChangedEvent,
        world: WorldActions,
        context: FamilyContext
    ) => void;
    readonly onRandomTick?: (event: BlockTickEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onTick?: (event: BlockTickEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onPlayerInteract?: (
        event: BlockPlayerInteractEvent,
        world: WorldActions,
        context: FamilyContext
    ) => boolean | undefined;
    readonly onStepOn?: (event: BlockStepOnEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onEntityFallOn?: (event: BlockEntityFallOnEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onEntity?: (event: BlockEntityEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onRedstoneUpdate?: (event: BlockRedstoneUpdateEvent, world: WorldActions, context: FamilyContext) => void;
    readonly onBlockStateChange?: (event: BlockStateChangeEvent, world: WorldActions, context: FamilyContext) => void;
}

/** One behavior family: a name in this project's namespace and its handlers. */
export interface BlockFamily {
    /** The name `behaviorFor` produces for the block identifiers this family covers. */
    readonly name: string;
    readonly handlers: FamilyHandlers;
    /** What the family does and what it leaves out, for the README table and for readers. */
    readonly summary: string;
}

/** Names a family. The hook list comes from the handlers, so the two cannot drift. */
export const defineFamily = (name: string, summary: string, handlers: FamilyHandlers): BlockFamily => ({
    name,
    summary,
    handlers
});

/** Every hook a family implements, in {@link BLOCK_HOOK_NAMES} order. */
export const familyHooks = (family: BlockFamily): readonly BlockHookName[] =>
    BLOCK_HOOK_NAMES.filter((hook) => family.handlers[hook] !== undefined);

/** Whether a value is a plain JSON object rather than an array or null. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `components` map of a block definition.
 *
 * The definition's `data` is parsed JSON the compiler cannot see into, so the
 * walk down to `minecraft:block.components` is guarded at every step and an
 * unexpected shape reads as a block with no components.
 */
export const componentsOf = (definition: Definition): Readonly<Record<string, unknown>> => {
    const data = definition.data;
    if (!isRecord(data)) return {};
    const block = data['minecraft:block'];
    if (!isRecord(block)) return {};
    const components = block['components'];
    return isRecord(components) ? components : {};
};

/** One component's raw value, or undefined when the block does not carry it. */
export const componentValue = (definition: Definition, name: string): unknown => componentsOf(definition)[name];

/**
 * The block's `jsprismarine:block_properties`.
 *
 * A block with no such component, or one whose value the schema rejects,
 * reads as {@link DEFAULT_BLOCK_PROPERTIES} rather than failing the load,
 * because a behavior that cannot run is worse than one running on Bedrock's
 * own defaults.
 */
export const blockPropertiesOf = (definition: Definition): BlockProperties => {
    const value = componentValue(definition, blockProperties.name);
    if (value === undefined) return DEFAULT_BLOCK_PROPERTIES;
    const parsed = blockProperties.schema(value);
    return parsed.ok ? parsed.value : DEFAULT_BLOCK_PROPERTIES;
};

/** Builds the context one family handler set runs against. */
export const familyContextOf = (bind: BindContext, world: BlockWorld): FamilyContext => ({
    identifier: bind.identifier,
    definition: bind.definition,
    properties: blockPropertiesOf(bind.definition),
    world
});

const bindHandlers = (handlers: FamilyHandlers, context: FamilyContext): Partial<BlockHooks> => {
    const actions = (event: BlockEvent): WorldActions => context.world.at(event.block.dimension);
    const bound: Partial<BlockHooks> = {};

    const {
        onPlace,
        onBreak,
        onNeighborChanged,
        onRandomTick,
        onTick,
        onPlayerInteract,
        onStepOn,
        onEntityFallOn,
        onEntity,
        onRedstoneUpdate,
        onBlockStateChange
    } = handlers;

    if (onPlace !== undefined) bound.onPlace = (event) => onPlace(event, actions(event), context);
    if (onBreak !== undefined) bound.onBreak = (event) => onBreak(event, actions(event), context);
    if (onNeighborChanged !== undefined) {
        bound.onNeighborChanged = (event) => onNeighborChanged(event, actions(event), context);
    }
    if (onRandomTick !== undefined) bound.onRandomTick = (event) => onRandomTick(event, actions(event), context);
    if (onTick !== undefined) bound.onTick = (event) => onTick(event, actions(event), context);
    if (onPlayerInteract !== undefined) {
        bound.onPlayerInteract = (event) => onPlayerInteract(event, actions(event), context);
    }
    if (onStepOn !== undefined) bound.onStepOn = (event) => onStepOn(event, actions(event), context);
    if (onEntityFallOn !== undefined) bound.onEntityFallOn = (event) => onEntityFallOn(event, actions(event), context);
    if (onEntity !== undefined) bound.onEntity = (event) => onEntity(event, actions(event), context);
    if (onRedstoneUpdate !== undefined) {
        bound.onRedstoneUpdate = (event) => onRedstoneUpdate(event, actions(event), context);
    }
    if (onBlockStateChange !== undefined) {
        bound.onBlockStateChange = (event) => onBlockStateChange(event, actions(event), context);
    }

    return bound;
};

/** Turns a family into the behavior `BehaviorRegistry.register` takes. */
export const familyBehavior = (family: BlockFamily, world: BlockWorld): Behavior<BlockHooks> => ({
    name: family.name,
    hooks: familyHooks(family),
    create: (bind) => bindHandlers(family.handlers, familyContextOf(bind, world))
});
