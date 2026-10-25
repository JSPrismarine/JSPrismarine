/**
 * The optional `items` group of `ServerWorldAdapter`, which only
 * `@jsprismarine/item-behaviors` asks for.
 *
 * Seven members and one {@link ContentItemAccess.perform} over a 28-variant
 * tagged union. The union is the reason this group is worth a module of its
 * own: the variants split cleanly in two, and the split is what decides which
 * subsystem owes which half.
 *
 * A variant whose subject is a **place in the world** - putting a block down,
 * taking one out, lighting one, bone-mealing one, spawning something, playing
 * a sound - is performed here, over the block, entity and effect groups the
 * adapter already carries. A variant whose subject is an **entity, an
 * inventory or a screen** needs an entity index and a player session, which
 * this subsystem does not have, so it goes to {@link ItemActorPort}. The two
 * halves are derived from the union with `Exclude`, so a new variant lands in
 * one of them and the exhaustive switch below stops compiling until it is
 * handled.
 */
import { relative } from '@jsprismarine/engine-systems';
import type {
    BlockPlacement,
    EffectApplication,
    EnvironmentState,
    HolderSet,
    ItemSource,
    ItemWorldAction,
    ItemWorldActionOf,
    SourceState
} from '@jsprismarine/item-behaviors';

import type {
    ContentBlock,
    ContentEffectSink,
    ContentEntityAccess,
    ContentItemAccess,
    ContentLevelFacts
} from '../content/world/adapter';
import type { ContentLookup } from '../content/world/views';
import type { ContentBlockGroup } from '../block/contentAdapter';

/** What an empty position holds, which is what breaking a block leaves behind. */
const AIR: ContentBlock = { identifier: 'minecraft:air', states: {} };

/** What `minecraft:flint_and_steel` and a fire charge put down. */
const FIRE = 'minecraft:fire';

/**
 * The registries a holder set's tag may name, in the order they are tried.
 *
 * A `HolderSet` carries a tag id and nothing that says which registry it
 * tags, because in Java the registry is implied by the component the set sits
 * in. The three an item behavior compares against are blocks, items and
 * entity types, and a tag id is unique enough across them that trying all
 * three in turn is right wherever the stack defines the tag at all.
 */
const HOLDER_SET_REGISTRIES = ['item', 'block', 'entity_type'] as const;

/** The `kind`s whose subject is a place in the world rather than an entity. */
export const WORLD_ITEM_ACTION_KINDS = [
    'place-block',
    'break-block',
    'fertilize',
    'ignite',
    'play-sound',
    'spawn-entity'
] as const satisfies readonly ItemWorldAction['kind'][];

/** An action this subsystem performs itself, over the block, entity and effect groups. */
export type WorldItemAction = ItemWorldActionOf<(typeof WORLD_ITEM_ACTION_KINDS)[number]>;

/**
 * An action whose subject is an entity, an inventory or a screen.
 *
 * Derived rather than listed, so a new variant of `ItemWorldAction` joins
 * this half by default and the exhaustive switch in
 * {@link createContentItemGroup} is what forces a decision about it.
 */
export type ActorItemAction = Exclude<ItemWorldAction, WorldItemAction>;

/**
 * What only the subsystems holding the entity index and the player sessions
 * can answer or do.
 *
 * Three members rather than twenty-two, because the half of the union this
 * port owns stays a union: adding a consumable effect is a new case in the
 * port's own switch, not a new method here.
 */
export interface ItemActorPort {
    /** Everything a behavior reads about the entity using the item. */
    stateOf(source: ItemSource): SourceState;
    /** The entity an interaction landed on, or undefined when it landed on a block or nothing. */
    targetOf(source: ItemSource): ItemSource | undefined;
    /** Does one thing to an entity, an inventory or a screen. */
    perform(action: ActorItemAction): void;
}

/**
 * What a `minecraft:block_transformer` turns a block into.
 *
 * Injected rather than read out of the content, because 26.3 keeps the table
 * in Java's own `block_transformer` registry and `@jsprismarine/packs` does
 * not route that registry yet. The default answers nothing for every block,
 * which is the interface's own "this transformer has no rule here", so an axe
 * declines to strip rather than stripping a log into something guessed.
 */
export type BlockTransformers = (transformer: string, block: ContentBlock) => BlockPlacement | undefined;

