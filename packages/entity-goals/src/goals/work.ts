import type { EntityPosition, FilterItemView, Goal, ShareablesParams } from '@jsprismarine/entities';
import { isShareablesParams } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import type { RegisterableGoal } from '../goal';
import { blockIdentifiersOf } from '../blockNames';
import { goal } from '../goal';
import { centerOf } from '../navigation/view';
import type { GoalBody, GoalEvent, Range } from '../params';
import {
    bodySchema,
    booleanAt,
    eventAt,
    filterAt,
    isRecord,
    numberAt,
    rangeAt,
    recordsAt,
    stringAt,
    stringsAt,
    tickRangeAt,
    ticksAt
} from '../params';
import type { GoalSupport } from '../support';
import type { GoalBlockStates, GoalItem, GoalPickupOptions } from '../world';

interface PickupRule {
    readonly priority: number;
    readonly maxAmount: number;
    readonly pickupLimit: number;
    readonly admire: boolean;
    readonly barter: boolean;
    readonly consumeItem: boolean;
    readonly storedInInventory: boolean;
}

/** Matches a shareable name, auxiliary value, or Bedrock item tag. */
const itemMatches = (item: GoalItem, view: FilterItemView | undefined, name: string): boolean => {
    const identifier = view?.identifier() ?? item.identifier();
    if (name === identifier) return true;

    const split = name.lastIndexOf(':');
    const variant = split < 0 ? undefined : Number(name.slice(split + 1));
    if (split > 0 && Number.isInteger(variant) && name.slice(0, split) === identifier && view?.data?.() === variant)
        return true;

    return (
        view?.tags?.().includes(name) === true ||
        (name === 'minecraft:is_food' && view?.hasComponent?.('minecraft:food') === true)
    );
};

/** The first shareable rule matching this item, preserving Bedrock's source-order shadowing. */
const shareableRuleFor = (
    item: GoalItem,
    rules: ShareablesParams | undefined,
    canPickupAnyItem: boolean
): PickupRule | undefined => {
    const matching = rules?.items.find((rule) => rule.items.some((name) => itemMatches(item, item.filterView, name)));
    if (matching !== undefined) {
        return {
            priority: matching.priority,
            maxAmount: matching.maxAmount,
            pickupLimit: matching.pickupLimit,
            admire: matching.admire,
            barter: matching.barter,
            consumeItem: matching.consumeItem,
            storedInInventory: matching.storedInInventory
        };
    }
    if (rules?.allItems === true)
        return {
            priority: Number.MAX_SAFE_INTEGER,
            maxAmount: rules.allItemsMaxAmount,
            pickupLimit: -1,
            admire: false,
            barter: false,
            consumeItem: false,
            storedInInventory: false
        };
    if (canPickupAnyItem)
        return {
            priority: Number.MAX_SAFE_INTEGER,
            maxAmount: -1,
            pickupLimit: -1,
            admire: false,
            barter: false,
            consumeItem: false,
            storedInInventory: false
        };
    return undefined;
};

/**
 * The goals about jobs and items: a villager's work site, farming,
 * composting, picking things up, equipping them and placing blocks.
 *
 * Bedrock has no memory or point-of-interest registry, so the work site, the
 * farm block and the composter all come through
 * {@link GoalWorld.poi} and {@link GoalWorld.blocks}. Java reaches the same
 * outcomes through `AcquirePoi` and `WorkAtPoi` over its brain memories, which
 * is the difference the research note records between the two AI models.
 */

/** How long a villager works at its site before the goal lets go, from the vanilla `active_time`. */
const DEFAULT_ACTIVE_TIME = 200;

/** The chance a host with no per-mob pickup roll gives each attempt of a chance-based pickup. */
const PICKUP_CHANCE_PER_ATTEMPT = 0.1;

