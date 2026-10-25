import {
    asBoolean,
    asList,
    asNumber,
    asString,
    blockPredicate,
    damageSourcePredicate,
    entityPredicate,
    floatRange,
    intRange,
    itemPredicate,
    locationPredicate,
    member,
    namespaced,
    predicateAt,
    resolveMembers
} from '@jsprismarine/predicates';
import type {
    EntityView,
    ItemMatcher,
    ParseContext,
    Predicate,
    PredicateContext,
    Vec3
} from '@jsprismarine/predicates';

import { blockUseContext, entityContext, locationContext } from './events';
import type {
    BeaconEvent,
    BeeNestDestroyedEvent,
    BlockEvent,
    BlockInteractionEvent,
    BredAnimalsEvent,
    BrewedPotionEvent,
    ChangedDimensionEvent,
    ContainerLootEvent,
    CuredZombieVillagerEvent,
    DamageEvent,
    EffectsChangedEvent,
    EnchantedItemEvent,
    EnderEyeEvent,
    EntityEvent,
    EvaluationServices,
    FallAfterExplosionEvent,
    FishingRodHookedEvent,
    InventoryEvent,
    ItemDurabilityEvent,
    ItemEvent,
    ItemUsedOnBlockEvent,
    KillEvent,
    KilledByArrowEvent,
    LevitationEvent,
    LightningStrikeEvent,
    PickedUpItemEvent,
    PlayerEvent,
    PlayerHurtEntityEvent,
    PlayerInteractEvent,
    RecipeCraftedEvent,
    RecipeEvent,
    SpearMobsEvent,
    TargetHitEvent,
    TravelEvent,
    VictimsEvent,
    VillagerTradeEvent
} from './events';

/**
 * The 58 members of the `minecraft:trigger_type` registry in Java 26.3, read
 * out of `reports/registries.json` in protocol id order. Vanilla's own 1866
 * advancement files use 54 of them; `used_ender_eye`, `voluntary_exile`,
 * `default_block_use` and `any_block_use` have no vanilla criterion.
 */
export const TRIGGER_TYPES = [
    'impossible',
    'player_killed_entity',
    'entity_killed_player',
    'enter_block',
    'inventory_changed',
    'recipe_unlocked',
    'player_hurt_entity',
    'entity_hurt_player',
    'enchanted_item',
    'filled_bucket',
    'brewed_potion',
    'construct_beacon',
    'used_ender_eye',
    'summoned_entity',
    'bred_animals',
    'location',
    'slept_in_bed',
    'cured_zombie_villager',
    'villager_trade',
    'item_durability_changed',
    'levitation',
    'changed_dimension',
    'tick',
    'tame_animal',
    'placed_block',
    'consume_item',
    'effects_changed',
    'used_totem',
    'nether_travel',
    'fishing_rod_hooked',
    'channeled_lightning',
    'shot_crossbow',
    'spear_mobs',
    'killed_by_arrow',
    'hero_of_the_village',
    'voluntary_exile',
    'slide_down_block',
    'bee_nest_destroyed',
    'target_hit',
    'item_used_on_block',
    'default_block_use',
    'any_block_use',
    'player_generates_container_loot',
    'thrown_item_picked_up_by_entity',
    'thrown_item_picked_up_by_player',
    'player_interacted_with_entity',
    'player_sheared_equipment',
    'started_riding',
    'lightning_strike',
    'using_item',
    'fall_from_height',
    'ride_entity_in_lava',
    'kill_mob_near_sculk_catalyst',
    'allay_drop_item_on_block',
    'avoid_vibration',
    'recipe_crafted',
    'crafter_recipe_crafted',
    'fall_after_explosion'
] as const;

/** One of {@link TRIGGER_TYPES}, without the `minecraft:` namespace. */
export type TriggerName = (typeof TRIGGER_TYPES)[number];

/**
 * Which event shape each trigger listens for. A host raises one of these and
 * the engine routes it to the criteria registered under that trigger.
 */
