/**
 * The adapter from the content's behavior registries to the custom components behavior pack
 * scripts register ([script-api-host.md](../../../../docs/plans/script-api-host.md) slice 11).
 *
 * A block or item names a custom component in its pack JSON: a version 2 file as a key of its
 * components with the component's parameters, an older one in `minecraft:custom_components`.
 * The content resolves before any script runs, so one behavior, `jsprismarine:script_components`,
 * attaches to every type that names one and forwards each hook through the same dispatch the
 * TypeScript behaviors run on, to whichever {@link ScriptComponentSink} the scripts bind later.
 * Placing and removing a block are not hooks a behavior sees for every write, so those two come
 * from the world's own block writes, where a command's, a script's and a player's all land.
 */
import type { BlockFace, BlockHooks, HookActor, HookBlock } from '@jsprismarine/blocks/hooks';
import type { BehaviorRegistry } from '@jsprismarine/content/behaviors';
import type { Definition } from '@jsprismarine/content/definitions';
import type { ItemHooks, ItemSource } from '@jsprismarine/items/hooks';
import type { ItemStack } from '@jsprismarine/items/ItemStack';
import type {
    ScriptBlockHookEvent,
    ScriptBlockLocation,
    ScriptBlockPermutation,
    ScriptComponentSink,
    ScriptComponentUse,
    ScriptDirection,
    ScriptEntityRef,
    ScriptItemHookEvent
} from '@jsprismarine/script-host/host/world';

import { isRecord } from '../utils/isRecord';
import type { BlockWriteListener } from '../world/World';

/** The behavior name the adapter registers under in both registries. */
export const SCRIPT_COMPONENTS_BEHAVIOR = 'jsprismarine:script_components';

/** Namespaces whose components are the engine's, never a script's. */
const ENGINE_NAMESPACES: ReadonlySet<string> = new Set(['minecraft', 'jsprismarine', 'tag']);

const SCRIPT_DIRECTIONS: Readonly<Record<BlockFace, ScriptDirection>> = {
    down: 'Down',
    up: 'Up',
    north: 'North',
    south: 'South',
    west: 'West',
    east: 'East'
};

/** When a block with `minecraft:tick` ticks: its interval, in ticks, and whether it keeps ticking. */
export interface TickInterval {
    readonly min: number;
    readonly max: number;
    readonly looping: boolean;
}

/** What a type that names custom components carries: the components, and its tick when it has one. */
export interface ScriptComponentType {
    readonly uses: readonly ScriptComponentUse[];
    readonly tick?: TickInterval;
}

/** The custom components one components map names, in the order it names them. */
const usesIn = (components: unknown): ScriptComponentUse[] => {
    if (!isRecord(components)) return [];
    const uses: ScriptComponentUse[] = [];
    for (const [name, params] of Object.entries(components)) {
        if (name === 'minecraft:custom_components') {
            if (!Array.isArray(params)) continue;
            for (const legacy of params) if (typeof legacy === 'string') uses.push({ name: legacy, legacy: true });
            continue;
        }
        const colon = name.indexOf(':');
        if (colon <= 0 || ENGINE_NAMESPACES.has(name.slice(0, colon))) continue;
        uses.push({ name, params });
    }
    return uses;
};

/**
 * Reads the custom components a block or item definition names, and its tick.
 *
 * A block's permutations add theirs to its own, so a component one permutation names runs for
 * every state of the block.
 * @param root - The definition's top-level key, `minecraft:block` or `minecraft:item`.
 * @returns Undefined for a definition that names none.
 */
export const scriptComponentType = (definition: Definition, root: string): ScriptComponentType | undefined => {
    const body = isRecord(definition.data) ? definition.data[root] : undefined;
    if (!isRecord(body)) return undefined;
    const permutations = Array.isArray(body.permutations) ? body.permutations : [];
    const uses = [
        ...usesIn(body.components),
        ...permutations.flatMap((permutation: unknown) => (isRecord(permutation) ? usesIn(permutation.components) : []))
    ].filter((use, index, all) => all.findIndex((other) => other.name === use.name) === index);
    if (uses.length === 0) return undefined;
    const tick = isRecord(body.components) ? body.components['minecraft:tick'] : undefined;
    const range = isRecord(tick) && Array.isArray(tick.interval_range) ? tick.interval_range : undefined;
    const [min, max] = range ?? [];
    return {
        uses,
        ...(typeof min === 'number' && typeof max === 'number'
            ? { tick: { min, max, looping: !isRecord(tick) || tick.looping !== false } }
            : {})
    };
};