/**
 * The effects one potion identifier applies.
 *
 * Injected for the same reason: Java keeps its 47 potions in code, in
 * `Potions`, so no pack publishes them and the server has to answer. The
 * default is the empty list, which is also what a water bottle gives.
 */
export type PotionEffects = (potion: string) => readonly EffectApplication[];

/** What {@link createContentItemGroup} is built over. */
export interface ContentItemGroupOptions {
    /** The block group this subsystem also owns, which the four block variants go through. */
    readonly blocks: ContentBlockGroup;
    readonly entities: ContentEntityAccess;
    readonly effects: ContentEffectSink;
    readonly level: ContentLevelFacts;
    /** The entity-facing half of the union, plus the two queries about the user. */
    readonly actors: ItemActorPort;
    /** The built content, read at call time; see {@link ContentLookup}. */
    readonly content: ContentLookup;
    readonly transformers?: BlockTransformers;
    readonly potions?: PotionEffects;
}

/** A block placement as the adapter's block group takes one; the two records agree field for field. */
const asBlock = (placement: BlockPlacement): ContentBlock => ({
    identifier: placement.identifier,
    states: placement.states
});

/**
 * Builds the `items` group over the block, entity and effect groups of one
 * dimension.
 *
 * @throws {never} Nothing here throws on its own; a member the actor port has
 *   not supplied throws from the port.
 */
export const createContentItemGroup = (options: ContentItemGroupOptions): ContentItemAccess => {
    const { blocks, entities, effects, level, actors, content } = options;
    const transformers = options.transformers ?? (() => undefined);
    const potions = options.potions ?? (() => []);

    /**
     * Bone meal.
     *
     * Java's `BoneMealItem` calls `BonemealableBlock.performBonemeal`, and for
     * the growables that is the growth step a random tick performs, so the
     * block's own `onRandomTick` is what runs here. The blocks whose bone meal
     * outcome is not a growth step - a grass block scattering flowers around
     * itself - need a hook of their own and do not have one; they decline
     * rather than growing something wrong.
     */
    const fertilize = (action: ItemWorldActionOf<'fertilize'>): void => {
        const block = blocks.get(action.position);
        if (!block) return;

        const type = content().blocks.types.get(block.identifier);
        if (!type) return;

        type.state(block.states).content.hooks.dispatch('onRandomTick', {
            block: {
                identifier: block.identifier,
                position: action.position,
                dimension: level.dimension,
                states: block.states
            },
            tick: level.gameTime()
        });
    };

    const perform = (action: ItemWorldAction): void => {
        switch (action.kind) {
            case 'place-block':
                return blocks.set(action.position, asBlock(action.placement), true);
            case 'break-block':
                // No loot: this is a bucket taking a fluid or a shovel taking
                // the top off, not a block being mined.
                return blocks.set(action.position, AIR, true);
            case 'fertilize':
                return fertilize(action);
            case 'ignite': {
                // The fire goes on the face that was clicked, and only where
                // nothing stands. Whether it then survives is the fire
                // family's rule rather than the item's.
                const at = relative(action.position, action.face);
                if (blocks.get(at)?.identifier !== 'minecraft:air') return;
                return blocks.set(at, { identifier: FIRE, states: {} }, true);
            }
            case 'play-sound':
                return effects.playSound(action.position, action.sound);
            case 'spawn-entity':
                entities.spawn(action.identifier, action.position, action.data);
                return;
            default:
                return actors.perform(action);
        }
    };

    return {
        stateOf: (source) => actors.stateOf(source),
        targetOf: (source) => actors.targetOf(source),
        environment: (): EnvironmentState => ({
            dimension: level.dimension,
            timeOfDay: level.dayTime(),
            spawnPosition: level.spawnPosition()
        }),
        includes: (set, member) => includes(content, set, member),
        transform: (transformer, block) => transformers(transformer, block),
        effectsOf: (potion) => potions(potion),
        perform
    };
};

/** Whether an identifier is in a holder set, resolving a `#tag` through the merged tags. */
const includes = (content: ContentLookup, set: HolderSet, member: string): boolean => {
    if (set.kind === 'entries') return set.entries.includes(member);

    const tags = content().tags;
    return HOLDER_SET_REGISTRIES.some((registry) => tags.includes(registry, set.tag, member));
};
