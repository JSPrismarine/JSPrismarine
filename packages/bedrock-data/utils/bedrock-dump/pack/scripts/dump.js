/**
 * Asks a running Bedrock Dedicated Server what it knows, and writes the answers to the content log.
 *
 * The engine holds registries no file in the zip carries: the internal block and item lists, the
 * tags on every block and item, the per-block state domains, stack sizes, durability, food values,
 * enchantment maximums, biome tags, and the component set each entity ends up with once its
 * component groups resolve. The Script API can be asked for all of it, and a development behavior
 * pack is the only way to ask.
 *
 * Every row goes out as `DUMP <table> <json>` on the content log, which reaches stdout only with
 * `content-log-console-output-enabled=true`. `utils/bedrock-dump/protocol.ts` parses the lines
 * back into tables and owns the prefix; this file repeats the literal because a behavior pack
 * cannot import from the repository, and `protocol.test.ts` pins the two together.
 *
 * Every pass is a generator handed to `system.runJob`, yielding after each type, because
 * `script-watchdog-hang-threshold` kills a script that spends too long inside one tick and there
 * are 1477 block types to walk.
 */

import {
    BiomeTypes,
    BlockPermutation,
    BlockStates,
    BlockTypes,
    DimensionTypes,
    EffectTypes,
    EnchantmentTypes,
    EntityTypes,
    ItemStack,
    ItemTypes,
    LiquidType,
    Potions,
    system,
    world
} from '@minecraft/server';

/** Shared with `utils/bedrock-dump/protocol.ts`, which parses what this writes. */
const PREFIX = 'DUMP ';

/** Where the entity pass spawns, and the chunk the block pass needs loaded. */
const ORIGIN = { x: 0, y: 100, z: 0 };

let rows = 0;
let errors = 0;

const emit = (table, value) => {
    rows++;
    console.warn(`${PREFIX}${table} ${JSON.stringify(value)}`);
};

/** Records what a pass could not produce instead of failing the run, and counts it. */
const failed = (table, id, error) => {
    errors++;
    emit('errors', { table, id, message: String(error && error.message ? error.message : error) });
};

/** An iterable the engine may hand back as an array, a set or an iterator. */
const list = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value[Symbol.iterator] === 'function') return Array.from(value);
    return [];
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * The values a property is declared with, game wide. A starting set, not the answer: `age` is
 * declared 0..15 and cocoa takes 0..2, so each value is then offered to the block itself.
 */
const candidates = (name, fallback) => {
    try {
        const values = list(BlockStates.get(name)?.validValues);
        if (values.length > 0) return values;
    } catch {
        /* The engine has no declaration for this property; the block's own value is the domain. */
    }
    return [fallback];
};

const accepted = (blockId, property, values) =>
    values.filter((value) => {
        try {
            return BlockPermutation.resolve(blockId, { [property]: value }).getAllStates()[property] === value;
        } catch {
            return false;
        }
    });

/** Each property of a block with the values the block accepts and its default value. */
const domainsOf = (blockId) =>
    Object.entries(BlockPermutation.resolve(blockId).getAllStates()).map(([name, value]) => {
        const domain = accepted(blockId, name, candidates(name, value));
        return { name, values: domain.length > 0 ? domain : [value], default: value };
    });

/** Every combination of the given property values, as a state map. */
function* combinations(domains, at = 0, states = {}) {
    if (at === domains.length) {
        yield states;
        return;
    }
    const { name, values } = domains[at];
    for (const value of values) yield* combinations(domains, at + 1, { ...states, [name]: value });
}

/** What water does to one permutation, as the four Script API questions answer it. */
const waterOf = (permutation) => ({
    contain: permutation.canContainLiquid(LiquidType.Water),
    blocking: permutation.isLiquidBlocking(LiquidType.Water),
    destroyed: permutation.canBeDestroyedByLiquidSpread(LiquidType.Water),
    spawns: permutation.liquidSpreadCausesSpawn(LiquidType.Water)
});

