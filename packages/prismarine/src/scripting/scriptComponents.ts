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

/**
 * Where the content's adapter behaviors send hooks, and where the scripts bind their sink once
 * they have registered their components. Until then, and with no script host, every hook is
 * dropped at the cost of one check.
 */
export class ScriptComponentBridge {
    private sink: ScriptComponentSink | undefined;
    private readonly blocks = new Map<string, ScriptComponentType>();
    private scheduler: TickScheduler | undefined;

    /**
     * Sends the hooks to `sink` from now on.
     * @returns A function that stops it.
     */
    public bind(sink: ScriptComponentSink): () => void {
        this.sink = sink;
        return () => {
            if (this.sink === sink) this.sink = undefined;
        };
    }

    /** Sets how a block with `minecraft:tick` schedules its ticks. */
    public setScheduler(scheduler: TickScheduler): void {
        this.scheduler = scheduler;
    }

    /** Records a block type that names custom components, which the block writes are checked against. */
    public addBlock(identifier: string, type: ScriptComponentType): void {
        this.blocks.set(identifier, type);
    }

    /** Raises a block hook. @returns Whether a script canceled it. */
    public block(event: ScriptBlockHookEvent): boolean {
        const sink = this.sink;
        if (sink === undefined || !sink.handlesBlock(event.components, event.hook)) return false;
        return sink.block(event);
    }

    /** Raises an item hook. */
    public item(event: ScriptItemHookEvent): void {
        const sink = this.sink;
        if (sink === undefined || !sink.handlesItem(event.components, event.hook)) return;
        sink.item(event);
    }

    /** Whether a script registered one of the components with the hook. */
    public handlesBlock(uses: readonly ScriptComponentUse[], hook: ScriptBlockHookEvent['hook']): boolean {
        return this.sink?.handlesBlock(uses, hook) === true;
    }

    /** Schedules the next tick of a block with `minecraft:tick`, somewhere in its interval. */
    public scheduleTick(block: ScriptBlockLocation, tick: TickInterval): void {
        this.scheduler?.(block, tick.min, Math.max(tick.min, tick.max));
    }

    /**
     * The listener for one world's block writes: `onBreak` for a block that names custom
     * components and is gone, then `onPlace` for one that arrives, which also starts its ticks.
     * @param dimension - The world's dimension, as the scripts name it.
     */
    public blockWrites(dimension: string): BlockWriteListener {
        return (at, previous, next) => {
            if (this.sink === undefined || previous.name === next.name) return;
            const block: ScriptBlockLocation = { dimension, ...at };
            const before = this.blocks.get(previous.name);
            if (before !== undefined) {
                this.block({
                    hook: 'onBreak',
                    components: before.uses,
                    block,
                    brokenBlockPermutation: { typeId: previous.name, states: { ...previous.states } }
                });
            }
            const after = this.blocks.get(next.name);
            if (after === undefined) return;
            this.block({
                hook: 'onPlace',
                components: after.uses,
                block,
                previousBlock: { typeId: previous.name, states: { ...previous.states } }
            });
            if (after.tick !== undefined && this.handlesBlock(after.uses, 'onTick')) {
                this.scheduleTick(block, after.tick);
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
                    bridge.block({
                        hook: 'onPlayerBreak',
                        components: uses,
                        block: locationOf(event.block),
                        brokenBlockPermutation: permutationOf(event.brokenBlock),
                        ...(player === undefined ? {} : { player })
                    });
                },
                onPlayerInteract: (event) => {
                    if (!bridge.handlesBlock(uses, 'onPlayerInteract')) return undefined;
                    const player = actorOf(event.player);
                    bridge.block({
                        hook: 'onPlayerInteract',
                        components: uses,
                        block: locationOf(event.block),
                        face: event.face === undefined ? 'Up' : SCRIPT_DIRECTIONS[event.face],
                        ...(event.faceLocation === undefined ? {} : { faceLocation: event.faceLocation }),
                        ...(player === undefined ? {} : { player })
                    });
                    // The component took the click, so the item in hand is not used on the block.
                    return true;
                },
                onRandomTick: (event) =>
                    void bridge.block({ hook: 'onRandomTick', components: uses, block: locationOf(event.block) }),
                onStepOn: (event) => {
                    const entity = actorOf(event.entity);
                    bridge.block({
                        hook: 'onStepOn',
                        components: uses,
                        block: locationOf(event.block),
                        ...(entity === undefined ? {} : { entity })
                    });
                },
                onEntityFallOn: (event) => {
                    const entity = actorOf(event.entity);
                    bridge.block({
                        hook: 'onEntityFallOn',
                        components: uses,
                        block: locationOf(event.block),
                        fallDistance: event.fallDistance,
                        ...(entity === undefined ? {} : { entity })
                    });
                },
                onEntity: (event) => {
                    const entitySource = actorOf(event.entitySource);
                    bridge.block({
                        hook: 'onEntity',
                        components: uses,
                        block: locationOf(event.block),
                        name: event.name,
                        blockPermutation: permutationOf(event.block),
                        ...(entitySource === undefined ? {} : { entitySource })
                    });
                },
                onRedstoneUpdate: (event) => {
                    const block = locationOf(event.block);
                    const key = `${block.dimension} ${block.x} ${block.y} ${block.z}`;
                    const previous = powers.get(key);
                    powers.set(key, event.power);
                    bridge.block({
                        hook: 'onRedstoneUpdate',
                        components: uses,
                        block,
                        powerLevel: event.power,
                        previousPowerLevel: previous ?? 0,
                        firstUpdate: previous === undefined
                    });
                },
                onBlockStateChange: (event) =>
                    void bridge.block({
                        hook: 'onBlockStateChange',
                        components: uses,
                        block: locationOf(event.block),
                        previousPermutation: permutationOf({
                            identifier: event.block.identifier,
                            states: { ...event.block.states, [event.state]: event.previousValue }
                        })
                    }),
                beforeOnPlayerPlace: (event) => {
                    const player = actorOf(event.player);
                    const refused = bridge.block({
                        hook: 'beforeOnPlayerPlace',
                        components: uses,
                        block: locationOf(event.block),
                        face: SCRIPT_DIRECTIONS[event.face],
                        permutationToPlace: permutationOf(event.block),
                        ...(player === undefined ? {} : { player })
                    });
                    return refused ? true : undefined;
                }
            };
            // BDS runs `onTick` only for a block with `minecraft:tick`, which says when.
            if (tick !== undefined) {
                handlers.onTick = (event) => {
                    const block = locationOf(event.block);
                    bridge.block({ hook: 'onTick', components: uses, block });
                    if (tick.looping) bridge.scheduleTick(block, tick);
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
                        block: { dimension: 'minecraft:overworld', ...event.block.position },
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
                        block: { dimension: 'minecraft:overworld', ...event.block.position },
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
