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
import { ItemStack, loadItemTypes } from '@jsprismarine/items';
import type { ItemHooks, ItemRegistry } from '@jsprismarine/items';
import { itemTypesTable } from '@jsprismarine/items/tables';
import { javaBlockStateToBedrock, javaEntityTypeToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import { bedrockEntityIdentifierOf } from '@jsprismarine/prismarine/entity/identifierMapping';
import { holderSetIncludes } from '@jsprismarine/prismarine/item/holderSets';
import { itemsTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
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

const scenarios: readonly BehaviorScenario<ItemSubject>[] = [
    {
        name: 'food-feeds',
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
        name: 'mining-damages-tool',
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
        name: 'equips-on-use',
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
            return undefined;
        }
    }
];

describeFamily(
    FAMILIES.itemsBehavior,
    [REFERENCES.javaItemRegistry, REFERENCES.bedrockBehaviorPack, REFERENCES.javaWorldgenData],
    () => {
        it('exercises each Java item behavior through the real item hooks', { timeout: 180_000 }, () => {
            const rows = measureScenarios(FAMILIES.itemsBehavior, import.meta.filename, scenarioGroup(scenarios));

            reportCoverage(
                FAMILIES.itemsBehavior,
                import.meta.filename,
                Object.keys(itemsTable.items).sort((left, right) => left.localeCompare(right, 'en')),
                rows,
                "No scenario compares this item's Java use, durability, combat or inventory behavior with the server."
            );
            expect(rows.length).toBeGreaterThan(0);
            expect(Object.keys(itemsTable.items)).toContain('minecraft:diamond_pickaxe');
            expect(javaItemToBedrock('minecraft:diamond_pickaxe').kind).toBe('mapped');
        });
    }
);