/** What `minecraft:behavior.pickup_items` declares. */
export interface PickupItemsParams {
    readonly speedMultiplier: number;
    /** How far the entity looks for an item, in blocks. */
    readonly maxDistance: number;
    /** How far it looks up and down, in blocks. */
    readonly searchHeight: number;
    /** How close it has to be to take the item, in blocks. */
    readonly goalRadius: number;
    /** Whether the entity picks up anything or only what it wants. */
    readonly canPickupAnyItem: boolean;
    /** Whether the pickup is gated on the entity's own chance. */
    readonly pickupBasedOnChance: boolean;
    /** Whether a picked-up item may go to the hand or the armor slots. */
    readonly canPickupToHandOrEquipment: boolean;
    /** Whether the entity only takes items matching what it already holds. */
    readonly pickupSameItemsAsInHand: boolean;
    /** Whether a full hand stops the goal. */
    readonly stopIfHoldingItem: boolean;
    /** Items the entity never takes. */
    readonly excludedItems: readonly string[];
    /** How long after being hurt before the entity picks things up again, in ticks. */
    readonly cooldownAfterBeingAttacked: number;
    readonly onPickupItemStart: GoalEvent | undefined;
    readonly onPickupItemEnd: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.pickup_items`, which 20 vanilla entities carry. It is
 * what makes a zombie pick up armor and a fox carry a berry.
 */
export const pickupItems = goal<PickupItemsParams>({
    name: 'minecraft:behavior.pickup_items',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        maxDistance: numberAt(body, 'max_dist', 3),
        searchHeight: numberAt(body, 'search_height', 1),
        goalRadius: numberAt(body, 'goal_radius', 2),
        canPickupAnyItem: booleanAt(body, 'can_pickup_any_item', false),
        pickupBasedOnChance: booleanAt(body, 'pickup_based_on_chance', false),
        canPickupToHandOrEquipment: booleanAt(body, 'can_pickup_to_hand_or_equipment', true),
        pickupSameItemsAsInHand: booleanAt(body, 'pickup_same_items_as_in_hand', false),
        stopIfHoldingItem: booleanAt(body, 'stop_if_holding_item', false),
        excludedItems: stringsAt(body, 'excluded_items'),
        cooldownAfterBeingAttacked: ticksAt(body, 'cooldown_after_being_attacked', 0),
        onPickupItemStart: eventAt(body, 'on_pickup_item_start'),
        onPickupItemEnd: eventAt(body, 'on_pickup_item_end')
    })),
    create: (params, support) => {
        let item: GoalItem | undefined;
        let itemCount = 0;
        let pickupOptions: GoalPickupOptions | undefined;

        const heldCount = (identifier: string): number => {
            const owned = support.world.itemCount?.(identifier);
            if (owned !== undefined) return owned;
            const inventory = support.world.inventory?.() ?? [];
            const count = inventory.filter((held) => held === identifier).length;
            return count + (support.world.carriedItem?.() === identifier ? 1 : 0);
        };

        const pickupCount = (candidate: GoalItem, rule: PickupRule, singularPickup: boolean): number => {
            const held = heldCount(candidate.identifier());
            if (singularPickup && held > 0) return 0;
            const maxAmount = rule.maxAmount < 0 ? Number.MAX_SAFE_INTEGER : rule.maxAmount;
            const remaining = maxAmount - held;
            if (remaining <= 0) return 0;

            const limit = rule.pickupLimit < 0 ? Number.MAX_SAFE_INTEGER : rule.pickupLimit;
            return Math.min(candidate.count(), remaining, limit);
        };

        const rulesOf = (): ShareablesParams | undefined => {
            const value = support.entity.componentParams('minecraft:shareables');
            return isShareablesParams(value) ? value : undefined;
        };

        return {
            canStart: () => {
                if (params.stopIfHoldingItem && support.world.carriedItem?.() !== undefined) return false;
                if (
                    params.pickupBasedOnChance &&
                    !(support.world.canPickUpLoot?.() ?? support.chance(PICKUP_CHANCE_PER_ATTEMPT))
                )
                    return false;
                const rules = rulesOf();
                const candidates = (support.world.items?.(params.maxDistance) ?? [])
                    .filter((candidate) => !params.excludedItems.includes(candidate.identifier()))
                    .filter(
                        (candidate) =>
                            !params.pickupSameItemsAsInHand || support.world.carriedItem?.() === candidate.identifier()
                    )
                    .flatMap((candidate) => {
                        const rule = shareableRuleFor(candidate, rules, params.canPickupAnyItem);
                        if (rule === undefined) return [];
                        const count = pickupCount(candidate, rule, rules?.singularPickup === true);
                        return count <= 0 ? [] : [{ candidate, count, rule }];
                    });
                candidates.sort(
                    (left, right) =>
                        left.rule.priority - right.rule.priority ||
                        support.distanceTo(left.candidate.position()) - support.distanceTo(right.candidate.position())
                );
                const selected = candidates[0];
                item = selected?.candidate;
                itemCount = selected?.count ?? 0;
                pickupOptions =
                    selected === undefined
                        ? undefined
                        : {
                              admire: selected.rule.admire,
                              barter: selected.rule.barter,
                              consumeItem: selected.rule.consumeItem,
                              canPickupToHandOrEquipment: params.canPickupToHandOrEquipment,
                              storedInInventory: selected.rule.storedInInventory
                          };
                return item !== undefined;
            },
            canContinue: () => item !== undefined && support.navigator.walking,
            start: () => {
                support.fire(params.onPickupItemStart);
                if (item !== undefined)
                    support.navigator.moveTo(item.position(), params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (item !== undefined) support.world.pickUp?.(item, itemCount, pickupOptions);
                support.fire(params.onPickupItemEnd);
                item = undefined;
                itemCount = 0;
                pickupOptions = undefined;
            },
            stop: () => {
                item = undefined;
                itemCount = 0;
                pickupOptions = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.equip_item`, which 17 vanilla entities carry. It puts
 * what `minecraft:behavior.pickup_items` collected into the right slot, which
 * is why vanilla gives both to the same entities at neighboring priorities.
 */
export const equipItem = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.equip_item',
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => (support.world.inventory?.() ?? []).length > 0,
        start: () => {
            const item = support.world.inventory?.()[0];
            if (item !== undefined) support.world.setCarriedItem?.(item);
        }
    })
});

/** What the villager work goals declare. */
export interface WorkParams {
    readonly speedMultiplier: number;
    /** How long one shift lasts, in ticks. */
    readonly activeTime: number;
    /** How long before the entity may work again, in ticks. */
    readonly goalCooldown: number;
    /** Whether the entity works in the rain. */
    readonly canWorkInRain: boolean;
    /** How long a shower may last before it stops the work, in ticks. */
    readonly workInRainTolerance: number;
    /** How long between work sounds, in ticks. */
    readonly soundDelay: Range;
    readonly onArrival: GoalEvent | undefined;
}

