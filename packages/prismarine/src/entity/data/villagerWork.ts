/**
 * What a villager does with the world: composting, farming, sharing food and the bookkeeping of
 * its eight-slot inventory.
 *
 * The brain in `@jsprismarine/entity-brains` decides when a villager works; this module is the
 * half Java keeps in `WorkAtComposter`, `HarvestFarmland`, `UseBonemeal` and `TradeWithVillager`.
 * It works on the entity's flat `inventory` list (one identifier per item) and on the dimension's
 * block access, so it can be tested without a runtime.
 */
import type { RandomSource } from '@jsprismarine/predicates';

import type { ContentBlockAccess, ContentEffectSink, ContentPosition } from '../../content/world/adapter';

/** What the work needs of the world it happens in. */
export interface VillagerWorld {
    readonly blocks: ContentBlockAccess;
    readonly effects: ContentEffectSink;
    readonly random: RandomSource;
}

/** Java's `Villager.FOOD_POINTS`: what each food counts for towards having a child. */
export const FOOD_POINTS: ReadonlyMap<string, number> = new Map([
    ['minecraft:bread', 4],
    ['minecraft:potato', 1],
    ['minecraft:carrot', 1],
    ['minecraft:beetroot', 1]
]);

/** Java's `Villager.breedingFoodThreshold`: a villager is willing with this many food points. */
export const WILLING_FOOD_POINTS = 12;

/** Java's `Items.WHEAT.getDefaultMaxStackSize()`, which the farmers' sharing thresholds halve. */
const STACK_SIZE = 64;

/** What a composter takes from a villager, and the chance each item adds a layer. */
const COMPOSTABLE: ReadonlyMap<string, number> = new Map([
    ['minecraft:wheat_seeds', 0.3],
    ['minecraft:beetroot_seeds', 0.3]
]);

/** The level at which a composter holds bone meal ready to take. */
const COMPOSTER_READY = 8;

/** Bread a villager stops baking at. */
const BREAD_CAP = 36;

/** A crop's seed and the crop block it plants. */
const SEEDS: ReadonlyMap<string, string> = new Map([
    ['minecraft:wheat_seeds', 'minecraft:wheat'],
    ['minecraft:carrot', 'minecraft:carrots'],
    ['minecraft:potato', 'minecraft:potatoes'],
    ['minecraft:beetroot_seeds', 'minecraft:beetroot']
]);

/** The highest `growth` a crop reaches. */
const MATURE_GROWTH = 7;

/** How many blocks around itself a farmer looks for work, horizontally. */
const FARM_RADIUS = 4;

/** Counts one item in a flat inventory. */
export const countOf = (inventory: readonly string[], identifier: string): number =>
    inventory.filter((held) => held === identifier).length;

/** Takes up to `count` of one item out of a flat inventory and returns how many went. */
export const takeFrom = (inventory: string[], identifier: string, count: number): number => {
    let taken = 0;
    for (let index = inventory.length - 1; index >= 0 && taken < count; index -= 1) {
        if (inventory[index] !== identifier) continue;
        inventory.splice(index, 1);
        taken += 1;
    }
    return taken;
};

/** Puts `count` of one item into a flat inventory. */
export const giveTo = (inventory: string[], identifier: string, count: number): void => {
    for (let index = 0; index < count; index += 1) inventory.push(identifier);
};

/** The food points an inventory holds. */
export const foodPointsOf = (inventory: readonly string[]): number => {
    let points = 0;
    for (const item of inventory) points += FOOD_POINTS.get(item) ?? 0;
    return points;
};

/**
 * Moves half of the first stack of any of `items` into another inventory, which stands in for
 * Java's `throwHalfStack`: a villager throws it and the other one picks it up.
 *
 * @returns Whether anything moved.
 */
export const shareHalf = (from: string[], to: string[], items: ReadonlySet<string>): boolean => {
    for (const identifier of items) {
        const held = countOf(from, identifier);
        if (held === 0) continue;
        const moved = takeFrom(from, identifier, held > 1 ? Math.floor(held / 2) : held);
        giveTo(to, identifier, moved);
        return moved > 0;
    }
    return false;
};