export interface TriggerEvents {
    impossible: PlayerEvent;
    player_killed_entity: KillEvent;
    entity_killed_player: KillEvent;
    enter_block: BlockEvent;
    inventory_changed: InventoryEvent;
    recipe_unlocked: RecipeEvent;
    player_hurt_entity: PlayerHurtEntityEvent;
    entity_hurt_player: DamageEvent;
    enchanted_item: EnchantedItemEvent;
    filled_bucket: ItemEvent;
    brewed_potion: BrewedPotionEvent;
    construct_beacon: BeaconEvent;
    used_ender_eye: EnderEyeEvent;
    summoned_entity: EntityEvent;
    bred_animals: BredAnimalsEvent;
    location: PlayerEvent;
    slept_in_bed: PlayerEvent;
    cured_zombie_villager: CuredZombieVillagerEvent;
    villager_trade: VillagerTradeEvent;
    item_durability_changed: ItemDurabilityEvent;
    levitation: LevitationEvent;
    changed_dimension: ChangedDimensionEvent;
    tick: PlayerEvent;
    tame_animal: EntityEvent;
    placed_block: ItemUsedOnBlockEvent;
    consume_item: ItemEvent;
    effects_changed: EffectsChangedEvent;
    used_totem: ItemEvent;
    nether_travel: TravelEvent;
    fishing_rod_hooked: FishingRodHookedEvent;
    channeled_lightning: VictimsEvent;
    shot_crossbow: ItemEvent;
    spear_mobs: SpearMobsEvent;
    killed_by_arrow: KilledByArrowEvent;
    hero_of_the_village: PlayerEvent;
    voluntary_exile: PlayerEvent;
    slide_down_block: BlockEvent;
    bee_nest_destroyed: BeeNestDestroyedEvent;
    target_hit: TargetHitEvent;
    item_used_on_block: ItemUsedOnBlockEvent;
    default_block_use: BlockInteractionEvent;
    any_block_use: BlockInteractionEvent;
    player_generates_container_loot: ContainerLootEvent;
    thrown_item_picked_up_by_entity: PickedUpItemEvent;
    thrown_item_picked_up_by_player: PickedUpItemEvent;
    player_interacted_with_entity: PlayerInteractEvent;
    player_sheared_equipment: PlayerInteractEvent;
    started_riding: PlayerEvent;
    lightning_strike: LightningStrikeEvent;
    using_item: ItemEvent;
    fall_from_height: TravelEvent;
    ride_entity_in_lava: TravelEvent;
    kill_mob_near_sculk_catalyst: KillEvent;
    allay_drop_item_on_block: ItemUsedOnBlockEvent;
    avoid_vibration: PlayerEvent;
    recipe_crafted: RecipeCraftedEvent;
    crafter_recipe_crafted: RecipeCraftedEvent;
    fall_after_explosion: FallAfterExplosionEvent;
}

/** The union of every event shape, which is what the dispatch index erases to. */
export type AnyTriggerEvent = TriggerEvents[TriggerName];

/** Answers whether one event satisfies a criterion. */
export type EventTest<E> = (event: E, services: EvaluationServices) => boolean;

/** Compiles a `conditions` object into a test over one event shape. */
export type EventParser<E> = (conditions: unknown, context: ParseContext) => EventTest<E>;

/** A compiled criterion test for one trigger. */
export type CriterionTest<K extends TriggerName> = EventTest<TriggerEvents[K]>;

/** Compiles one trigger's `conditions` object into a test over its event. */
export type TriggerParser<K extends TriggerName> = EventParser<TriggerEvents[K]>;

const present = (conditions: unknown, key: string): boolean => member(conditions, key) !== undefined;

/** The `player` field every trigger except `impossible` accepts, as a loot condition. */
const playerField = (conditions: unknown, context: ParseContext): Predicate =>
    predicateAt(member(conditions, 'player'), context.at('player'));