const sameWater = (left, right) =>
    left.contain === right.contain &&
    left.blocking === right.blocking &&
    left.destroyed === right.destroyed &&
    left.spawns === right.spawns;

/**
 * The permutations of a block whose water answers differ from the default permutation's.
 *
 * Every combination of every property the Script API reports is asked, which includes the legacy
 * properties a flattened block still carries, so the network states are a subset of what is
 * covered. Only the differences are kept, so the table stays one row per block type. An empty
 * list says every permutation answers like the default.
 */
const waterPermutationsOf = (blockId, water) => {
    const differing = [];
    for (const states of combinations(domainsOf(blockId))) {
        let answer;
        try {
            answer = waterOf(BlockPermutation.resolve(blockId, states));
        } catch (error) {
            failed('block-types', `${blockId} ${JSON.stringify(states)}`, error);
            continue;
        }
        if (!sameWater(answer, water)) differing.push({ states, water: answer });
    }
    return differing;
};

function* blockTypes() {
    for (const type of BlockTypes.getAll()) {
        try {
            const permutation = BlockPermutation.resolve(type.id);
            const stack = permutation.getItemStack(1);
            const water = waterOf(permutation);
            emit('block-types', {
                id: type.id,
                localizationKey: type.localizationKey,
                tags: list(permutation.getTags()).sort(),
                item: stack ? stack.typeId : null,
                water,
                waterPermutations: waterPermutationsOf(type.id, water)
            });
        } catch (error) {
            failed('block-types', type.id, error);
        }
        yield;
    }
}

function* blockDomains() {
    for (const type of BlockTypes.getAll()) {
        try {
            const props = {};
            for (const domain of domainsOf(type.id)) {
                props[domain.name] = { values: domain.values, default: domain.default };
            }
            emit('block-domains', { name: type.id, props });
        } catch (error) {
            failed('block-domains', type.id, error);
        }
        yield;
    }
}

