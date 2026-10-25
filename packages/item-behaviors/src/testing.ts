/**
 * A typed {@link WorldActions} double.
 *
 * It is shipped rather than kept in the test folder because the seam is the
 * package's whole interface to the world: anything that writes an item
 * behavior, here or in a plugin, tests it against this and not against a
 * server. Every query is a plain value a test can set, every action lands in
 * an ordered log, and `random` is a fixed sequence so an Unbreaking roll or a
 * chick hatch is reproducible.
 */
import type { ItemSource } from '@jsprismarine/items';

import type {
    BlockPlacement,
    BlockPosition,
    BlockReference,
    EnvironmentState,
    HolderSet,
    ItemWorldAction,
    ItemWorldActionKind,
    ItemWorldActionOf,
    SourceState,
    WorldActions
} from './world';

/** How to key a block position in the double's own maps. */
const key = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

/** Everything {@link createTestWorld} lets a test set up front. */
export interface TestWorldOptions {
    /** The blocks that exist, keyed by position. */
    readonly blocks?: readonly BlockReference[];
    /** Fields to override on the default source state. */
    readonly state?: Partial<SourceState>;
    /** Fields to override on the default environment. */
    readonly environment?: Partial<EnvironmentState>;
    /** The entity a use lands on, which makes `targetOf` answer. */
    readonly target?: ItemSource;
    /** Tag membership, keyed by tag name without the leading `#`. */
    readonly tags?: Readonly<Record<string, readonly string[]>>;
    /** What `transform` answers, keyed by `<transformer>|<block identifier>`. */
    readonly transforms?: Readonly<Record<string, BlockPlacement>>;
    /** The numbers `random` hands out in order, repeating the last one. */
    readonly randoms?: readonly number[];
}

/** The double, which is a {@link WorldActions} plus the log and a few setters. */
export interface TestWorld extends WorldActions {
    /** Every action performed, in order. */
    readonly actions: readonly ItemWorldAction[];
    /** The actions of one kind, already narrowed to that variant. */
    performed<K extends ItemWorldActionKind>(kind: K): readonly ItemWorldActionOf<K>[];
    /** Whether an action of the kind was performed. */
    did(kind: ItemWorldActionKind): boolean;
    /** Changes the source state mid-test, for a second hook call. */
    setState(state: Partial<SourceState>): void;
    /** Puts a block in the world mid-test. */
    setBlock(block: BlockReference): void;
    /** Sets the entity `targetOf` answers with. */
    setTarget(target: ItemSource | undefined): void;
    /** Empties the action log. */
    clear(): void;
}

const DEFAULT_STATE: SourceState = {
    position: { x: 0, y: 64, z: 0 },
    creative: false,
    onGround: true,
    eyeInWater: false,
    gliding: false,
    inWaterOrRain: false,
    fallDistance: 0,
    effects: [],
    cooldownGroups: [],
    foodLevel: 20
};

const DEFAULT_ENVIRONMENT: EnvironmentState = {
    dimension: 'minecraft:overworld',
    timeOfDay: 0,
    spawnPosition: { x: 0, y: 64, z: 0 }
};

/**
 * Builds a {@link WorldActions} double.
 *
 * @param options - The answers the queries give before anything runs.
 */
export const createTestWorld = (options: TestWorldOptions = {}): TestWorld => {
    const actions: ItemWorldAction[] = [];
    const blocks = new Map<string, BlockReference>((options.blocks ?? []).map((block) => [key(block.position), block]));
    const tags = new Map<string, Set<string>>(
        Object.entries(options.tags ?? {}).map(([name, members]) => [name, new Set(members)])
    );
    const transforms = new Map<string, BlockPlacement>(Object.entries(options.transforms ?? {}));
    const randoms = options.randoms ?? [0.5];

    const environment: EnvironmentState = { ...DEFAULT_ENVIRONMENT, ...options.environment };
    let state: SourceState = { ...DEFAULT_STATE, ...options.state };
    let target = options.target;
    let draws = 0;

    return {
        actions,
        blockAt: (position) => blocks.get(key(position)),
        stateOf: () => state,
        environment: () => environment,
        targetOf: () => target,
        includes: (set: HolderSet, member: string) =>
            set.kind === 'tag' ? (tags.get(set.tag)?.has(member) ?? false) : set.entries.includes(member),
        transform: (transformer, block) => transforms.get(`${transformer}|${block.identifier}`),
        random: () => randoms[Math.min(draws++, randoms.length - 1)]!,
        perform: (action) => {
            actions.push(action);
        },
        performed: <K extends ItemWorldActionKind>(kind: K) =>
            // The `kind` field is the union's discriminant, so a filter on it
            // narrows the variant; TypeScript cannot carry that through a
            // generic predicate.
            actions.filter((action): action is ItemWorldActionOf<K> => action.kind === kind),
        did: (kind) => actions.some((action) => action.kind === kind),
        setState: (next) => {
            state = { ...state, ...next };
        },
        setBlock: (block) => {
            blocks.set(key(block.position), block);
        },
        setTarget: (next) => {
            target = next;
        },
        clear: () => {
            actions.length = 0;
        }
    };
};

/** A plain {@link ItemSource}, so a test does not build one by hand. */
export const testSource = (identifier = 'minecraft:player', runtimeId = 1): ItemSource => ({ identifier, runtimeId });

/** A plain {@link BlockReference} at the origin unless a position is given. */
export const testBlock = (
    identifier: string,
    position: BlockPosition = { x: 0, y: 64, z: 0 },
    states: Readonly<Record<string, string | number | boolean>> = {}
): BlockReference => ({ identifier, states, position });