/** A field holding a loot condition about one entity, or undefined when the field is absent. */
const entityField = (conditions: unknown, key: string, context: ParseContext): Predicate | undefined =>
    present(conditions, key) ? predicateAt(member(conditions, key), context.at(key)) : undefined;

const matchesEntity = (
    test: Predicate | undefined,
    entity: EntityView | undefined,
    services: EvaluationServices
): boolean => test === undefined || (entity !== undefined && test(entityContext(entity, services)));

const itemField = (conditions: unknown, key: string, context: ParseContext): ItemMatcher =>
    itemPredicate(member(conditions, key), context.at(key));

const memberIds = (conditions: unknown, key: string, registry: 'recipe' | 'loot_table', context: ParseContext) =>
    resolveMembers(member(conditions, key), registry, context.at(key));

/**
 * Java's `DistancePredicate`: per-axis, horizontal and absolute bounds between
 * two positions. Java compares squared distances against squared bounds, which
 * is the same ordering as comparing the roots.
 */
const distanceField = (
    conditions: unknown,
    key: string,
    context: ParseContext
): ((from: Vec3, to: Vec3, evaluation: PredicateContext) => boolean) => {
    const value = member(conditions, key);
    const at = context.at(key);
    const x = floatRange(member(value, 'x'), at.at('x'));
    const y = floatRange(member(value, 'y'), at.at('y'));
    const z = floatRange(member(value, 'z'), at.at('z'));
    const horizontal = floatRange(member(value, 'horizontal'), at.at('horizontal'));
    const absolute = floatRange(member(value, 'absolute'), at.at('absolute'));

    return (from, to, evaluation) => {
        const dx = Math.abs(to.x - from.x);
        const dy = Math.abs(to.y - from.y);
        const dz = Math.abs(to.z - from.z);
        return (
            x(dx, evaluation) &&
            y(dy, evaluation) &&
            z(dz, evaluation) &&
            horizontal(Math.sqrt(dx * dx + dz * dz), evaluation) &&
            absolute(Math.sqrt(dx * dx + dy * dy + dz * dz), evaluation)
        );
    };
};

/** Java's `DamagePredicate`: how much landed, whether a shield stopped it, and what dealt it. */
const damageField = (
    conditions: unknown,
    context: ParseContext
): ((event: DamageEvent, services: EvaluationServices) => boolean) => {
    const value = member(conditions, 'damage');
    const at = context.at('damage');
    const dealt = floatRange(member(value, 'dealt'), at.at('dealt'));
    const taken = floatRange(member(value, 'taken'), at.at('taken'));
    const blocked = asBoolean(member(value, 'blocked'));
    const type = present(value, 'type') ? damageSourcePredicate(member(value, 'type'), at.at('type')) : undefined;
    const sourceEntity = present(value, 'source_entity')
        ? entityPredicate(member(value, 'source_entity'), at.at('source_entity'))
        : undefined;

    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        if (!dealt(event.dealt, evaluation)) return false;
        if (!taken(event.taken, evaluation)) return false;
        if (blocked !== undefined && blocked !== event.blocked) return false;
        if (type && !type(event.damageSource, evaluation)) return false;
        if (!sourceEntity) return true;
        const source = event.damageSource.sourceEntity;
        return source !== undefined && sourceEntity(source, entityContext(source, services));
    };
};

/**
 * The shared `blocks` plus `state` pair, which Java reads as one block
 * predicate. Absent keys are left out rather than passed as undefined, because
 * an empty `blocks` member set matches nothing.
 */
const blockField = (conditions: unknown, context: ParseContext) => {
    const value: Record<string, unknown> = {};
    if (present(conditions, 'blocks')) value['blocks'] = member(conditions, 'blocks');
    if (present(conditions, 'state')) value['state'] = member(conditions, 'state');
    return blockPredicate(value, context);
};

/** A list of loot conditions each of which must match a distinct subject, as Java's iterator removal does. */
const matchDistinct = <T>(
    tests: readonly Predicate[],
    subjects: readonly T[],
    context: (subject: T) => PredicateContext
): boolean => {
    const remaining = [...subjects];
    for (const test of tests) {
        const index = remaining.findIndex((subject) => test(context(subject)));
        if (index < 0) return false;
        remaining.splice(index, 1);
    }
    return true;
};