function* blockStates() {
    for (const state of BlockStates.getAll()) {
        emit('block-states', { id: state.id, validValues: list(state.validValues) });
        yield;
    }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Reads one item component, or undefined when the item does not have it. */
const component = (stack, id, read) => {
    const found = stack.getComponent(id);
    return found === undefined ? undefined : read(found);
};

function* items() {
    for (const type of ItemTypes.getAll()) {
        try {
            const stack = new ItemStack(type.id, 1);
            emit('items', {
                id: type.id,
                localizationKey: type.localizationKey,
                maxAmount: stack.maxAmount,
                stackable: stack.isStackable,
                weight: stack.weight,
                tags: list(stack.getTags()).sort(),
                durability: component(stack, 'minecraft:durability', (c) => ({
                    maxDurability: c.maxDurability
                })),
                food: component(stack, 'minecraft:food', (c) => ({
                    nutrition: c.nutrition,
                    saturationModifier: c.saturationModifier,
                    canAlwaysEat: c.canAlwaysEat,
                    usingConvertsTo: c.usingConvertsTo
                })),
                cooldown: component(stack, 'minecraft:cooldown', (c) => ({
                    category: c.cooldownCategory,
                    ticks: c.cooldownTicks
                })),
                enchantable: component(stack, 'minecraft:enchantable', (c) => ({ slots: list(c.slots) })),
                potion: component(stack, 'minecraft:potion', (c) => ({
                    effect: c.potionEffectType?.id,
                    delivery: c.potionDeliveryType?.id
                })),
                dyeable: component(stack, 'minecraft:dyeable', (c) => ({ defaultColor: c.defaultColor })),
                compostable: component(stack, 'minecraft:compostable', (c) => ({
                    chance: c.compostingChance
                })),
                inventorySize: component(stack, 'minecraft:inventory', (c) => c.container?.size)
            });
        } catch (error) {
            failed('items', type.id, error);
        }
        yield;
    }
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** The attribute components every mob the server simulates carries. */
const ATTRIBUTES = [
    'minecraft:health',
    'minecraft:movement',
    'minecraft:underwater_movement',
    'minecraft:lava_movement',
    'minecraft:flying_speed'
];

function* entities(dimension) {
    for (const type of EntityTypes.getAll()) {
        let entity;
        try {
            entity = dimension.spawnEntity(type.id, ORIGIN);
            const attributes = {};
            for (const id of ATTRIBUTES) {
                const found = entity.getComponent(id);
                if (found === undefined) continue;
                attributes[id] = {
                    current: found.currentValue,
                    default: found.defaultValue,
                    min: found.effectiveMin,
                    max: found.effectiveMax
                };
            }
            const box = entity.getAABB();
            emit('entities', {
                id: type.id,
                localizationKey: type.localizationKey,
                aabb: box ? { min: box.min, max: box.max } : null,
                families: list(entity.getComponent('minecraft:type_family')?.getTypeFamilies()).sort(),
                components: list(entity.getComponents())
                    .map((found) => found.typeId)
                    .sort(),
                attributes
            });
        } catch (error) {
            failed('entities', type.id, error);
        } finally {
            try {
                entity?.remove();
            } catch {
                /* Already gone, which is what we wanted. */
            }
        }
        yield;
    }
}

// ---------------------------------------------------------------------------
// The small registries
// ---------------------------------------------------------------------------

function* registries() {
    for (const biome of BiomeTypes.getAll()) {
        emit('biomes', { id: biome.id, tags: list(biome.getTags()).sort() });
        yield;
    }
    for (const effect of EffectTypes.getAll()) {
        emit('effects', { id: effect.getName() });
        yield;
    }
    for (const enchantment of EnchantmentTypes.getAll()) {
        emit('enchantments', { id: enchantment.id, maxLevel: enchantment.maxLevel });
        yield;
    }
    for (const dimension of DimensionTypes.getAll()) {
        emit('dimensions', { id: dimension.typeId });
        yield;
    }
    for (const effect of list(Potions.getAllEffectTypes())) {
        emit('potions', { effect: effect.id, durationTicks: effect.durationTicks ?? null });
        yield;
    }
    for (const delivery of list(Potions.getAllDeliveryTypes())) {
        emit('potion-deliveries', { id: delivery.id });
        yield;
    }
}

function* worldFacts() {
    const rules = {};
    for (const [name, value] of Object.entries(world.gameRules)) {
        if (typeof value === 'function') continue;
        rules[name] = value;
    }
    emit('world', {
        seed: String(world.seed),
        difficulty: world.getDifficulty(),
        defaultSpawn: world.getDefaultSpawnLocation(),
        gameRules: rules,
        maxTickingChunks: world.tickingAreaManager?.maxChunkCount ?? null,
        packStructures: list(world.structureManager?.getPackStructureIds()).sort()
    });
    yield;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function* passes(dimension) {
    yield* blockTypes();
    yield* blockDomains();
    yield* blockStates();
    yield* items();
    yield* entities(dimension);
    yield* registries();
    yield* worldFacts();
    console.warn(`${PREFIX}end ${JSON.stringify({ rows, errors })}`);
}

world.afterEvents.worldLoad.subscribe(async () => {
    const dimension = world.getDimension('overworld');
    console.warn(
        `${PREFIX}begin ${JSON.stringify({
            blockTypes: BlockTypes.getAll().length,
            itemTypes: ItemTypes.getAll().length,
            entityTypes: EntityTypes.getAll().length,
            tick: system.currentTick
        })}`
    );

    // The entity pass spawns, and nothing can be spawned into a chunk nobody has loaded. The
    // promise resolves when every chunk of the area is loaded and ticking, which is the signal
    // the palette pack's fixed 200 tick wait was standing in for.
    try {
        await world.tickingAreaManager.createTickingArea('jsp-dump', {
            dimension,
            from: { x: ORIGIN.x - 16, y: 0, z: ORIGIN.z - 16 },
            to: { x: ORIGIN.x + 16, y: 0, z: ORIGIN.z + 16 }
        });
    } catch (error) {
        failed('ticking-area', 'jsp-dump', error);
    }

    system.runJob(passes(dimension));
});