const workFrom = (body: GoalBody): WorkParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    activeTime: numberAt(body, 'active_time', DEFAULT_ACTIVE_TIME),
    goalCooldown: numberAt(body, 'goal_cooldown', 0),
    canWorkInRain: booleanAt(body, 'can_work_in_rain', false),
    workInRainTolerance: numberAt(body, 'work_in_rain_tolerance', 0),
    soundDelay: [numberAt(body, 'sound_delay_min', 0), numberAt(body, 'sound_delay_max', 0)] as const,
    onArrival: eventAt(body, 'on_arrival')
});

/** The shared loop for the two work goals: walk to the site and stand there for a shift. */
const workAt = (support: GoalSupport, params: WorkParams, poiType: string): Goal => {
    let site: EntityPosition | undefined;
    let remaining = 0;
    let cooldown = 0;
    let arrived = false;

    return {
        canStart: () => {
            if (cooldown > 0) {
                cooldown -= 1;
                return false;
            }
            if (!params.canWorkInRain && support.isRaining()) return false;
            site = support.world.poi?.(poiType, 16);
            return site !== undefined;
        },
        canContinue: () => remaining > 0,
        start: () => {
            remaining = params.activeTime;
            arrived = false;
            if (site !== undefined) support.navigator.moveTo(site, params.speedMultiplier, 1);
        },
        tick: () => {
            remaining -= 1;
            if (arrived) return;
            if (support.navigator.tick()) return;
            arrived = true;
            support.fire(params.onArrival);
        },
        stop: () => {
            remaining = 0;
            cooldown = params.goalCooldown;
            support.navigator.stop();
        }
    };
};

/**
 * `minecraft:behavior.work`, which the villager carries. The site is the job
 * block the villager's profession bound it to, and `on_arrival` is what
 * restocks its trades.
 */
export const work = goal<WorkParams>({
    name: 'minecraft:behavior.work',
    controlFlags: ['move', 'look'],
    schema: bodySchema(workFrom),
    create: (params, support) => workAt(support, params, 'work')
});

/**
 * `minecraft:behavior.work_composter`, which the farmer villager carries. It
 * is `work` with the composter's own site type, because a farmer composts
 * surplus crops rather than trading them.
 */
export const workComposter = goal<WorkParams>({
    name: 'minecraft:behavior.work_composter',
    controlFlags: ['move', 'look'],
    schema: bodySchema(workFrom),
    create: (params, support) => workAt(support, params, 'composter')
});

/** What the farm goals declare. */
export interface FarmParams {
    readonly speedMultiplier: number;
}

/**
 * `minecraft:behavior.harvest_farm_block`, which the farmer villager and the
 * villager_v2 carry. It walks to a grown crop and breaks it.
 */