const conditionList = (conditions: unknown, key: string, context: ParseContext): readonly Predicate[] =>
    asList(member(conditions, key)).map((entry, index) => predicateAt(entry, context.at(key).at(index)));

const itemList = (conditions: unknown, key: string, context: ParseContext): readonly ItemMatcher[] =>
    asList(member(conditions, key)).map((entry, index) => itemPredicate(entry, context.at(key).at(index)));

/** Shared by the three `PlayerTrigger` ids plus `started_riding`, which carry only a `player` field. */
const playerOnly: EventParser<PlayerEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    return (event, services) => player(entityContext(event.player, services));
};

/** Shared by `player_killed_entity`, `entity_killed_player` and `kill_mob_near_sculk_catalyst`. */
const killed: EventParser<KillEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const entity = entityField(conditions, 'entity', context);
    const killingBlow = present(conditions, 'killing_blow')
        ? damageSourcePredicate(member(conditions, 'killing_blow'), context.at('killing_blow'))
        : undefined;

    return (event, services) => {
        if (!player(entityContext(event.player, services))) return false;
        if (!matchesEntity(entity, event.entity, services)) return false;
        return !killingBlow || killingBlow(event.damageSource, entityContext(event.player, services));
    };
};

/** Shared by `enter_block` and `slide_down_block`. */
const blockEntered: EventParser<BlockEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const block = blockField(conditions, context);
    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        return player(evaluation) && block(event.blockState, undefined, evaluation);
    };
};

/** Shared by the five triggers whose only subject is one stack. */
const heldItem: EventParser<ItemEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const item = itemField(conditions, 'item', context);
    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        return player(evaluation) && item(event.item, evaluation);
    };
};

/** Shared by `summoned_entity` and `tame_animal`. */
const aboutEntity: EventParser<EntityEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const entity = entityField(conditions, 'entity', context);
    return (event, services) =>
        player(entityContext(event.player, services)) && matchesEntity(entity, event.entity, services);
};

/** Shared by `placed_block`, `item_used_on_block` and `allay_drop_item_on_block`. */
const usedOnLocation: EventParser<ItemUsedOnBlockEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const location = present(conditions, 'location')
        ? predicateAt(member(conditions, 'location'), context.at('location'))
        : undefined;
    return (event, services) => {
        if (!player(entityContext(event.player, services))) return false;
        return !location || location(locationContext(event, services));
    };
};

/** Shared by `default_block_use` and `any_block_use`. */
const blockUsed: EventParser<BlockInteractionEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const location = present(conditions, 'location')
        ? predicateAt(member(conditions, 'location'), context.at('location'))
        : undefined;
    return (event, services) => {
        if (!player(entityContext(event.player, services))) return false;
        return !location || location(blockUseContext(event, services));
    };
};

/** Shared by the two `thrown_item_picked_up_by_*` ids and the two `PlayerInteractTrigger` ids. */
const pickedUpItem: EventParser<PickedUpItemEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const item = itemField(conditions, 'item', context);
    const entity = entityField(conditions, 'entity', context);
    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        if (!player(evaluation)) return false;
        if (!item(event.item, evaluation)) return false;
        return matchesEntity(entity, event.entity, services);
    };
};

/** Shared by `nether_travel`, `fall_from_height` and `ride_entity_in_lava`. */
const traveled: EventParser<TravelEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const start = present(conditions, 'start_position')
        ? locationPredicate(member(conditions, 'start_position'), context.at('start_position'))
        : undefined;
    const distance = distanceField(conditions, 'distance', context);

    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        if (!player(evaluation)) return false;
        if (start && !start(event.startPosition, evaluation)) return false;
        const position = event.player.position;
        if (!position) {
            services.diagnostics.error(context.path, 'the travel distance needs the player position');
            return false;
        }
        return distance(event.startPosition, position, evaluation);
    };
};