const locationOf = (block: HookBlock): ScriptBlockLocation => ({ dimension: block.dimension, ...block.position });

const permutationOf = (block: { readonly identifier: string; readonly states: HookBlock['states'] }) =>
    ({ typeId: block.identifier, states: { ...block.states } }) satisfies ScriptBlockPermutation;

const actorOf = (actor: HookActor | undefined): ScriptEntityRef | undefined =>
    actor?.entityId === undefined ? undefined : { id: actor.entityId, typeId: actor.identifier };

const sourceOf = (source: ItemSource): ScriptEntityRef => ({ id: String(source.runtimeId), typeId: source.identifier });

/**
 * Schedules a block's next tick somewhere from `min` to `max` ticks away, which the server does
 * through its own scheduled ticks and random, so a replay ticks the block on the same ticks.
 */
export type TickScheduler = (block: ScriptBlockLocation, min: number, max: number) => void;

/** One level's scripts, which the bridge sends that level's hooks to. */
export interface BoundScriptLevel {
    /** The level's name, as a hook's block names it. */
    readonly name: string;
    /** Whether it is the default level, which a hook that names no level is in. */
    readonly isDefault: boolean;
    /** Whether an entity is in the level, by runtime id: an item hook goes to its user's level. */
    readonly ownsEntity: (runtimeId: string) => boolean;
    /** How a block with `minecraft:tick` in the level schedules its ticks. */
    readonly scheduler?: TickScheduler;
}

/** What a bridge used by one level only binds: the default level, which owns every entity. */
const ONLY_LEVEL: BoundScriptLevel = { name: '', isDefault: true, ownsEntity: () => true };

/**
 * Where the content's adapter behaviors send hooks, and where each level's scripts bind their sink
 * once they have registered their components. The content is the server's, so one bridge serves
 * every level: a block hook goes to the level its block names, and an item hook to the level of
 * the entity that used the item. Until a level's scripts bind, and with no script host, that
 * level's hooks are dropped at the cost of one check.
 */
export class ScriptComponentBridge {
    private readonly levels = new Map<
        string,
        { readonly sink: ScriptComponentSink; readonly level: BoundScriptLevel }
    >();
    private readonly blocks = new Map<string, ScriptComponentType>();

    /**
     * Sends a level's hooks to `sink` from now on.
     * @param level - The level the scripts run in; left out, the one level of a single-level server.
     * @returns A function that stops it.
     */
    public bind(sink: ScriptComponentSink, level: BoundScriptLevel = ONLY_LEVEL): () => void {
        const bound = { sink, level };
        this.levels.set(level.name, bound);
        return () => {
            if (this.levels.get(level.name) === bound) this.levels.delete(level.name);
        };
    }

    /** The scripts of the level a hook names, or of the default level when it names none. */
    private boundTo(level: string | undefined) {
        if (level !== undefined) {
            const named = this.levels.get(level);
            if (named !== undefined) return named;
        }
        for (const bound of this.levels.values()) {
            if (bound.level.isDefault && (level === undefined || bound.level.name === '')) return bound;
        }
        return undefined;
    }

    /** Records a block type that names custom components, which the block writes are checked against. */
    public addBlock(identifier: string, type: ScriptComponentType): void {
        this.blocks.set(identifier, type);
    }

    /**
     * Raises a block hook in a level's scripts.
     * @param level - The level the block is in, as its {@link HookBlock} names it.
     * @returns Whether a script canceled it.
     */
    public block(event: ScriptBlockHookEvent, level?: string): boolean {
        const sink = this.boundTo(level)?.sink;
        if (sink === undefined || !sink.handlesBlock(event.components, event.hook)) return false;
        return sink.block(event);
    }

    /** Raises an item hook in the scripts of the level of the entity that used the item. */
    public item(event: ScriptItemHookEvent): void {
        const owner =
            [...this.levels.values()].find((bound) => bound.level.ownsEntity(event.source.id)) ??
            this.boundTo(undefined);
        const sink = owner?.sink;
        if (sink === undefined || !sink.handlesItem(event.components, event.hook)) return;
        sink.item(event);
    }

    /** Whether a level's scripts registered one of the components with the hook. */
    public handlesBlock(
        uses: readonly ScriptComponentUse[],
        hook: ScriptBlockHookEvent['hook'],
        level?: string
    ): boolean {
        return this.boundTo(level)?.sink.handlesBlock(uses, hook) === true;
    }