export const harvestFarmBlock = goal<FarmParams>({
    name: 'minecraft:behavior.harvest_farm_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) => {
        let crop: EntityPosition | undefined;
        return {
            canStart: () => {
                const found = support.world.blocks?.({ range: 16, height: 1, limit: 1 })[0];
                crop = found === undefined ? undefined : centerOf(found.position);
                return crop !== undefined;
            },
            canContinue: () => crop !== undefined && support.navigator.walking,
            start: () => {
                if (crop !== undefined) support.navigator.moveTo(crop, params.speedMultiplier, 2);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (crop !== undefined) support.world.breakBlock?.(crop);
                crop = undefined;
            },
            stop: () => {
                crop = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.fertilize_farm_block`, which the farmer villager
 * carries. It is `harvest_farm_block` with bone meal instead of a break.
 */
export const fertilizeFarmBlock = goal<FarmParams>({
    name: 'minecraft:behavior.fertilize_farm_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) => {
        let crop: EntityPosition | undefined;
        return {
            canStart: () => {
                const found = support.world.blocks?.({
                    identifiers: ['minecraft:wheat'],
                    range: 16,
                    height: 1,
                    limit: 1
                })[0];
                crop = found === undefined ? undefined : centerOf(found.position);
                return crop !== undefined;
            },
            canContinue: () => crop !== undefined && support.navigator.walking,
            start: () => {
                if (crop !== undefined) support.navigator.moveTo(crop, params.speedMultiplier, 2);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (crop !== undefined) support.world.setBlock?.(crop, 'minecraft:wheat');
                crop = undefined;
            },
            stop: () => {
                crop = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.raid_garden` declares. */
export interface RaidGardenParams {
    readonly speedMultiplier: number;
    /** The crops the entity eats. */
    readonly blocks: readonly string[];
    /** How far it looks, in blocks. */
    readonly searchRange: number;
    readonly searchHeight: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** How long it waits before the first bite, in ticks. */
    readonly initialEatDelay: number;
    /** How many crops it eats before it stops. */
    readonly maxToEat: number;
}

/** The crop growth a raid needs and what eating one leaves, by Bedrock block. */
interface Harvest {
    /** Whether the block at its growth is worth raiding. */
    readonly ripe: (growth: number) => boolean;
    /** Eats or picks the block, and hands back what it leaves behind. */
    readonly eat: (
        support: GoalSupport,
        position: EntityPosition,
        block: { readonly identifier: string; readonly states: GoalBlockStates }
    ) => void;
}

/** A block's `growth` state, or 0 when it has none. */
const growthOf = (states: GoalBlockStates): number => {
    const growth = states['growth'];
    return typeof growth === 'number' ? growth : 0;
};

/**
 * Picks berries off a bush or a vine and drops the rest at its feet. With an empty mouth the
 * picker keeps one berry, which is how a fox ends up carrying it.
 */
const pickBerries = (support: GoalSupport, position: EntityPosition, item: string, count: number): void => {
    let left = count;
    if (support.world.carriedItem?.() === undefined && support.world.setCarriedItem !== undefined) {
        support.world.setCarriedItem(item);
        left -= 1;
    }
    for (let index = 0; index < left; index += 1) support.world.dropItem?.(item, position);
};

/** Java's `CaveVines.use`: the vine loses its berries and drops one glow berry. */
const caveVineHarvest: Harvest = {
    ripe: () => true,
    eat: (support, position, block) => {
        support.world.setBlock?.(position, 'minecraft:cave_vines', block.states);
        pickBerries(support, position, 'minecraft:glow_berries', 1);
    }
};

/**
 * What each raided crop does, after Java's `Fox.FoxEatBerriesGoal` and `Rabbit.RaidGardenGoal`.
 *
 * A fox picks a sweet berry bush that has berries, growth 2 or more, back to growth 1, for one
 * or two berries and one more from a full bush; a vine with glow berries loses them. A rabbit
 * eats into a fully grown carrot crop one stage at a time and removes it at the last.
 */
const HARVESTS: ReadonlyMap<string, Harvest> = new Map<string, Harvest>([
    [
        'minecraft:sweet_berry_bush',
        {
            ripe: (growth) => growth >= 2,
            eat: (support, position, block) => {
                const growth = growthOf(block.states);
                support.world.setBlock?.(position, block.identifier, { ...block.states, growth: 1 });
                pickBerries(
                    support,
                    position,
                    'minecraft:sweet_berries',
                    1 + support.randomInt(2) + (growth >= 3 ? 1 : 0)
                );
            }
        }
    ],
    ['minecraft:cave_vines_head_with_berries', caveVineHarvest],
    ['minecraft:cave_vines_body_with_berries', caveVineHarvest],
    [
        'minecraft:carrots',
        {
            ripe: (growth) => growth >= 7,
            eat: (support, position, block) => {
                const growth = growthOf(block.states);
                if (growth <= 0) support.world.breakBlock?.(position);
                else support.world.setBlock?.(position, block.identifier, { ...block.states, growth: growth - 1 });
            }
        }
    ]
]);

/**
 * `minecraft:behavior.raid_garden`, which the rabbit and the fox carry. The entity walks to a
 * ripe crop it raids and eats into it; a `max_to_eat` of 0 sets no limit. Crops whose growth the
 * goal knows follow Java's rules ({@link HARVESTS}); any other block a pack lists is broken.
 */
export const raidGarden = goal<RaidGardenParams>({
    name: 'minecraft:behavior.raid_garden',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        blocks: stringsAt(body, 'blocks'),
        searchRange: numberAt(body, 'search_range', 16),
        searchHeight: numberAt(body, 'search_height', 1),
        goalRadius: numberAt(body, 'goal_radius', 1),
        initialEatDelay: ticksAt(body, 'initial_eat_delay', 0),
        maxToEat: numberAt(body, 'max_to_eat', 6)
    })),
    create: (params, support) => {
        let crop: EntityPosition | undefined;
        let eaten = 0;
        let delay = 0;
        const sated = (): boolean => params.maxToEat > 0 && eaten >= params.maxToEat;
        const ripe = (position: EntityPosition, identifier: string): boolean => {
            const harvest = HARVESTS.get(identifier);
            if (harvest === undefined) return true;
            const block = support.world.blockAt?.(position);
            return block !== undefined && harvest.ripe(growthOf(block.states));
        };

        return {
            canStart: () => {
                if (sated()) return false;
                const found = support.world
                    .blocks?.({
                        identifiers: params.blocks,
                        range: params.searchRange,
                        height: params.searchHeight
                    })
                    .find((block) => ripe(block.position, block.identifier));
                crop = found === undefined ? undefined : centerOf(found.position);
                return crop !== undefined;
            },
            canContinue: () => crop !== undefined && !sated(),
            start: () => {
                delay = params.initialEatDelay;
                if (crop !== undefined) support.navigator.moveTo(crop, params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if ((delay -= 1) > 0) return;
                if (crop !== undefined) {
                    const block = support.world.blockAt?.(crop);
                    const harvest = block === undefined ? undefined : HARVESTS.get(block.identifier);
                    if (block !== undefined && harvest !== undefined) {
                        if (harvest.ripe(growthOf(block.states))) harvest.eat(support, crop, block);
                    } else support.world.breakBlock?.(crop);
                }
                eaten += 1;
                crop = undefined;
            },
            stop: () => {
                crop = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.inspect_bookshelf` declares. */
export interface InspectBookshelfParams {
    readonly speedMultiplier: number;
    readonly searchRange: number;
    readonly searchHeight: number;
    readonly searchCount: number;
    readonly goalRadius: number;
}

/**
 * `minecraft:behavior.inspect_bookshelf`, which the librarian villager
 * carries. It walks to a bookshelf and stands reading it.
 */
export const inspectBookshelf = goal<InspectBookshelfParams>({
    name: 'minecraft:behavior.inspect_bookshelf',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 16),
        searchHeight: numberAt(body, 'search_height', 4),
        searchCount: numberAt(body, 'search_count', 10),
        goalRadius: numberAt(body, 'goal_radius', 1.5)
    })),
    create: (params, support) => {
        /** How long the villager reads once it arrives, which is the vanilla inspect time. */
        const readTicks = 200;
        let shelf: EntityPosition | undefined;
        let reading = 0;

        return {
            canStart: () => {
                const found = support.world.blocks?.({
                    identifiers: ['minecraft:bookshelf'],
                    range: params.searchRange,
                    height: params.searchHeight,
                    limit: 1
                })[0];
                shelf = found === undefined ? undefined : centerOf(found.position);
                return shelf !== undefined;
            },
            canContinue: () => reading > 0 || support.navigator.walking,
            start: () => {
                reading = 0;
                if (shelf !== undefined) support.navigator.moveTo(shelf, params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (shelf !== undefined) support.lookAt(shelf);
                if (reading === 0) reading = readTicks;
                else reading -= 1;
            },
            stop: () => {
                reading = 0;
                shelf = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.transport_items` declares. */
export interface TransportItemsParams {
    /** The containers the entity takes items from. */
    readonly sourceContainerTypes: readonly string[];
    /** The containers it puts them into. */
    readonly destinationContainerTypes: readonly string[];
    /** How many items it moves at a time. */
    readonly maxStackSize: number;
    /** How many containers it visits before it gives up. */
    readonly maxVisitedContainers: number;
    /** How long it waits between runs, in ticks. */
    readonly idleCooldown: number;
    /** How long it waits before the first run, in ticks. */
    readonly initialCooldown: number;
    /** How far it looks for a container, in blocks. */
    readonly searchDistance: number;
    /** How it picks a container, which vanilla writes as a strategy name. */
    readonly searchStrategy: string | undefined;
    /** How it decides where an item goes. */
    readonly placeStrategy: string | undefined;
}

/**
 * `minecraft:behavior.transport_items`, which the copper golem carries. It
 * carries items between the containers it can reach.
 */
export const transportItems = goal<TransportItemsParams>({
    name: 'minecraft:behavior.transport_items',
    controlFlags: ['move'],
    schema: bodySchema((body) => {
        const distances = Array.isArray(body.search_distance)
            ? body.search_distance.filter((part) => typeof part === 'number')
            : [];
        return {
            sourceContainerTypes: stringsAt(body, 'source_container_types'),
            destinationContainerTypes: stringsAt(body, 'destination_container_types'),
            maxStackSize: numberAt(body, 'max_stack_size', 64),
            maxVisitedContainers: numberAt(body, 'max_visited_containers', 4),
            idleCooldown: ticksAt(body, 'idle_cooldown', 1),
            initialCooldown: ticksAt(body, 'initial_cooldown', 0),
            searchDistance: distances[0] ?? 8,
            searchStrategy: stringAt(body, 'search_strategy'),
            placeStrategy: stringAt(body, 'place_strategy')
        };
    }),
    create: (params, support) => {
        let container: EntityPosition | undefined;
        let cooldown = params.initialCooldown;
        const carrying = (): boolean => (support.world.inventory?.() ?? []).length > 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                const wanted = carrying() ? params.destinationContainerTypes : params.sourceContainerTypes;
                const found = support.world.blocks?.({
                    identifiers: wanted,
                    range: params.searchDistance,
                    height: params.searchDistance,
                    limit: 1
                })[0];
                container = found === undefined ? undefined : centerOf(found.position);
                return container !== undefined;
            },
            canContinue: () => container !== undefined && support.navigator.walking,
            start: () => {
                if (container !== undefined) support.navigator.moveTo(container, 1, 2);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                const where = container;
                if (where !== undefined && carrying()) {
                    const item = support.world.inventory?.()[0];
                    if (item !== undefined) support.world.dropItem?.(item, where);
                }
                container = undefined;
            },
            stop: () => {
                cooldown = params.idleCooldown;
                container = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.random_search_and_dig` declares. */
export interface RandomSearchAndDigParams {
    readonly speedMultiplier: number;
    /** The blocks the entity will dig in. */
    readonly targetBlocks: readonly string[];
    /** How far it looks horizontally, in blocks. */
    readonly searchRangeXz: number;
    /** How far it looks vertically, in blocks. */
    readonly searchRangeY: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** How long one dig takes, in ticks. */
    readonly diggingDuration: Range;
    /** How long before the entity digs again, in ticks. */
    readonly cooldown: Range;
    /** How many positions it tries before giving up. */
    readonly findValidPositionRetries: number;
    /** The table the find is rolled from. */
    readonly itemTable: string | undefined;
    /** How long after the dig the item appears, in ticks. */
    readonly spawnItemAfter: number;
    /** How far in front of the entity the item appears, in blocks. */
    readonly spawnItemPosOffset: number;
    readonly onSearchingStart: GoalEvent | undefined;
    readonly onDiggingStart: GoalEvent | undefined;
    readonly onItemFound: GoalEvent | undefined;
    readonly onSuccess: GoalEvent | undefined;
    readonly onFailDuringSearching: GoalEvent | undefined;
    readonly onFailDuringDigging: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.random_search_and_dig`, which the sniffer carries. The
 * entity walks to a diggable block, digs for a drawn time and leaves a seed
 * behind.
 */
export const randomSearchAndDig = goal<RandomSearchAndDigParams>({
    name: 'minecraft:behavior.random_search_and_dig',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        targetBlocks: stringsAt(body, 'target_blocks'),
        searchRangeXz: numberAt(body, 'search_range_xz', 16),
        searchRangeY: numberAt(body, 'search_range_y', 4),
        goalRadius: numberAt(body, 'goal_radius', 1),
        diggingDuration: tickRangeAt(body, 'digging_duration_range', [8, 10]),
        cooldown: tickRangeAt(body, 'cooldown_range', [5, 10]),
        findValidPositionRetries: numberAt(body, 'find_valid_position_retries', 5),
        itemTable: stringAt(body, 'item_table'),
        spawnItemAfter: ticksAt(body, 'spawn_item_after_seconds', 0),
        spawnItemPosOffset: numberAt(body, 'spawn_item_pos_offset', 0),
        onSearchingStart: eventAt(body, 'on_searching_start'),
        onDiggingStart: eventAt(body, 'on_digging_start'),
        onItemFound: eventAt(body, 'on_item_found'),
        onSuccess: eventAt(body, 'on_success'),
        onFailDuringSearching: eventAt(body, 'on_fail_during_searching'),
        onFailDuringDigging: eventAt(body, 'on_fail_during_digging')
    })),
    create: (params, support) => {
        let spot: EntityPosition | undefined;
        let digging = 0;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                const found = support.world.blocks?.({
                    identifiers: params.targetBlocks,
                    range: params.searchRangeXz,
                    height: params.searchRangeY,
                    limit: 1
                })[0];
                spot = found === undefined ? undefined : centerOf(found.position);
                if (spot === undefined) support.fire(params.onFailDuringSearching);
                return spot !== undefined;
            },
            canContinue: () => digging > 0 || support.navigator.walking,
            start: () => {
                digging = 0;
                support.fire(params.onSearchingStart);
                if (spot !== undefined) support.navigator.moveTo(spot, params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (digging === 0) {
                    digging = support.between(params.diggingDuration[0], params.diggingDuration[1]);
                    support.fire(params.onDiggingStart);
                    return;
                }
                if ((digging -= 1) > 0) return;
                support.fire(params.onItemFound);
                if (params.itemTable !== undefined && spot !== undefined)
                    support.world.dropLoot?.(params.itemTable, spot);
                support.fire(params.onSuccess);
            },
            stop: () => {
                digging = 0;
                cooldown = support.between(params.cooldown[0], params.cooldown[1]);
                spot = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.lay_egg` declares. */
export interface LayEggParams {
    readonly speedMultiplier: number;
    /** The blocks the entity lays on. */
    readonly targetBlocks: readonly string[];
    /** The blocks that may sit above the nest. */
    readonly targetMaterialsAboveBlock: readonly string[];
    readonly searchRange: number;
    readonly searchHeight: number;
    readonly goalRadius: number;
    /** How long the laying takes, in ticks. */
    readonly laySeconds: number;
    /** The egg block or entity to leave behind. */
    readonly eggType: string;
    readonly laySound: string | undefined;
    /** Whether the entity may lay while standing under the nest. */
    readonly allowLayingFromBelow: boolean;
    readonly useDefaultAnimation: boolean;
    readonly onLay: GoalEvent | undefined;
}

/** Bedrock's `turtle_egg_count` values, one to four eggs. */
const TURTLE_EGG_COUNTS = ['one_egg', 'two_egg', 'three_egg', 'four_egg'] as const;

/**
 * `minecraft:behavior.lay_egg`, which the turtle and the frog carry. The
 * entity walks to sand or a spawn-friendly block and leaves an egg in the open block over it.
 */
export const layEgg = goal<LayEggParams>({
    name: 'minecraft:behavior.lay_egg',
    controlFlags: ['move'],
    schema: bodySchema((body) => {
        const targets = stringsAt(body, 'target_blocks');
        return {
            speedMultiplier: numberAt(body, 'speed_multiplier', 1),
            // Bedrock's documented defaults, which the turtle's file leaves to them.
            targetBlocks: targets.length > 0 ? targets : ['minecraft:sand'],
            targetMaterialsAboveBlock: stringsAt(body, 'target_materials_above_block'),
            searchRange: numberAt(body, 'search_range', 16),
            searchHeight: numberAt(body, 'search_height', 4),
            goalRadius: numberAt(body, 'goal_radius', 1.5),
            laySeconds: ticksAt(body, 'lay_seconds', 10),
            eggType: stringAt(body, 'egg_type') ?? 'minecraft:turtle_egg',
            laySound: stringAt(body, 'lay_egg_sound'),
            allowLayingFromBelow: booleanAt(body, 'allow_laying_from_below', false),
            useDefaultAnimation: booleanAt(body, 'use_default_animation', true),
            onLay: eventAt(body, 'on_lay')
        };
    }),
    create: (params, support) => {
        /** The cell the egg goes in: the open block over a target block. */
        let nest: EntityPosition | undefined;
        let laying = 0;
        const open = (at: EntityPosition): boolean => {
            const above = support.world.blockAt?.(at)?.identifier ?? support.navigation()?.blockAt(at);
            return above === undefined || above === 'minecraft:air';
        };

        return {
            canStart: () => {
                const found = (
                    support.world.blocks?.({
                        identifiers: params.targetBlocks,
                        range: params.searchRange,
                        height: params.searchHeight
                    }) ?? []
                ).find((block) => open({ ...block.position, y: block.position.y + 1 }));
                nest = found === undefined ? undefined : centerOf({ ...found.position, y: found.position.y + 1 });
                return nest !== undefined;
            },
            canContinue: () =>
                nest !== undefined &&
                (laying > 0 || support.navigator.walking || support.distanceTo(nest) <= params.goalRadius),
            start: () => {
                laying = 0;
                if (nest !== undefined) support.navigator.moveTo(nest, params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (laying === 0) {
                    // Java's `TurtleLayEggGoal` digs for `adjustedTickDelay(200)` game ticks first.
                    laying = params.laySeconds;
                    support.playSound(params.laySound);
                    return;
                }
                if ((laying -= 1) > 0) return;
                if (nest !== undefined) {
                    // Java lays 1 to 4 turtle eggs, `random.nextInt(4) + 1`.
                    const states: GoalBlockStates =
                        params.eggType === 'minecraft:turtle_egg'
                            ? {
                                  turtle_egg_count:
                                      TURTLE_EGG_COUNTS[support.randomInt(TURTLE_EGG_COUNTS.length)] ?? 'one_egg'
                              }
                            : {};
                    support.world.setBlock?.(nest, params.eggType, states);
                }
                support.fire(params.onLay);
                nest = undefined;
            },
            stop: () => {
                laying = 0;
                nest = undefined;
                support.navigator.stop();
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.place_block` declares. */
export interface PlaceBlockParams {
    /** The chance per tick of placing, in [0, 1]. */
    readonly chance: number;
    /** How far from the entity the block may land, in blocks. */
    readonly xzRange: Range;
    readonly yRange: Range;
    /** The blocks the entity may place. */
    readonly placeableBlocks: readonly PlaceableBlock[];
    /** Whether the `mobGriefing` game rule gates the placement. */
    readonly affectedByGriefingRule: boolean;
    /** What has to be true of the position for the placement to happen. */
    readonly canPlace: Filter | undefined;
    readonly onPlace: GoalEvent | undefined;
}

/** One entry of `randomly_placeable_blocks`: a block, its states, and when it may be placed. */
interface PlaceableBlock {
    readonly name: string;
    readonly states: GoalBlockStates;
    readonly filter: Filter | undefined;
}

/** Reads an entry written as `{"block": {"name", "states"}, "filter"}`, or as `{"block": "name"}`. */
const placeableOf = (entry: GoalBody): PlaceableBlock => {
    const block = entry['block'];
    const name =
        typeof block === 'string' ? block : isRecord(block) && typeof block['name'] === 'string' ? block['name'] : '';
    const rawStates = isRecord(block) && isRecord(block['states']) ? block['states'] : {};
    const states: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(rawStates))
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') states[key] = value;
    return { name, states, filter: filterAt(entry, 'filter') };
};

/**
 * `minecraft:behavior.place_block`, which the enderman and the snow golem
 * carry. The docs describe the pair outright: "like Endermen placing their
 * carried block or snow golems leaving snow trails".
 */
export const placeBlock = goal<PlaceBlockParams>({
    name: 'minecraft:behavior.place_block',
    controlFlags: [],
    schema: bodySchema((body) => ({
        chance: numberAt(body, 'chance', 0.02),
        xzRange: rangeAt(body, 'xz_range', [0, 0]),
        yRange: rangeAt(body, 'y_range', [0, 0]),
        placeableBlocks: recordsAt(body, 'randomly_placeable_blocks')
            .map(placeableOf)
            .concat(
                stringsAt(body, 'randomly_placeable_blocks').map((name) => ({
                    name,
                    states: {},
                    filter: undefined
                }))
            )
            .filter((entry) => entry.name !== ''),
        affectedByGriefingRule: booleanAt(body, 'affected_by_griefing_rule', true),
        canPlace: filterAt(body, 'can_place'),
        onPlace: eventAt(body, 'on_place')
    })),
    create: (params, support) => ({
        canStart: () => support.chance(params.chance) && support.matches(params.canPlace),
        start: () => {
            const here = support.position();
            // Only the entries whose filter passes for the entity, such as the statue facing its way.
            const fitting = params.placeableBlocks.filter((entry) => support.matches(entry.filter));
            const listed = fitting[Math.floor(support.random() * fitting.length)];
            const block = listed?.name ?? support.world.carriedItem?.();
            if (block === undefined) return;
            if (params.affectedByGriefingRule && support.world.gameRule?.('mobGriefing') === false) return;
            const target = {
                x: Math.floor(here.x) + support.between(params.xzRange[0], params.xzRange[1]),
                y: Math.floor(here.y) + support.between(params.yRange[0], params.yRange[1]),
                z: Math.floor(here.z) + support.between(params.xzRange[0], params.xzRange[1])
            };
            // Java's EndermanLeaveBlockGoal puts a block only into air standing on something,
            // so a placement never replaces a block that is already there.
            const reach = Math.max(1, ...params.xzRange.map(Math.abs));
            const lift = Math.max(1, ...params.yRange.map(Math.abs)) + 1;
            const air = support.world.blocks?.({ identifiers: ['minecraft:air'], range: reach, height: lift });
            if (air !== undefined) {
                const isAir = (y: number): boolean =>
                    air.some(
                        (cell) =>
                            Math.floor(cell.position.x) === target.x &&
                            Math.floor(cell.position.y) === y &&
                            Math.floor(cell.position.z) === target.z
                    );
                if (!isAir(target.y) || isAir(target.y - 1)) return;
            }
            support.world.setBlock?.(target, block, listed?.states);
            // A carried block is put down, as Java's EndermanLeaveBlockGoal empties the arms.
            if (listed === undefined) support.world.setCarriedItem?.(undefined);
            support.fire(params.onPlace);
        }
    })
});

/** What `minecraft:behavior.take_block` declares. */
export interface TakeBlockParams {
    /** The chance per tick of taking a block, in [0, 1]. */
    readonly chance: number;
    readonly xzRange: Range;
    readonly yRange: Range;
    /** The blocks the entity may pick up. */
    readonly blocks: readonly string[];
}

/**
 * `minecraft:behavior.take_block`, which the enderman carries. It is the
 * other half of `place_block`, and the docs name the same pair.
 */
export const takeBlock = goal<TakeBlockParams>({
    name: 'minecraft:behavior.take_block',
    controlFlags: [],
    schema: bodySchema((body) => ({
        chance: numberAt(body, 'chance', 0.02),
        xzRange: rangeAt(body, 'xz_range', [0, 0]),
        yRange: rangeAt(body, 'y_range', [0, 0]),
        blocks: stringsAt(body, 'blocks').flatMap(blockIdentifiersOf)
    })),
    create: (params, support) => ({
        canStart: () => support.world.carriedItem?.() === undefined && support.chance(params.chance),
        start: () => {
            if (support.world.gameRule?.('mobGriefing') === false) return;
            const found = support.world.blocks?.({
                identifiers: params.blocks,
                range: Math.max(1, params.xzRange[1]),
                height: Math.max(1, params.yRange[1]),
                limit: 1
            })[0];
            if (found === undefined) return;
            // Java's EndermanTakeBlockGoal lifts the block out with removeBlock, which drops
            // nothing: the block is in the enderman's arms, not on the ground as well.
            support.world.setBlock?.(found.position, 'minecraft:air');
            support.world.setCarriedItem?.(found.identifier);
        }
    })
});

/** What `minecraft:behavior.stomp_turtle_egg` declares. */
export interface StompTurtleEggParams {
    readonly speedMultiplier: number;
    /** How far the entity looks for eggs, in blocks. */
    readonly searchRange: number;
    readonly searchHeight: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** One tick in this many starts a search. */
    readonly interval: number;
}

/**
 * `minecraft:behavior.stomp_turtle_egg`, which the six zombie types carry.
 * The entity walks to a turtle egg and breaks it, which is what makes turtles
 * hard to raise near a beach.
 */
export const stompTurtleEgg = goal<StompTurtleEggParams>({
    name: 'minecraft:behavior.stomp_turtle_egg',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 10),
        searchHeight: numberAt(body, 'search_height', 2),
        goalRadius: numberAt(body, 'goal_radius', 1.14),
        interval: numberAt(body, 'interval', 20)
    })),
    create: (params, support) => {
        let egg: EntityPosition | undefined;
        return {
            canStart: () => {
                if (params.interval > 0 && !support.chance(1 / params.interval)) return false;
                const found = support.world.blocks?.({
                    identifiers: ['minecraft:turtle_egg'],
                    range: params.searchRange,
                    height: params.searchHeight,
                    limit: 1
                })[0];
                egg = found === undefined ? undefined : centerOf(found.position);
                return egg !== undefined;
            },
            canContinue: () => egg !== undefined && support.navigator.walking,
            start: () => {
                if (egg !== undefined) support.navigator.moveTo(egg, params.speedMultiplier, params.goalRadius);
            },
            tick: () => {
                if (support.navigator.tick()) return;
                if (egg !== undefined) support.world.breakBlock?.(egg);
                egg = undefined;
            },
            stop: () => {
                egg = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** Every goal in the work and item family. */
export const workGoals: readonly RegisterableGoal[] = [
    pickupItems,
    equipItem,
    work,
    workComposter,
    harvestFarmBlock,
    fertilizeFarmBlock,
    raidGarden,
    inspectBookshelf,
    transportItems,
    randomSearchAndDig,
    layEgg,
    placeBlock,
    takeBlock,
    stompTurtleEgg
];