/**
 * Java's `TradeWithVillager`: a villager gives food to one that has too little for a child,
 * and a farmer gives a farmer its surplus wheat and seeds.
 */
export const shareWithVillager = (
    inventory: string[],
    partner: string[],
    partnerIsFarmer: boolean,
    selfIsFarmer: boolean
): boolean => {
    let shared = false;
    if (foodPointsOf(partner) < WILLING_FOOD_POINTS) {
        shared = shareHalf(inventory, partner, new Set(FOOD_POINTS.keys())) || shared;
    }
    if (selfIsFarmer && partnerIsFarmer) {
        if (countOf(inventory, 'minecraft:wheat') > STACK_SIZE / 2) {
            shared = shareHalf(inventory, partner, new Set(['minecraft:wheat'])) || shared;
        }
        for (const seed of SEEDS.keys()) {
            if (seed === 'minecraft:carrot' || seed === 'minecraft:potato') continue;
            if (countOf(inventory, seed) > STACK_SIZE / 2) {
                shared = shareHalf(inventory, partner, new Set([seed])) || shared;
            }
        }
    }
    return shared;
};

/** Java's `eatAndDigestFood`: spends food from the inventory until `points` are used. */
export const digest = (inventory: string[], points: number): void => {
    let remaining = points;
    for (const [food, worth] of FOOD_POINTS) {
        while (remaining > 0 && takeFrom(inventory, food, 1) > 0) remaining -= worth;
    }
};

const bake = (inventory: string[]): void => {
    if (countOf(inventory, 'minecraft:bread') > BREAD_CAP) return;
    const loaves = Math.min(3, Math.floor(countOf(inventory, 'minecraft:wheat') / 3));
    if (loaves === 0) return;
    takeFrom(inventory, 'minecraft:wheat', loaves * 3);
    giveTo(inventory, 'minecraft:bread', loaves);
};

/**
 * Java's `WorkAtComposter.useWorkstation`: bakes bread from wheat, composts seeds and collects
 * the bone meal when the composter is full.
 *
 * @returns Whether the block at `at` was a composter.
 */
export const workAtComposter = (world: VillagerWorld, inventory: string[], at: ContentPosition): boolean => {
    const block = world.blocks.get(at);
    if (block?.identifier !== 'minecraft:composter') return false;

    bake(inventory);

    let level = Number(block.states.composter_fill_level ?? 0);
    const before = level;
    for (const [seed, chance] of COMPOSTABLE) {
        while (level < COMPOSTER_READY && countOf(inventory, seed) > 0) {
            takeFrom(inventory, seed, 1);
            if (world.random.nextFloat() < chance) level += 1;
        }
    }
    if (level === COMPOSTER_READY) {
        giveTo(inventory, 'minecraft:bone_meal', 1);
        level = 0;
        world.effects.playSound(at, 'block.composter.empty');
    } else if (level !== before) {
        world.effects.playSound(at, 'block.composter.fill_success');
    }
    if (level !== before) {
        world.blocks.set(
            at,
            { identifier: block.identifier, states: { ...block.states, composter_fill_level: level } },
            true
        );
    }
    return true;
};

const growthOf = (block: { readonly states: Readonly<Record<string, unknown>> }): number =>
    Number(block.states.growth ?? 0);

const isCrop = (identifier: string): boolean => [...SEEDS.values()].includes(identifier);