    /** Schedules the next tick of a block with `minecraft:tick` in a level, somewhere in its interval. */
    public scheduleTick(block: ScriptBlockLocation, tick: TickInterval, level?: string): void {
        this.boundTo(level)?.level.scheduler?.(block, tick.min, Math.max(tick.min, tick.max));
    }

    /**
     * The listener for one world's block writes: `onBreak` for a block that names custom
     * components and is gone, then `onPlace` for one that arrives, which also starts its ticks.
     * @param dimension - The world's dimension, as the scripts name it.
     * @param level - The world's level; left out, the default level.
     */
    public blockWrites(dimension: string, level?: string): BlockWriteListener {
        return (at, previous, next) => {
            if (this.boundTo(level) === undefined || previous.name === next.name) return;
            const block: ScriptBlockLocation = { dimension, ...at };
            const before = this.blocks.get(previous.name);
            if (before !== undefined) {
                this.block(
                    {
                        hook: 'onBreak',
                        components: before.uses,
                        block,
                        brokenBlockPermutation: { typeId: previous.name, states: { ...previous.states } }
                    },
                    level
                );
            }
            const after = this.blocks.get(next.name);
            if (after === undefined) return;
            this.block(
                {
                    hook: 'onPlace',
                    components: after.uses,
                    block,
                    previousBlock: { typeId: previous.name, states: { ...previous.states } }
                },
                level
            );
            if (after.tick !== undefined && this.handlesBlock(after.uses, 'onTick', level)) {
                this.scheduleTick(block, after.tick, level);
            }
        };
    }
}