/** Shared by `recipe_crafted` and `crafter_recipe_crafted`. */
const recipeCrafted: EventParser<RecipeCraftedEvent> = (conditions, context) => {
    const player = playerField(conditions, context);
    const recipes = memberIds(conditions, 'recipes', 'recipe', context);
    const ingredients = itemList(conditions, 'ingredients', context);

    return (event, services) => {
        const evaluation = entityContext(event.player, services);
        if (!player(evaluation)) return false;
        if (!recipes.ids.has(namespaced(event.recipe))) return false;

        const remaining = [...event.ingredients];
        for (const test of ingredients) {
            const index = remaining.findIndex((stack) => test(stack, evaluation));
            if (index < 0) return false;
            remaining.splice(index, 1);
        }
        return true;
    };
};

/**
 * The parser for every registered trigger, keyed the way the registry names
 * them. 58 ids share 29 instance shapes in Java, so the ids that read the same
 * JSON share one parser here too.
 */
const TRIGGERS: { readonly [K in TriggerName]: TriggerParser<K> } = {
    impossible: () => () => false,

    player_killed_entity: killed,
    entity_killed_player: killed,
    kill_mob_near_sculk_catalyst: killed,

    enter_block: blockEntered,
    slide_down_block: blockEntered,

    inventory_changed: (conditions, context) => {
        const player = playerField(conditions, context);
        const items = itemList(conditions, 'items', context);
        const slots = member(conditions, 'slots');
        const at = context.at('slots');
        const occupied = present(conditions, 'slots')
            ? intRange(member(slots, 'occupied'), at.at('occupied'))
            : undefined;
        const full = present(conditions, 'slots') ? intRange(member(slots, 'full'), at.at('full')) : undefined;
        const empty = present(conditions, 'slots') ? intRange(member(slots, 'empty'), at.at('empty')) : undefined;

        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;

            if (occupied && full && empty) {
                const stacks = event.inventory;
                const ops = evaluation.items;
                let occupiedCount = 0;
                let fullCount = 0;
                let emptyCount = 0;
                for (const stack of stacks) {
                    if (!stack) emptyCount += 1;
                    else {
                        occupiedCount += 1;
                        if (stack.count >= ops.maxStackSize(stack)) fullCount += 1;
                    }
                }
                if (!occupied(occupiedCount, evaluation)) return false;
                if (!full(fullCount, evaluation)) return false;
                if (!empty(emptyCount, evaluation)) return false;
            }

            if (items.length === 0) return true;
            // Java tests a single-item criterion against the stack that
            // changed, not the whole inventory, which is the path 1913 of the
            // 1914 vanilla criteria take.
            if (items.length === 1) return event.changed !== undefined && items[0]!(event.changed, evaluation);

            const remaining = [...items];
            for (const stack of event.inventory) {
                if (remaining.length === 0) return true;
                if (!stack) continue;
                for (let index = remaining.length - 1; index >= 0; index -= 1) {
                    if (remaining[index]!(stack, evaluation)) remaining.splice(index, 1);
                }
            }
            return remaining.length === 0;
        };
    },

    recipe_unlocked: (conditions, context) => {
        const player = playerField(conditions, context);
        const recipes = memberIds(conditions, 'recipes', 'recipe', context);
        return (event, services) =>
            recipes.ids.has(namespaced(event.recipe)) && player(entityContext(event.player, services));
    },

    recipe_crafted: recipeCrafted,
    crafter_recipe_crafted: recipeCrafted,

    player_hurt_entity: (conditions, context) => {
        const player = playerField(conditions, context);
        const damage = damageField(conditions, context);
        const entity = entityField(conditions, 'entity', context);
        return (event, services) => {
            if (!player(entityContext(event.player, services))) return false;
            if (!damage(event, services)) return false;
            return matchesEntity(entity, event.entity, services);
        };
    },

    entity_hurt_player: (conditions, context) => {
        const player = playerField(conditions, context);
        const damage = damageField(conditions, context);
        return (event, services) => player(entityContext(event.player, services)) && damage(event, services);
    },

    enchanted_item: (conditions, context) => {
        const player = playerField(conditions, context);
        const item = itemField(conditions, 'item', context);
        const levels = intRange(member(conditions, 'levels'), context.at('levels'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            return player(evaluation) && item(event.item, evaluation) && levels(event.levels, evaluation);
        };
    },

    filled_bucket: heldItem,
    consume_item: heldItem,
    used_totem: heldItem,
    shot_crossbow: heldItem,
    using_item: heldItem,

    brewed_potion: (conditions, context) => {
        const player = playerField(conditions, context);
        // 26.3's `potion` field is a PotionsPredicate, which is the
        // `minecraft:potion_contents` data component predicate; wrapping it in
        // an item predicate reuses the component grammar instead of forking it.
        const potion = present(conditions, 'potion')
            ? itemPredicate(
                  { predicates: { 'minecraft:potion_contents': member(conditions, 'potion') } },
                  context.at('potion')
              )
            : undefined;
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            return player(evaluation) && (!potion || potion(event.potion, evaluation));
        };
    },

    construct_beacon: (conditions, context) => {
        const player = playerField(conditions, context);
        const level = intRange(member(conditions, 'level'), context.at('level'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            return player(evaluation) && level(event.level, evaluation);
        };
    },

    used_ender_eye: (conditions, context) => {
        const player = playerField(conditions, context);
        const distance = floatRange(member(conditions, 'distance'), context.at('distance'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            return player(evaluation) && distance(event.distance, evaluation);
        };
    },

    summoned_entity: aboutEntity,
    tame_animal: aboutEntity,

    bred_animals: (conditions, context) => {
        const player = playerField(conditions, context);
        const parent = entityField(conditions, 'parent', context);
        const partner = entityField(conditions, 'partner', context);
        const child = entityField(conditions, 'child', context);
        return (event, services) => {
            if (!player(entityContext(event.player, services))) return false;
            if (!matchesEntity(parent, event.parent, services)) return false;
            if (!matchesEntity(partner, event.partner, services)) return false;
            return matchesEntity(child, event.child, services);
        };
    },

    location: playerOnly,
    slept_in_bed: playerOnly,
    tick: playerOnly,
    hero_of_the_village: playerOnly,
    voluntary_exile: playerOnly,
    avoid_vibration: playerOnly,
    started_riding: playerOnly,

    cured_zombie_villager: (conditions, context) => {
        const player = playerField(conditions, context);
        const zombie = entityField(conditions, 'zombie', context);
        const villager = entityField(conditions, 'villager', context);
        return (event, services) => {
            if (!player(entityContext(event.player, services))) return false;
            if (!matchesEntity(zombie, event.zombie, services)) return false;
            return matchesEntity(villager, event.villager, services);
        };
    },

    villager_trade: (conditions, context) => {
        const player = playerField(conditions, context);
        const villager = entityField(conditions, 'villager', context);
        const item = itemField(conditions, 'item', context);
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!matchesEntity(villager, event.villager, services)) return false;
            return item(event.item, evaluation);
        };
    },

    item_durability_changed: (conditions, context) => {
        const player = playerField(conditions, context);
        const item = itemField(conditions, 'item', context);
        const durability = intRange(member(conditions, 'durability'), context.at('durability'));
        const delta = intRange(member(conditions, 'delta'), context.at('delta'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!item(event.item, evaluation)) return false;
            return durability(event.durability, evaluation) && delta(event.delta, evaluation);
        };
    },

    levitation: (conditions, context) => {
        const player = playerField(conditions, context);
        const distance = distanceField(conditions, 'distance', context);
        const duration = intRange(member(conditions, 'duration'), context.at('duration'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!duration(event.duration, evaluation)) return false;
            const position = event.player.position;
            if (!position) {
                services.diagnostics.error(context.path, 'the levitation distance needs the player position');
                return false;
            }
            return distance(event.startPosition, position, evaluation);
        };
    },

    changed_dimension: (conditions, context) => {
        const player = playerField(conditions, context);
        const from = asString(member(conditions, 'from'));
        const to = asString(member(conditions, 'to'));
        return (event, services) => {
            if (from !== undefined && namespaced(from) !== namespaced(event.from)) return false;
            if (to !== undefined && namespaced(to) !== namespaced(event.to)) return false;
            return player(entityContext(event.player, services));
        };
    },

    placed_block: usedOnLocation,
    item_used_on_block: usedOnLocation,
    allay_drop_item_on_block: usedOnLocation,

    default_block_use: blockUsed,
    any_block_use: blockUsed,

    effects_changed: (conditions, context) => {
        const player = playerField(conditions, context);
        const effects = present(conditions, 'effects')
            ? entityPredicate({ 'minecraft:effects': member(conditions, 'effects') }, context.at('effects'))
            : undefined;
        const source = entityField(conditions, 'source', context);
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (effects && !effects(event.player, evaluation)) return false;
            return matchesEntity(source, event.source, services);
        };
    },

    nether_travel: traveled,
    fall_from_height: traveled,
    ride_entity_in_lava: traveled,

    fall_after_explosion: (conditions, context) => {
        const fall = traveled(conditions, context);
        const cause = entityField(conditions, 'cause', context);
        return (event: FallAfterExplosionEvent, services) =>
            fall(event, services) && matchesEntity(cause, event.cause, services);
    },

    fishing_rod_hooked: (conditions, context) => {
        const player = playerField(conditions, context);
        const rod = itemField(conditions, 'rod', context);
        const entity = entityField(conditions, 'entity', context);
        const item = present(conditions, 'item') ? itemField(conditions, 'item', context) : undefined;
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!rod(event.rod, evaluation)) return false;
            if (!matchesEntity(entity, event.entity, services)) return false;
            return !item || event.items.some((stack) => item(stack, evaluation));
        };
    },

    channeled_lightning: (conditions, context) => {
        const player = playerField(conditions, context);
        const victims = conditionList(conditions, 'victims', context);
        return (event, services) => {
            if (!player(entityContext(event.player, services))) return false;
            return victims.every((test) => event.victims.some((victim) => test(entityContext(victim, services))));
        };
    },

    killed_by_arrow: (conditions, context) => {
        const player = playerField(conditions, context);
        const victims = conditionList(conditions, 'victims', context);
        const uniqueTypes = intRange(member(conditions, 'unique_entity_types'), context.at('unique_entity_types'));
        const firedFrom = present(conditions, 'fired_from_weapon')
            ? itemField(conditions, 'fired_from_weapon', context)
            : undefined;

        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (firedFrom && (!event.firedFromWeapon || !firedFrom(event.firedFromWeapon, evaluation))) return false;
            if (!matchDistinct(victims, event.victims, (victim) => entityContext(victim, services))) return false;
            const types = new Set(event.victims.map((victim) => namespaced(victim.type)));
            return uniqueTypes(types.size, evaluation);
        };
    },

    spear_mobs: (conditions, context) => {
        const player = playerField(conditions, context);
        const count = asNumber(member(conditions, 'count'));
        return (event, services) =>
            (count === undefined || count === event.count) && player(entityContext(event.player, services));
    },

    bee_nest_destroyed: (conditions, context) => {
        const player = playerField(conditions, context);
        const block = blockField(conditions, context);
        const item = itemField(conditions, 'item', context);
        const bees = intRange(member(conditions, 'num_bees_inside'), context.at('num_bees_inside'));
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!block(event.blockState, undefined, evaluation)) return false;
            return item(event.item, evaluation) && bees(event.beesInside, evaluation);
        };
    },

    target_hit: (conditions, context) => {
        const player = playerField(conditions, context);
        const signal = intRange(member(conditions, 'signal_strength'), context.at('signal_strength'));
        const projectile = entityField(conditions, 'projectile', context);
        return (event, services) => {
            const evaluation = entityContext(event.player, services);
            if (!player(evaluation)) return false;
            if (!signal(event.signalStrength, evaluation)) return false;
            return matchesEntity(projectile, event.projectile, services);
        };
    },

    player_generates_container_loot: (conditions, context) => {
        const player = playerField(conditions, context);
        const tables = memberIds(conditions, 'loot_tables', 'loot_table', context);
        return (event, services) =>
            tables.ids.has(namespaced(event.lootTable)) && player(entityContext(event.player, services));
    },

    thrown_item_picked_up_by_entity: pickedUpItem,
    thrown_item_picked_up_by_player: pickedUpItem,
    player_interacted_with_entity: pickedUpItem,
    player_sheared_equipment: pickedUpItem,

    lightning_strike: (conditions, context) => {
        const player = playerField(conditions, context);
        const lightning = entityField(conditions, 'lightning', context);
        const bystander = entityField(conditions, 'bystander', context);
        return (event, services) => {
            if (!player(entityContext(event.player, services))) return false;
            if (!matchesEntity(lightning, event.lightning, services)) return false;
            if (!bystander) return true;
            return event.bystanders.some((entity) => bystander(entityContext(entity, services)));
        };
    }
};

