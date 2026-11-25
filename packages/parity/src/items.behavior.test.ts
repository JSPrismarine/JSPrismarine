import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VANILLA_BLOCK_FAMILIES, bindFamily, heldItem } from '@jsprismarine/block-behaviors';
import { behaviorFor } from '@jsprismarine/blocks';
import { BehaviorRegistry } from '@jsprismarine/content';
import {
    deferredItemFactory,
    registerVanillaItemBehaviors,
    correctForDrops,
    toolSpeedFor,
    createTestWorld,
    testBlock,
    testSource
} from '@jsprismarine/item-behaviors';
import type { TestWorld, WorldActions } from '@jsprismarine/item-behaviors';
import {
    DEFAULT_PROVIDER_CONTEXT,
    FAST_COOKING_CONTEXT,
    ItemStack,
    burnTimeOf,
    loadItemTypes,
    speedMultiplierOf
} from '@jsprismarine/items';
import type { ItemHooks, ItemRegistry } from '@jsprismarine/items';
import { itemTypesTable } from '@jsprismarine/items/tables';
import { javaBlockStateToBedrock, javaEntityTypeToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import { bedrockEntityIdentifierOf } from '@jsprismarine/prismarine/entity/identifierMapping';
import { holderSetIncludes } from '@jsprismarine/prismarine/item/holderSets';
import { blocksTable, itemsTable } from '@jsprismarine/mapping/tables';
import { blockFromContent } from '@jsprismarine/prismarine/block/Block';
import { anvilPreview } from '@jsprismarine/prismarine/enchantment/anvil';
import { enchantingRows } from '@jsprismarine/prismarine/enchantment/enchantingTable';
import { Item } from '@jsprismarine/prismarine/item/Item';
import { BlockRuntimeIds } from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import { expect, it } from 'vitest';

import type { BehaviorAspect, BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { javaItemBehaviors } from './javaItemClasses.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';

/** A Java item, the Bedrock identity the server holds it under, and its Java default components. */
interface ItemSubject {
    readonly javaId: string;
    readonly bedrock: string;
    readonly components: Readonly<Record<string, unknown>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

/** Every Java item with a component row, which is every item the server can hold a Java component on. */
const javaItems = (): readonly ItemSubject[] =>
    Object.entries(itemTypesTable.items).flatMap(([bedrock, row]) => [
        { javaId: row.java, bedrock, components: row.components }
    ]);

/**
 * Java components that only change how an item looks: its glint and the marks it draws on a map.
 * The parity claim excludes rendered presentation (category 1 of docs/data-driven/parity.md).
 */
const PRESENTATION_COMPONENTS: ReadonlySet<string> = new Set([
    'minecraft:enchantment_glint_override',
    'minecraft:map_decorations'
]);

let componentIndex:
    | {
          readonly shared: ReadonlySet<string>;
          readonly byJavaId: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
      }
    | undefined;

/** The components every Java item carries, and each item's components by its Java id. */
const itemComponentIndex = () => {
    if (componentIndex !== undefined) return componentIndex;
    const items = javaItems();
    componentIndex = {
        shared: new Set(
            Object.keys(items[0]?.components ?? {}).filter((component) =>
                items.every((item) => component in item.components)
            )
        ),
        byJavaId: new Map(items.map((item) => [item.javaId, item.components]))
    };
    return componentIndex;
};

/**
 * The behaviors one Java item has that full parity has to compare with Java: each Java component
 * it carries by default, and placing its block when it names one.
 *
 * Each hook of `Item` its Java class overrides is a behavior too, such as a bucket's `use` or a
 * bow's `releaseUsing` (see `javaItemClasses.ts`).
 *
 * Components every item carries (its stack size, name, model, animations, attribute modifiers and
 * repair cost) are left out: they hold the generic item behavior, which is not this item's own,
 * and counting them would add every item's row for one shared rule.
 */
const itemAspects = (javaId: string): readonly BehaviorAspect[] => {
    const { shared, byJavaId } = itemComponentIndex();
    const aspects = Object.keys(byJavaId.get(javaId) ?? {})
        .filter((component) => !shared.has(component) && !PRESENTATION_COMPONENTS.has(component))
        .sort()
        .map((component) => ({ id: component, description: `what ${component} does, against Java` }));
    if (javaId in blocksTable.blocks && javaId !== 'minecraft:air') {
        aspects.push({ id: 'places-block', description: 'placing the block it names, against Java' });
    }
    for (const { kind, evidence } of javaItemBehaviors(javaId)) {
        aspects.push({ id: kind.aspect, description: `${kind.description} (${evidence.join(', ')}), against Java` });
    }
    return aspects;
};

const withComponent = (component: string): readonly ItemSubject[] =>
    javaItems().filter((item) => component in item.components);

/** The world every bound behavior closes over, forwarding to whichever double the running scenario installed. */
let current: TestWorld = createTestWorld();

const world: WorldActions = {
    blockAt: (position) => current.blockAt(position),
    hardnessOf: (block) => current.hardnessOf(block),
    stateOf: (source) => current.stateOf(source),
    environment: () => current.environment(),
    targetOf: (source) => current.targetOf(source),
    includes: (set, member) => holderSetIncludes(serverContent().tags, set, member),
    transform: (transformer, block, face) => current.transform(transformer, block, face),
    effectsOf: (potion) => current.effectsOf(potion),
    random: () => current.random(),
    locate: (destination, origin) => current.locate?.(destination, origin),
    supports: (action) => current.supports?.(action) ?? true,
    placeEndCrystal: (base) => current.placeEndCrystal?.(base) ?? false,
    perform: (action) => current.perform(action)
};

let built: ItemRegistry | undefined;

const registry = (): ItemRegistry => {
    if (built !== undefined) return built;
    const behaviors = new BehaviorRegistry<ItemHooks>();
    const items = deferredItemFactory();
    registerVanillaItemBehaviors(behaviors, { world, items });
    built = loadItemTypes({ behaviors }).registry;
    items.bind(built);
    return built;
};

const stackOf = (identifier: string): ItemStack => new ItemStack(registry().holder(identifier), 1);

const player = testSource();

/** The blocks, by Java identifier, that a Java block tag or id list names and the server can hold. */
const blocksNamedBy = (blocks: unknown): readonly { readonly javaId: string; readonly bedrock: string }[] => {
    const content = serverContent();
    const javaIds =
        typeof blocks === 'string' && blocks.startsWith('#')
            ? content.tags.members('block', blocks.slice(1))
            : typeof blocks === 'string'
              ? [blocks]
              : Array.isArray(blocks)
                ? blocks.filter((entry): entry is string => typeof entry === 'string')
                : [];
    return javaIds.flatMap((javaId) => {
        const mapping = javaBlockStateToBedrock(javaId);
        return mapping.kind === 'mapped' ? [{ javaId, bedrock: mapping.bedrock.name }] : [];
    });
};

const javaTagIncludes = (blocks: unknown, javaId: string): boolean => {
    const content = serverContent();
    if (typeof blocks === 'string') {
        return blocks.startsWith('#') ? content.tags.includes('block', blocks.slice(1), javaId) : blocks === javaId;
    }
    return Array.isArray(blocks) && blocks.includes(javaId);
};

/**
 * The chance a Java `context_int_provider` gives a composter layer, read from the vanilla datapack:
 * a number, or a dispatcher whose default is a weighted list of one layer or none.
 */
const javaCompostChance = (reference: string): number => {
    const file = join(
        unpackVanillaDatapack(),
        'data',
        'minecraft',
        'context_int_provider',
        `${reference.replace('minecraft:', '')}.json`
    );
    // Parsed JSON boundary: a vanilla provider file.
    const provider: unknown = JSON.parse(readFileSync(file, 'utf-8'));
    if (typeof provider === 'number') return provider;
    const distribution = field(field(provider, 'default'), 'distribution');
    if (!Array.isArray(distribution)) return Number.NaN;
    let total = 0;
    let layers = 0;
    for (const option of distribution) {
        const weight = Number(field(option, 'weight'));
        total += weight;
        layers += weight * Number(field(option, 'data'));
    }
    return layers / total;
};

/** Whether the server's composter adds a layer for an item on one random roll, over a composter with a layer. */
const compostsOn = (subject: ItemSubject, roll: number): boolean => {
    const family = VANILLA_BLOCK_FAMILIES.find((candidate) => candidate.name === behaviorFor('minecraft:composter'));
    if (family === undefined) throw new Error('the server registers no composter family');
    const harness = bindFamily(family, 'minecraft:composter');
    const at = { x: 0, y: 5, z: 0 };
    harness.dimension.set(at, 'minecraft:composter', { composter_fill_level: 1 });
    harness.dimension.queueRandom(roll);
    harness.interact(at, { itemStack: heldItem(subject.bedrock, subject.components) });
    return harness.dimension.stateAt(at, 'composter_fill_level') === 2;
};

/**
 * Evaluates a Java cooking provider from the vanilla datapack, as Java's `ContextIntProvider` and
 * `ContextFloatProvider` do: a number, a reference to another provider file, `minecraft:div`
 * (an integer `Quotient` for an int provider) and `minecraft:conditional` on
 * `minecraft:block/fast_cooking`.
 */
const javaCookingNumber = (node: unknown, fast: boolean, kind: 'int' | 'float'): number => {
    if (typeof node === 'number') return node;
    if (typeof node === 'string') {
        const file = join(
            unpackVanillaDatapack(),
            'data',
            'minecraft',
            `context_${kind}_provider`,
            `${node.replace('minecraft:', '')}.json`
        );
        // Parsed JSON boundary: a vanilla provider file.
        return javaCookingNumber(JSON.parse(readFileSync(file, 'utf-8')), fast, kind);
    }
    const type = field(node, 'type');
    if (type === 'minecraft:div') {
        const quotient =
            javaCookingNumber(field(node, 'left'), fast, kind) / javaCookingNumber(field(node, 'right'), fast, kind);
        return kind === 'int' ? Math.trunc(quotient) : quotient;
    }
    if (type === 'minecraft:conditional') {
        const branch = field(node, 'condition') === 'minecraft:block/fast_cooking' && fast ? 'on_true' : 'on_false';
        return javaCookingNumber(field(node, branch), fast, kind);
    }
    return Number.NaN;
};

/** The Java items a holder set names: a tag through the server's tags, or the ids it lists. */
const javaItemsIn = (set: unknown): readonly string[] => {
    if (Array.isArray(set)) return set.flatMap((entry) => javaItemsIn(entry));
    if (typeof set !== 'string') return [];
    return set.startsWith('#') ? serverContent().tags.members('item', set.slice(1)) : [set];
};

const scenarios: readonly BehaviorScenario<ItemSubject>[] = [
    {
        name: 'enchanting-table-offers',
        aspects: () => ['minecraft:enchantable'],
        java: 'An enchanting table with fifteen bookshelves offers an enchantable item three priced rows, each drawing at least one enchantment.',
        reference: 'Java EnchantmentMenu.slotsChanged and EnchantmentHelper.selectEnchantment',
        subjects: () => withComponent('minecraft:enchantable'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const rows = enchantingRows(content.enchantments, new Item({ name: subject.bedrock, content }), 12_345, 15);
            const empty = rows.findIndex((row) => row.cost <= 0 || row.picks.length === 0);
            return empty === -1
                ? undefined
                : `row ${empty + 1} offers ${rows[empty]?.cost ?? 0} levels and ${rows[empty]?.picks.length ?? 0} enchantments`;
        }
    },
    {
        name: 'anvil-repairs',
        aspects: () => ['minecraft:repairable'],
        java: 'An anvil repairs a damaged item by a quarter of its durability for each of the materials its repairable component names.',
        reference: 'Java AnvilMenu.createResult and DataComponents.REPAIRABLE',
        subjects: () => withComponent('minecraft:repairable'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const material = javaItemsIn(field(subject.components['minecraft:repairable'], 'items'))[0];
            if (material === undefined) return 'its repairable component names no material';
            const mapped = javaItemToBedrock(material);
            if (mapped.kind === 'unknown') return `its repair material ${material} has no Bedrock item`;
            const base = new Item({ name: subject.bedrock, content });
            const max = base.getMaxDurability();
            if (max <= 0) return 'the server gives it no durability to repair';
            base.durability = Math.ceil(max / 2);
            const addition = new Item({ name: mapped.bedrock.identifier, content });
            const repaired = anvilPreview(content.enchantments, { base, addition }).stack;
            if (repaired === undefined) return `the anvil refuses ${material} as its repair material`;
            // Java's repair: min(damage, max / 4) per material, so one material mends a quarter.
            const damage = max - base.durability;
            const java = base.durability + Math.min(damage, Math.floor(max / 4));
            return repaired.durability === java
                ? undefined
                : `one ${material} leaves it at ${repaired.durability} durability, Java ${java}`;
        }
    },
    {
        name: 'stacks-like-java',
        aspects: () => ['stacking'],
        java: 'An item with no behavior of its own, such as a diamond or a stick, stacks to its Java max_stack_size.',
        reference: 'Java DataComponents.MAX_STACK_SIZE and ItemStack.getMaxStackSize',
        // Only the items nothing else measures: an item with components or hooks of its own has
        // rows for them, and its stack size is the items.components family's data comparison.
        subjects: () => javaItems().filter((item) => itemAspects(item.javaId).length === 0),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const content = serverContent();
            const runtimeId = content.items.registry.idOf(subject.bedrock);
            if (runtimeId === undefined) return `the server has no item ${subject.bedrock}`;
            const server = content.items.facts.maxStackSize[runtimeId];
            const java = subject.components['minecraft:max_stack_size'];
            return server === java ? undefined : `it stacks to ${String(server)}, Java ${String(java)}`;
        }
    },
    {
        name: 'fuel-burns',
        aspects: () => ['minecraft:cooking_fuel'],
        java: "A fuel burns its provider's ticks in a furnace and in a smoker or blast furnace, and speeds the cooking by its multiplier.",
        reference:
            'Java AbstractFurnaceBlockEntity.getBurnDuration and getSpeedMultiplier; data/minecraft/context_int_provider/cooking',
        subjects: () => withComponent('minecraft:cooking_fuel'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            // The item types the furnace tick reads its fuel from.
            const type = serverContent().items.types.get(subject.bedrock);
            if (type === undefined) return `the server has no item ${subject.bedrock}`;
            const fuel = subject.components['minecraft:cooking_fuel'];
            const differences: string[] = [];
            for (const [fast, context, where] of [
                [false, DEFAULT_PROVIDER_CONTEXT, 'a furnace'],
                [true, FAST_COOKING_CONTEXT, 'a smoker']
            ] as const) {
                const burns = javaCookingNumber(field(fuel, 'burn_time'), fast, 'int');
                const speed = javaCookingNumber(field(fuel, 'speed_multiplier') ?? 1, fast, 'float');
                const serverBurns = burnTimeOf(type, context);
                const serverSpeed = speedMultiplierOf(type, context);
                if (serverBurns !== burns) differences.push(`it burns ${serverBurns} ticks in ${where}, Java ${burns}`);
                if (serverSpeed !== speed)
                    differences.push(`it cooks ${serverSpeed} times as fast in ${where}, Java ${speed}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'composts-at-chance',
        aspects: () => ['minecraft:compostable'],
        java: 'Putting an item in a composter that has a layer adds another with the chance its compostable provider gives.',
        reference: 'Java ComposterBlock.addItem and data/minecraft/context_int_provider/compostable',
        subjects: () => withComponent('minecraft:compostable'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const layers = field(subject.components['minecraft:compostable'], 'layers');
            if (typeof layers !== 'string') return 'its compostable component names no provider';
            const chance = javaCompostChance(layers);
            if (!compostsOn(subject, Math.max(0, chance - 0.01))) {
                return `a roll under Java's ${chance} chance added no layer`;
            }
            if (chance < 1 && compostsOn(subject, chance + 0.01)) {
                return `a roll over Java's ${chance} chance still added a layer`;
            }
            return undefined;
        }
    },
    {
        name: 'food-feeds',
        aspects: () => ['minecraft:food'],
        java: 'Eating a food restores the nutrition and saturation its `minecraft:food` component declares.',
        reference: 'Java Consumable.onConsume and FoodProperties',
        subjects: () => withComponent('minecraft:food'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld({ state: { foodLevel: 10 } });
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatchFirst('onConsume', { itemStack: stack, source: player });
            const fed = current.performed('feed')[0];
            const food = subject.components['minecraft:food'];
            if (fed === undefined) return 'eating it restored no hunger';
            if (fed.nutrition !== field(food, 'nutrition') || fed.saturation !== field(food, 'saturation')) {
                return `eating it restored ${fed.nutrition} and ${fed.saturation}, Java declares ${String(field(food, 'nutrition'))} and ${String(field(food, 'saturation'))}`;
            }
            return undefined;
        }
    },
    {
        name: 'food-refused-when-full',
        aspects: () => ['minecraft:food'],
        java: 'A full hunger bar refuses food unless the item can always be eaten.',
        reference: 'Java Consumable.canConsume and FoodProperties.canAlwaysEat',
        subjects: () => withComponent('minecraft:food'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld({ state: { foodLevel: 20 } });
            const stack = stackOf(subject.bedrock);
            const started = stack.type.hooks.dispatchFirst('onUse', {
                itemStack: stack,
                source: player,
                useDuration: 0
            });
            const always = field(subject.components['minecraft:food'], 'can_always_eat') === true;
            if (always && started === undefined)
                return 'it was refused on a full bar, but Java lets it be eaten anyway';
            if (!always && started !== undefined) return 'it was eaten on a full bar, which Java refuses';
            return undefined;
        }
    },
    {
        name: 'tool-mining-speed',
        aspects: () => ['minecraft:tool'],
        java: 'A tool mines each block at the speed of the first rule whose block set contains it, else its default.',
        reference: 'Java Tool.getMiningSpeed',
        subjects: () => withComponent('minecraft:tool'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const tool = subject.components['minecraft:tool'];
            const rules = field(tool, 'rules');
            if (!Array.isArray(rules)) return 'its Java tool component has no rule list';
            current = createTestWorld();
            const stack = stackOf(subject.bedrock);
            const wrong: string[] = [];
            for (const rule of rules) {
                if (typeof field(rule, 'speed') !== 'number') continue;
                for (const block of blocksNamedBy(field(rule, 'blocks'))) {
                    const first = rules.find(
                        (candidate) =>
                            typeof field(candidate, 'speed') === 'number' &&
                            javaTagIncludes(field(candidate, 'blocks'), block.javaId)
                    );
                    const expected = field(first, 'speed');
                    const actual = toolSpeedFor(stack, testBlock(block.bedrock), world);
                    if (actual !== expected && !wrong.some((entry) => entry.startsWith(block.javaId))) {
                        wrong.push(`${block.javaId} mines at ${actual}, Java gives ${String(expected)}`);
                    }
                }
            }
            if (wrong.length > 0)
                return `${wrong.length} blocks mine at the wrong speed, such as ${wrong.slice(0, 3).join('; ')}`;
            return undefined;
        }
    },
    {
        name: 'tool-correct-for-drops',
        aspects: () => ['minecraft:tool'],
        java: 'A block drops its loot only when the first rule that states a verdict for it calls the tool correct.',
        reference: 'Java Tool.isCorrectForDrops',
        subjects: () => withComponent('minecraft:tool'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const rules = field(subject.components['minecraft:tool'], 'rules');
            if (!Array.isArray(rules)) return 'its Java tool component has no rule list';
            current = createTestWorld();
            const stack = stackOf(subject.bedrock);
            const wrong: string[] = [];
            for (const rule of rules) {
                if (typeof field(rule, 'correct_for_drops') !== 'boolean') continue;
                for (const block of blocksNamedBy(field(rule, 'blocks'))) {
                    const first = rules.find(
                        (candidate) =>
                            typeof field(candidate, 'correct_for_drops') === 'boolean' &&
                            javaTagIncludes(field(candidate, 'blocks'), block.javaId)
                    );
                    const expected = field(first, 'correct_for_drops') === true;
                    if (correctForDrops(stack, testBlock(block.bedrock), world) !== expected) wrong.push(block.javaId);
                }
            }
            if (wrong.length > 0)
                return `${wrong.length} blocks drop wrongly, such as ${[...new Set(wrong)].slice(0, 3).join(', ')}`;
            return undefined;
        }
    },
    {
        name: 'spawn-egg-spawns-mob',
        aspects: () => ['minecraft:entity_data', 'use-on-block'],
        java: 'A spawn egg spawns the mob its `minecraft:entity_data` names.',
        reference: 'Java SpawnEggItem and the data/minecraft/items entity_data component',
        subjects: () => withComponent('minecraft:entity_data').filter((item) => item.javaId.endsWith('_spawn_egg')),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const javaMob = field(subject.components['minecraft:entity_data'], 'id');
            if (typeof javaMob !== 'string') return 'its Java entity data names no mob';
            current = createTestWorld();
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatchFirst('onUseOn', {
                itemStack: stack,
                source: player,
                useDuration: 0,
                block: testBlock('minecraft:stone'),
                blockFace: 'up',
                faceLocation: { x: 0.5, y: 1, z: 0.5 }
            });
            const spawned = current.performed('spawn-entity')[0];
            if (spawned === undefined) return 'using it spawned nothing';
            const content = serverContent();
            const resolved = bedrockEntityIdentifierOf(spawned.identifier, (id) => content.entities.registry.has(id));
            const mapping = javaEntityTypeToBedrock(javaMob);
            // A mob Bedrock has no entity for spawns its reviewed substitute, which the mapping records as an intentional loss.
            const expected =
                mapping.kind === 'loss'
                    ? mapping.loss.bedrockFallback
                    : mapping.kind === 'mapped'
                      ? mapping.bedrock
                      : undefined;
            if (resolved === undefined) return `${spawned.identifier} resolves to no server entity`;
            if (resolved !== expected) return `it spawns ${resolved}, Java's ${javaMob} maps to ${String(expected)}`;
            if (!content.entities.registry.has(resolved)) return `${resolved} is not an entity the server runs`;
            return undefined;
        }
    },
    {
        name: 'weapon-hit',
        aspects: () => ['minecraft:weapon'],
        java: 'A hit that lands costs a weapon its item_damage_per_attack in durability, and disables a raised shield for its disable_blocking_for_seconds; both default to 1 and 0.',
        reference: 'Java Weapon.hurtEnemy and Weapon.disableBlockingForSeconds',
        subjects: () => withComponent('minecraft:weapon'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld();
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatch('onHitEntity', {
                itemStack: stack,
                source: player,
                hitEntity: player,
                hadEffect: true
            });
            const rules = subject.components['minecraft:weapon'];
            const perAttack = field(rules, 'item_damage_per_attack') ?? 1;
            const disableSeconds = field(rules, 'disable_blocking_for_seconds') ?? 0;
            const spent = current.performed('consume-durability')[0]?.amount ?? 0;
            if (spent !== perAttack) return `a hit costs ${spent} durability, Java ${String(perAttack)}`;
            const disabled = current.performed('disable-shield')[0]?.ticks ?? 0;
            const javaTicks = Math.round(Number(disableSeconds) * 20);
            return disabled === javaTicks
                ? undefined
                : `a hit disables a shield for ${disabled} ticks, Java ${javaTicks}`;
        }
    },
    {
        name: 'fresh-durability',
        aspects: () => ['minecraft:max_damage', 'minecraft:damage'],
        java: 'A fresh stack of a damageable item holds its max_damage and starts with its damage worn off, which is none.',
        reference: 'Java DataComponents.MAX_DAMAGE and DAMAGE, and ItemStack.getMaxDamage',
        subjects: () => withComponent('minecraft:max_damage'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const stack = new Item({ name: subject.bedrock, content: serverContent() });
            const max = subject.components['minecraft:max_damage'];
            const damage = Number(subject.components['minecraft:damage'] ?? 0);
            if (stack.getMaxDurability() !== max) {
                return `it holds ${stack.getMaxDurability()} durability, Java ${String(max)}`;
            }
            return stack.durability === Number(max) - damage
                ? undefined
                : `a fresh stack starts at ${stack.durability} durability, Java ${Number(max) - damage}`;
        }
    },
    {
        name: 'mining-damages-tool',
        aspects: () => ['minecraft:max_damage'],
        java: 'Breaking a block with hardness above zero costs a tool the durability its `damage_per_block` names.',
        reference: 'Java Tool.damagePerBlock and ItemStack.mineBlock',
        subjects: () => withComponent('minecraft:tool').filter((item) => 'minecraft:max_damage' in item.components),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld({ hardness: { 'minecraft:stone': 1.5 } });
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatch('onMineBlock', {
                itemStack: stack,
                source: player,
                block: testBlock('minecraft:stone')
            });
            const spent = current.performed('consume-durability')[0];
            const expected = field(subject.components['minecraft:tool'], 'damage_per_block') ?? 1;
            if (spent === undefined) return 'mining a block cost no durability';
            if (spent.amount !== expected)
                return `mining a block cost ${spent.amount}, Java's tool component says ${String(expected)}`;
            return undefined;
        }
    },
    {
        name: 'consume-applies-effects',
        aspects: () => ['minecraft:consumable'],
        java: 'Finishing a consumable applies the status effects its `apply_effects` consume effects name, with their duration and amplifier.',
        reference: 'Java ApplyStatusEffectsConsumeEffect',
        subjects: () =>
            withComponent('minecraft:consumable').filter((item) =>
                JSON.stringify(field(item.components['minecraft:consumable'], 'on_consume_effects') ?? []).includes(
                    'apply_effects'
                )
            ),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld({ randoms: [0] });
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatchFirst('onConsume', { itemStack: stack, source: player });
            const applied = current.performed('apply-effects').flatMap((action) => action.effects);
            const wanted = (
                field(subject.components['minecraft:consumable'], 'on_consume_effects') as unknown[]
            ).flatMap((entry) =>
                field(entry, 'type') === 'minecraft:apply_effects' && Array.isArray(field(entry, 'effects'))
                    ? (field(entry, 'effects') as unknown[])
                    : []
            );
            for (const effect of wanted) {
                const id = field(effect, 'id');
                const match = applied.find((candidate) => candidate.id === id);
                if (match === undefined) return `${String(id)} was never applied`;
                if (match.durationTicks !== (field(effect, 'duration') ?? 600))
                    return `${String(id)} lasts ${match.durationTicks}, Java says ${String(field(effect, 'duration') ?? 600)}`;
                if ((match.amplifier ?? 0) !== (field(effect, 'amplifier') ?? 0))
                    return `${String(id)} has amplifier ${match.amplifier}, Java says ${String(field(effect, 'amplifier') ?? 0)}`;
            }
            return undefined;
        }
    },
    {
        name: 'use-cooldown',
        aspects: () => ['minecraft:use_cooldown'],
        java: 'Using an item with `minecraft:use_cooldown` starts a cooldown of that many seconds.',
        reference: 'Java UseCooldown.apply',
        subjects: () => withComponent('minecraft:use_cooldown'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld({ target: testSource('minecraft:zombie', 2) });
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatchFirst('onUse', { itemStack: stack, source: player, useDuration: 0 });
            stack.type.hooks.dispatchFirst('onUseOn', {
                itemStack: stack,
                source: player,
                useDuration: 0,
                block: testBlock('minecraft:stone'),
                blockFace: 'up',
                faceLocation: { x: 0.5, y: 1, z: 0.5 }
            });
            stack.type.hooks.dispatchFirst('onConsume', { itemStack: stack, source: player });
            const started = current.performed('start-cooldown')[0];
            const seconds = field(subject.components['minecraft:use_cooldown'], 'seconds');
            if (started === undefined) return 'using it started no cooldown';
            return started.ticks === Math.round(Number(seconds) * 20)
                ? undefined
                : `the cooldown is ${started.ticks} ticks, Java says ${String(seconds)} seconds`;
        }
    },
    {
        name: 'block-item-places',
        aspects: () => ['places-block'],
        java: 'An item named for a block places that block when used on another block.',
        reference: 'Java BlockItem.place',
        subjects: () =>
            javaItems().filter((item) => item.javaId in blocksTable.blocks && item.javaId !== 'minecraft:air'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            const mapping = javaBlockStateToBedrock(subject.javaId);
            if (mapping.kind !== 'mapped') return 'the block it names has no Bedrock block';
            const name = mapping.bedrock.name;
            if (BlockRuntimeIds.tryGetByName(name) === null) return `${name} has no runtime id`;
            return blockFromContent(name, serverContent())?.canBePlaced() === true
                ? undefined
                : `the server refuses to place ${name}`;
        }
    },
    {
        name: 'empty-map-makes-map',
        aspects: () => ['use'],
        java: 'Using an empty map spends one and makes a map of the area the player stands in.',
        reference: 'Java 26.3 EmptyMapItem.use and MapItem.create',
        subjects: () => javaItems().filter((item) => item.javaId === 'minecraft:map'),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld();
            const stack = new ItemStack(registry().holder(subject.bedrock), 2);
            const used = stack.type.hooks.dispatchFirst('onUse', { itemStack: stack, source: player, useDuration: 0 });
            const made = current.performed('map')[0];
            if (made === undefined) return 'using it made no map';
            if (made.operation !== 'create') return `using it asks for a map ${made.operation}, Java makes a new map`;
            if (used?.stack?.count !== 1) return `using it leaves ${String(used?.stack?.count)} of 2, Java spends one`;
            return undefined;
        }
    },
    {
        name: 'equips-on-use',
        aspects: () => ['minecraft:equippable'],
        java: 'Using a swappable wearable puts it in the slot its `minecraft:equippable` component names.',
        reference: 'Java Equippable.swapWithEquipmentSlot',
        subjects: () =>
            withComponent('minecraft:equippable').filter(
                (item) => field(item.components['minecraft:equippable'], 'swappable') !== false
            ),
        idOf: (subject) => subject.javaId,
        run: (subject) => {
            current = createTestWorld();
            const stack = stackOf(subject.bedrock);
            stack.type.hooks.dispatchFirst('onUse', { itemStack: stack, source: player, useDuration: 0 });
            const equipped = current.performed('equip')[0];
            const slot = field(subject.components['minecraft:equippable'], 'slot');
            if (equipped === undefined) return 'using it equipped nothing';
            if (equipped.slot !== slot) return `using it equips the ${equipped.slot} slot, Java names ${String(slot)}`;
            if (equipped.fromHand !== true) return 'using it leaves the item in the hand as well as the slot';
            return undefined;
        }
    }
];

describeFamily(
    FAMILIES.itemsBehavior,
    [
        REFERENCES.javaItemRegistry,
        REFERENCES.bedrockBehaviorPack,
        REFERENCES.javaWorldgenData,
        REFERENCES.javaServerJar
    ],
    () => {
        it('exercises each Java item behavior through the real item hooks', { timeout: 180_000 }, () => {
            const rows = measureScenarios(FAMILIES.itemsBehavior, import.meta.filename, scenarioGroup(scenarios));

            reportCoverage(
                FAMILIES.itemsBehavior,
                import.meta.filename,
                Object.keys(itemsTable.items).sort((left, right) => left.localeCompare(right, 'en')),
                rows,
                "No scenario compares this item's Java use, durability, combat or inventory behavior with the server.",
                itemAspects
            );
            expect(rows.length).toBeGreaterThan(0);
            expect(Object.keys(itemsTable.items)).toContain('minecraft:diamond_pickaxe');
            expect(javaItemToBedrock('minecraft:diamond_pickaxe').kind).toBe('mapped');
        });
    }
);