/** Registers the adapter behavior in both registries, before the content resolves. */
export const registerScriptComponentBehaviors = (
    registries: { readonly blocks: BehaviorRegistry<BlockHooks>; readonly items: BehaviorRegistry<ItemHooks> },
    bridge: ScriptComponentBridge
): void => {
    registries.blocks.register({
        name: SCRIPT_COMPONENTS_BEHAVIOR,
        hooks: [
            'onBreak',
            'onPlayerInteract',
            'onRandomTick',
            'onTick',
            'beforeOnPlayerPlace',
            'onStepOn',
            'onEntityFallOn',
            'onEntity',
            'onRedstoneUpdate',
            'onBlockStateChange'
        ],
        create: (context) => {
            const type = scriptComponentType(context.definition, 'minecraft:block');
            if (type === undefined) return {};
            bridge.addBlock(context.identifier, type);
            const { uses, tick } = type;
            // The power each block of this type last heard, which the next update reports as the previous.
            const powers = new Map<string, number>();
            const handlers: Partial<BlockHooks> = {
                onBreak: (event) => {
                    const player = actorOf(event.brokenBy);
                    if (event.brokenBy?.identifier !== 'minecraft:player') return;
                    bridge.block(
                        {
                            hook: 'onPlayerBreak',
                            components: uses,
                            block: locationOf(event.block),
                            brokenBlockPermutation: permutationOf(event.brokenBlock),
                            ...(player === undefined ? {} : { player })
                        },
                        event.block.level
                    );
                },
                onPlayerInteract: (event) => {
                    if (!bridge.handlesBlock(uses, 'onPlayerInteract', event.block.level)) return undefined;
                    const player = actorOf(event.player);
                    bridge.block(
                        {
                            hook: 'onPlayerInteract',
                            components: uses,
                            block: locationOf(event.block),
                            face: event.face === undefined ? 'Up' : SCRIPT_DIRECTIONS[event.face],
                            ...(event.faceLocation === undefined ? {} : { faceLocation: event.faceLocation }),
                            ...(player === undefined ? {} : { player })
                        },
                        event.block.level
                    );
                    // The component took the click, so the item in hand is not used on the block.
                    return true;
                },
                onRandomTick: (event) =>
                    void bridge.block(
                        { hook: 'onRandomTick', components: uses, block: locationOf(event.block) },
                        event.block.level
                    ),
                onStepOn: (event) => {
                    const entity = actorOf(event.entity);
                    bridge.block(
                        {
                            hook: 'onStepOn',
                            components: uses,
                            block: locationOf(event.block),
                            ...(entity === undefined ? {} : { entity })
                        },
                        event.block.level
                    );
                },
                onEntityFallOn: (event) => {
                    const entity = actorOf(event.entity);
                    bridge.block(
                        {
                            hook: 'onEntityFallOn',
                            components: uses,
                            block: locationOf(event.block),
                            fallDistance: event.fallDistance,
                            ...(entity === undefined ? {} : { entity })
                        },
                        event.block.level
                    );
                },
                onEntity: (event) => {
                    const entitySource = actorOf(event.entitySource);
                    bridge.block(
                        {
                            hook: 'onEntity',
                            components: uses,
                            block: locationOf(event.block),
                            name: event.name,
                            blockPermutation: permutationOf(event.block),
                            ...(entitySource === undefined ? {} : { entitySource })
                        },
                        event.block.level
                    );
                },
                onRedstoneUpdate: (event) => {
                    const block = locationOf(event.block);
                    const key = `${event.block.level ?? ''} ${block.dimension} ${block.x} ${block.y} ${block.z}`;
                    const previous = powers.get(key);
                    powers.set(key, event.power);
                    bridge.block(
                        {
                            hook: 'onRedstoneUpdate',
                            components: uses,
                            block,
                            powerLevel: event.power,
                            previousPowerLevel: previous ?? 0,
                            firstUpdate: previous === undefined
                        },
                        event.block.level
                    );
                },
                onBlockStateChange: (event) =>
                    void bridge.block(
                        {
                            hook: 'onBlockStateChange',
                            components: uses,
                            block: locationOf(event.block),
                            previousPermutation: permutationOf({
                                identifier: event.block.identifier,
                                states: { ...event.block.states, [event.state]: event.previousValue }
                            })
                        },
                        event.block.level
                    ),
                beforeOnPlayerPlace: (event) => {
                    const player = actorOf(event.player);
                    const refused = bridge.block(
                        {
                            hook: 'beforeOnPlayerPlace',
                            components: uses,
                            block: locationOf(event.block),
                            face: SCRIPT_DIRECTIONS[event.face],
                            permutationToPlace: permutationOf(event.block),
                            ...(player === undefined ? {} : { player })
                        },
                        event.block.level
                    );
                    return refused ? true : undefined;
                }
            };
            // BDS runs `onTick` only for a block with `minecraft:tick`, which says when.
            if (tick !== undefined) {
                handlers.onTick = (event) => {
                    const block = locationOf(event.block);
                    bridge.block({ hook: 'onTick', components: uses, block }, event.block.level);
                    if (tick.looping) bridge.scheduleTick(block, tick, event.block.level);
                };
            }
            return handlers;
        }
    });
    registries.blocks.attach(
        SCRIPT_COMPONENTS_BEHAVIOR,
        (_identifier, definition) =>
            definition !== undefined && scriptComponentType(definition, 'minecraft:block') !== undefined
    );

    registries.items.register({
        name: SCRIPT_COMPONENTS_BEHAVIOR,
        hooks: ['onUse', 'onUseOn', 'onConsume', 'onMineBlock'],
        create: (context) => {
            const uses = scriptComponentType(context.definition, 'minecraft:item')?.uses;
            if (uses === undefined) return {};
            const item = (stack: ItemStack) => ({ typeId: stack.identifier, amount: stack.count });
            return {
                onUse: (event) => {
                    bridge.item({
                        hook: 'onUse',
                        components: uses,
                        item: item(event.itemStack),
                        source: sourceOf(event.source)
                    });
                    return undefined;
                },
                onUseOn: (event) => {
                    bridge.item({
                        hook: 'onUseOn',
                        components: uses,
                        item: item(event.itemStack),
                        source: sourceOf(event.source),
                        block: { dimension: event.block.dimension, ...event.block.position },
                        usedOnBlockPermutation: permutationOf(event.block),
                        blockFace: SCRIPT_DIRECTIONS[event.blockFace],
                        faceLocation: event.faceLocation
                    });
                    return undefined;
                },
                onConsume: (event) => {
                    bridge.item({
                        hook: 'onConsume',
                        components: uses,
                        item: item(event.itemStack),
                        source: sourceOf(event.source)
                    });
                    return undefined;
                },
                onMineBlock: (event) =>
                    bridge.item({
                        hook: 'onMineBlock',
                        components: uses,
                        item: item(event.itemStack),
                        source: sourceOf(event.source),
                        block: { dimension: event.block.dimension, ...event.block.position },
                        minedBlockPermutation: permutationOf(event.block)
                    })
            };
        }
    });
    registries.items.attach(
        SCRIPT_COMPONENTS_BEHAVIOR,
        (_identifier, definition) =>
            definition !== undefined && scriptComponentType(definition, 'minecraft:item') !== undefined
    );
};
