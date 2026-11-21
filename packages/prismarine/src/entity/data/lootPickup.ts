/**
 * The items a mob picks up by touching them, transcribed from Java's `Mob.aiStep`.
 *
 * Every tick, a mob whose `canPickUpLoot` is set, while `mobGriefing` is on, looks at each item
 * entity its box touches once grown by `Mob.ITEM_PICKUP_REACH`, a block sideways, skips one whose
 * pickup delay has not run out, and takes each one its class's `wantsToPickUp` accepts through its
 * class's `pickUpItem`. No goal runs it, so a zombie chasing a player still puts on a helmet it
 * walks over. Bedrock's `minecraft:behavior.pickup_items` only walks a mob to items: the runtime
 * runs the touch here for the mobs whose Java class picks up, by the rule each class follows.
 */
import type { ContentPosition } from '../../content/world/adapter';

/** Which Java class's `wantsToPickUp` and `pickUpItem` a mob follows. */
export type LootPickupRule =
    /** `Piglin` through `PiglinAi.wantsToPickup` and `PiglinAi.pickUpItem`. */
    | 'piglin'
    /** `Villager.wantsToPickUp` and `InventoryCarrier.pickUpItem`. */
    | 'villager'
    /** `SulfurCube.canHoldItem` and `pickUpItem`, which swallow one block into its body. */
    | 'swallow'
    /**
     * `Mob.pickUpItem` through `equipItemIfPossible`, for `Zombie` and `AbstractSkeleton`, whose
     * `finalizeSpawn` rolls `canPickUpLoot` from the regional difficulty.
     */
    | 'equip';

/** `Mob.ITEM_PICKUP_REACH`: how far past its box a mob reaches sideways, and not at all up or down. */
export const ITEM_PICKUP_REACH = 1;

/** Half the width of an item entity's box, which `EntityType.ITEM` sizes at 0.25 by 0.25. */
const ITEM_HALF_WIDTH = 0.125;

/** The height of an item entity's box. */
const ITEM_HEIGHT = 0.25;

/** The furthest an item a mob reaches can lie from the mob's position, for an index query. */
export const pickupQueryRadius = (box: { readonly width: number; readonly height: number }): number =>
    Math.hypot(box.width / 2 + ITEM_PICKUP_REACH + ITEM_HALF_WIDTH, box.height + ITEM_HEIGHT);

/** A mob's position and box, as the reach test reads them. */
export interface PickupReacher {
    readonly position: ContentPosition;
    readonly width: number;
    readonly height: number;
}

const overlaps = (low: number, high: number, otherLow: number, otherHigh: number): boolean =>
    low < otherHigh && otherLow < high;

/**
 * Whether an item entity lying at `item` touches a mob's box grown by {@link ITEM_PICKUP_REACH}
 * sideways, Java's `getBoundingBox().inflate(1, 0, 1)` read through `getEntitiesOfClass`.
 */
export const inPickupReach = (mob: PickupReacher, item: ContentPosition): boolean => {
    const half = mob.width / 2 + ITEM_PICKUP_REACH;
    const { x, y, z } = mob.position;
    return (
        overlaps(x - half, x + half, item.x - ITEM_HALF_WIDTH, item.x + ITEM_HALF_WIDTH) &&
        overlaps(y, y + mob.height, item.y, item.y + ITEM_HEIGHT) &&
        overlaps(z - half, z + half, item.z - ITEM_HALF_WIDTH, item.z + ITEM_HALF_WIDTH)
    );
};

/** `VillagerProfession.requestedItems` of the farmer, the one profession that requests any. */
export const FARMER_REQUESTED_ITEMS: ReadonlySet<string> = new Set([
    'minecraft:wheat',
    'minecraft:wheat_seeds',
    'minecraft:beetroot_seeds',
    'minecraft:bone_meal'
]);

/** What `Villager.wantsToPickUp` reads of an item. */
export interface VillagerPickupItem {
    readonly identifier: string;
    /** Whether the item is in Java's `#minecraft:villager_picks_up` item tag. */
    readonly picksUp: boolean;
    /** Whether the item carries Java's `minecraft:villager_food` component. */
    readonly villagerFood: boolean;
}

/**
 * `Villager.wantsToPickUp` before its inventory check: an item in `#villager_picks_up`, a food a
 * villager eats, or one the villager's profession requests, whatever the profession.
 */
export const villagerWants = (item: VillagerPickupItem, profession: string | undefined): boolean =>
    item.picksUp || item.villagerFood || (profession === 'farmer' && FARMER_REQUESTED_ITEMS.has(item.identifier));