/**
 * The triggers whose event names one registry element, and the `conditions`
 * field that holds the ids it must be one of. The dispatch index keys criteria
 * of these triggers by those ids, which is what keeps the recipe-unlock path
 * off a scan through the 1739 vanilla criteria that use it.
 */
export const KEYED_TRIGGERS = {
    recipe_unlocked: { field: 'recipes', registry: 'recipe' },
    recipe_crafted: { field: 'recipes', registry: 'recipe' },
    crafter_recipe_crafted: { field: 'recipes', registry: 'recipe' },
    player_generates_container_loot: { field: 'loot_tables', registry: 'loot_table' }
} as const satisfies Partial<Record<TriggerName, { field: string; registry: 'recipe' | 'loot_table' }>>;

/** One of the keys of {@link KEYED_TRIGGERS}. */
export type KeyedTrigger = keyof typeof KEYED_TRIGGERS;

const isKeyedTrigger = (trigger: TriggerName): trigger is KeyedTrigger => trigger in KEYED_TRIGGERS;

/**
 * The registry ids a criterion can match, for a trigger {@link KEYED_TRIGGERS}
 * covers. Undefined means the criterion belongs in its trigger's linear
 * bucket, either because the trigger is not keyed or because the field is
 * absent.
 */
export const criterionKeys = (
    trigger: TriggerName,
    conditions: unknown,
    context: ParseContext
): readonly string[] | undefined => {
    if (!isKeyedTrigger(trigger)) return undefined;
    const { field, registry } = KEYED_TRIGGERS[trigger];
    if (!present(conditions, field)) return undefined;
    return [...resolveMembers(member(conditions, field), registry, context.at(field)).ids];
};

/** The registry id one event names, for a trigger {@link KEYED_TRIGGERS} covers. */
export const eventKey = (trigger: TriggerName, event: AnyTriggerEvent): string | undefined => {
    if (!isKeyedTrigger(trigger)) return undefined;
    if (trigger === 'player_generates_container_loot') {
        return 'lootTable' in event ? namespaced(event.lootTable) : undefined;
    }
    return 'recipe' in event ? namespaced(event.recipe) : undefined;
};

/**
 * Whether a string names one of {@link TRIGGER_TYPES}, with or without the
 * `minecraft:` namespace.
 */
export const isTriggerName = (value: string): value is TriggerName => TRIGGER_TYPES.some((known) => known === value);

/**
 * Compiles one criterion's `conditions` into a test over the event its trigger
 * declares.
 *
 * @param trigger - A registered trigger name without its namespace.
 */
export const parseTrigger = <K extends TriggerName>(
    trigger: K,
    conditions: unknown,
    context: ParseContext
): CriterionTest<K> => TRIGGERS[trigger](conditions, context);