/** Where a farmer has work to do within reach: ripe crops, bare farmland it can sow, or crops to feed. */
export const farmWorkAround = (
    world: VillagerWorld,
    inventory: readonly string[],
    around: ContentPosition,
    task: 'harvest_farmland' | 'use_bonemeal'
): ContentPosition | undefined => {
    const hasSeed = [...SEEDS.keys()].some((seed) => countOf(inventory, seed) > 0);
    const hasBoneMeal = countOf(inventory, 'minecraft:bone_meal') > 0;
    if (task === 'use_bonemeal' && !hasBoneMeal) return undefined;

    const found: ContentPosition[] = [];
    for (let dx = -FARM_RADIUS; dx <= FARM_RADIUS; dx += 1) {
        for (let dz = -FARM_RADIUS; dz <= FARM_RADIUS; dz += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const at = { x: around.x + dx, y: around.y + dy, z: around.z + dz };
                const block = world.blocks.get(at);
                if (block === undefined) continue;
                if (task === 'use_bonemeal') {
                    if (isCrop(block.identifier) && growthOf(block) < MATURE_GROWTH) found.push(at);
                    continue;
                }
                if (isCrop(block.identifier) && growthOf(block) >= MATURE_GROWTH) found.push(at);
                else if (
                    hasSeed &&
                    block.identifier === 'minecraft:air' &&
                    world.blocks.get({ ...at, y: at.y - 1 })?.identifier === 'minecraft:farmland'
                ) {
                    found.push(at);
                }
            }
        }
    }
    return found.length === 0 ? undefined : found[world.random.nextInt(found.length)];
};

/** What a ripe crop gives: itself and the extras Java's loot tables roll, as a flat list. */
const harvestOf = (world: VillagerWorld, crop: string): string[] => {
    const bonus = (): number => {
        let extra = 0;
        for (let roll = 0; roll < 3; roll += 1) if (world.random.nextFloat() < 0.5714) extra += 1;
        return extra;
    };
    const drops: string[] = [];
    switch (crop) {
        case 'minecraft:wheat':
            drops.push('minecraft:wheat');
            for (let n = bonus(); n > 0; n -= 1) drops.push('minecraft:wheat_seeds');
            break;
        case 'minecraft:carrots':
            for (let n = 1 + bonus(); n > 0; n -= 1) drops.push('minecraft:carrot');
            break;
        case 'minecraft:potatoes':
            for (let n = 1 + bonus(); n > 0; n -= 1) drops.push('minecraft:potato');
            break;
        default:
            drops.push('minecraft:beetroot');
            for (let n = bonus(); n > 0; n -= 1) drops.push('minecraft:beetroot_seeds');
    }
    return drops;
};

/** Java's `HarvestFarmland`: breaks a ripe crop into the inventory and sows the field again. */
export const harvestFarmland = (world: VillagerWorld, inventory: string[], at: ContentPosition): boolean => {
    const block = world.blocks.get(at);
    if (block === undefined) return false;

    let changed = false;
    if (isCrop(block.identifier) && growthOf(block) >= MATURE_GROWTH) {
        inventory.push(...harvestOf(world, block.identifier));
        world.blocks.set(at, { identifier: 'minecraft:air', states: {} }, true);
        world.effects.playSound(at, 'dig.grass');
        changed = true;
    }
    const now = world.blocks.get(at);
    if (
        now?.identifier === 'minecraft:air' &&
        world.blocks.get({ ...at, y: at.y - 1 })?.identifier === 'minecraft:farmland'
    ) {
        for (const [seed, crop] of SEEDS) {
            if (takeFrom(inventory, seed, 1) === 0) continue;
            world.blocks.set(at, { identifier: crop, states: { growth: 0 } }, true);
            world.effects.playSound(at, 'dig.grass');
            changed = true;
            break;
        }
    }
    return changed;
};

/** Java's `UseBonemeal`: spends one bone meal to grow a crop by a few stages. */
export const useBonemeal = (world: VillagerWorld, inventory: string[], at: ContentPosition): boolean => {
    const block = world.blocks.get(at);
    if (block === undefined || !isCrop(block.identifier) || growthOf(block) >= MATURE_GROWTH) return false;
    if (takeFrom(inventory, 'minecraft:bone_meal', 1) === 0) return false;

    const grown = Math.min(MATURE_GROWTH, growthOf(block) + 2 + world.random.nextInt(4));
    world.blocks.set(at, { identifier: block.identifier, states: { ...block.states, growth: grown } }, true);
    world.effects.spawnParticle(at, 'minecraft:crop_growth_emitter');
    return true;
};
