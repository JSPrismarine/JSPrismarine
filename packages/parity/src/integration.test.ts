import { block_definitions } from '@jsprismarine/bedrock-data';
import {
    bambooFamily,
    soilFamily,
    bindFamily,
    climbingFamily,
    floraFamily,
    OVERWORLD,
    VoxelDimension,
    VoxelWorld
} from '@jsprismarine/block-behaviors';
import type { HookBlock } from '@jsprismarine/blocks';
import { DATA_COMPONENTS, TRIGGER_COMPONENTS } from '@jsprismarine/entities';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains';
import {
    bedrockBiomeToJava,
    bedrockBlockToJava,
    bedrockBlockPropertiesOf,
    bedrockBlockStateToJava,
    javaBlockStateToBedrock,
    javaEntityTypeToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';
import { ENTITY_LOSSES } from '@jsprismarine/mapping/lossList';
import { entitiesTable } from '@jsprismarine/mapping/tables';
import { Item as PrismarineItem } from '@jsprismarine/prismarine/item/Item';
import { resolveTransform } from '@jsprismarine/prismarine/item/blockTransformers';
import { buildServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import type { ServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import { singleDimension } from '@jsprismarine/prismarine/content/world/adapter';
import { entityContentGroups } from '@jsprismarine/prismarine/entity/contentAdapter';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';
import { buildNetworkContentPayloads } from '@jsprismarine/prismarine/network/index';
import { worldContentGroups } from '@jsprismarine/prismarine/world/contentAdapter';
import { Dimensions } from '@jsprismarine/prismarine/world/Dimension';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import { World } from '@jsprismarine/prismarine/world/World';
import { SPAWN_CONSTANTS, Spawner } from '@jsprismarine/spawning';
import type { SpawnPosition, SpawnWorld } from '@jsprismarine/spawning';
import { BlockRuntimeIds } from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import { takesRandomTicks } from '@jsprismarine/prismarine/world/randomTickSections';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { describeFamily } from './measure.ts';
import { loadBlockPaletteCapture, loadRequiredItemList } from './goldens.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';
import type { TrackerRuntimeSupport } from './trackerCases.ts';
import {
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenData';

import type { ServerWorldAdapter } from '@jsprismarine/prismarine/content/world/adapter';

interface RealStack {
    readonly content: ServerContent;
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    readonly reports: EntityRuntimeReport[];
    readonly reportContext: EntityReportContext;
}

interface EntityRuntimeReport {
    readonly identifier: string | undefined;
    readonly message: string;
}

interface EntityReportContext {
    identifier: string | undefined;
}

interface EntityCoverageCounts {
    declared: number;
    hookBacked: number;
    dataOnly: number;
    registeredNoHook: number;
    triggers: number;
    goals: number;
    unimplemented: number;
    spawnActive: number;
    spawnActiveGoals: number;
}

let builtStack: RealStack | undefined;

/** Builds the fetched Bedrock and Java content with a live data-driven entity runtime attached. */
const realStack = (): RealStack => {
    if (builtStack !== undefined) return builtStack;

    const world = new TestEntityWorld();
    let content: ServerContent | undefined;
    const reports: EntityRuntimeReport[] = [];
    const reportContext: EntityReportContext = { identifier: undefined };
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content build finished');
            return content;
        },
        world: world.world,
        host: world.host,
        report: (message) => reports.push({ identifier: reportContext.identifier, message })
    });
    const adapter: ServerWorldAdapter = {
        ...world.world,
        ticks: world.ticks,
        ...entityContentGroups(runtime)
    };

    content = buildServerContent({ world: singleDimension(adapter) });
    builtStack = { content, runtime, world, reports, reportContext };

    return builtStack;
};

class JavaTagDimension extends VoxelDimension {
    public constructor(private readonly content: ServerContent) {
        super(OVERWORLD);
    }

    public override hasBlockTag = (block: HookBlock, tag: string): boolean =>
        this.content.tags.includes('block', tag, block.identifier);
}

class JavaTagWorld extends VoxelWorld {
    private readonly dimension: JavaTagDimension;

    public constructor(content: ServerContent) {
        super();
        this.dimension = new JavaTagDimension(content);
    }

    public override at(dimension = OVERWORLD): JavaTagDimension {
        if (dimension !== OVERWORLD) throw new Error(`Unexpected test dimension: ${dimension}`);
        return this.dimension;
    }
}

/** Whether a parsed JSON boundary is a non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The literal tag values declared by one source tag file. */
const tagValuesOf = (data: unknown): readonly { id: string; required: boolean }[] => {
    if (!isRecord(data) || !Array.isArray(data.values)) return [];

    return data.values.flatMap((value) => {
        if (typeof value === 'string') return [{ id: value, required: true }];
        if (isRecord(value) && typeof value.id === 'string') {
            return [{ id: value.id, required: value.required !== false }];
        }
        return [];
    });
};

/** Adds the default Java namespace to a tag or member that omits one. */
const namespaced = (identifier: string): string => (identifier.includes(':') ? identifier : `minecraft:${identifier}`);

/** Checks that every loaded Java tag definition is readable through the merged tag API. */
const loadedTagGaps = (content: ServerContent): string[] => {
    const gaps: string[] = [];

    for (const definition of content.definitions.tags.values()) {
        const identifier = definition.identifier;
        const colon = identifier.indexOf(':');
        const slash = identifier.lastIndexOf('/', colon);
        if (colon < 0 || slash < 1) {
            gaps.push(`malformed-tag-identifier:${identifier}`);
            continue;
        }

        const registry = identifier.slice(0, slash);
        const tag = identifier.slice(slash + 1);
        if (!content.tags.has(registry, tag)) {
            gaps.push(`unavailable-tag:${registry}/${tag}`);
            continue;
        }

        for (const value of tagValuesOf(definition.data)) {
            const isReference = value.id.startsWith('#');
            const member = namespaced(value.id.slice(isReference ? 1 : 0));
            const available = isReference
                ? content.tags.has(registry, member)
                : content.tags.includes(registry, tag, member);
            if (value.required && !available) gaps.push(`unresolved:${registry}/${tag}:${value.id}`);
        }
    }

    return gaps;
};

/** Checks each mapped Java tag membership on the runtime type that consumes it. */
const runtimeTagGaps = (content: ServerContent): string[] => {
    const gaps: string[] = [];

    for (const tag of content.tags.tags('block')) {
        for (const javaId of content.tags.members('block', tag)) {
            const mapping = javaBlockStateToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;

            // Some reviewed Bedrock merges collapse a Java block into another block's state.
            // The tag can only follow the mapping when the resulting Bedrock state maps back
            // to the same Java block.
            const inverse = bedrockBlockStateToJava(mapping.bedrock.name, mapping.bedrock.states);
            if (inverse.kind !== 'mapped' || inverse.java.name !== javaId) continue;

            const block = content.blocks.types.get(mapping.bedrock.name);
            if (block === undefined) gaps.push(`block:${javaId}:missing:${mapping.bedrock.name}`);
            else if (!block.hasJavaTag(tag)) gaps.push(`block:${javaId}:tag:${tag}`);
        }
    }

    for (const tag of content.tags.tags('item')) {
        for (const javaId of content.tags.members('item', tag)) {
            const mapping = javaItemToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;

            const item = content.items.types.get(mapping.bedrock.identifier);
            if (item === undefined) gaps.push(`item:${javaId}:missing:${mapping.bedrock.identifier}`);
            else if (!item.hasJavaTag(tag)) gaps.push(`item:${javaId}:tag:${tag}`);
        }
    }

    for (const tag of content.tags.tags('entity_type')) {
        for (const javaId of content.tags.members('entity_type', tag)) {
            const mapping = javaEntityTypeToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;

            const entity = content.entities.registry.get(mapping.bedrock);
            if (entity === undefined) gaps.push(`entity:${javaId}:missing:${mapping.bedrock}`);
            else if (!entity.hasTag(tag)) gaps.push(`entity:${javaId}:tag:${tag}`);
        }
    }

    for (const tag of content.items.tags.names()) {
        for (const identifier of content.items.tags.members(tag)) {
            const item = content.items.types.get(identifier);
            if (item === undefined) gaps.push(`bedrock-item-tag:${tag}:missing:${identifier}`);
            else if (!item.hasTag(tag)) gaps.push(`bedrock-item-tag:${tag}:${identifier}`);
        }
    }

    return gaps;
};

/** One Java tag membership and whether its mapped runtime type carries that membership. */
const runtimeTagCases = (
    content: ServerContent,
    unexpected: ReadonlySet<string>
): {
    id: string;
    title: string;
    context: string;
    status: 'passed' | 'failed';
    details?: string;
}[] => {
    const cases: {
        id: string;
        title: string;
        context: string;
        status: 'passed' | 'failed';
        details?: string;
    }[] = [];

    for (const tag of content.tags.tags('block')) {
        for (const javaId of content.tags.members('block', tag)) {
            const mapping = javaBlockStateToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;
            const inverse = bedrockBlockStateToJava(mapping.bedrock.name, mapping.bedrock.states);
            if (inverse.kind !== 'mapped' || inverse.java.name !== javaId) continue;
            const block = content.blocks.types.get(mapping.bedrock.name);
            const gap =
                block === undefined
                    ? `block:${javaId}:missing:${mapping.bedrock.name}`
                    : !block.hasJavaTag(tag)
                      ? `block:${javaId}:tag:${tag}`
                      : undefined;
            cases.push({
                id: `block/${javaId}#${tag}`,
                title: javaId,
                context: `Java block tag #${tag} → ${mapping.bedrock.name}`,
                status: gap === undefined || !unexpected.has(gap) ? 'passed' : 'failed',
                ...(gap === undefined ? {} : { details: gap })
            });
        }
    }

    for (const tag of content.tags.tags('item')) {
        for (const javaId of content.tags.members('item', tag)) {
            const mapping = javaItemToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;
            const item = content.items.types.get(mapping.bedrock.identifier);
            const gap =
                item === undefined
                    ? `item:${javaId}:missing:${mapping.bedrock.identifier}`
                    : !item.hasJavaTag(tag)
                      ? `item:${javaId}:tag:${tag}`
                      : undefined;
            cases.push({
                id: `item/${javaId}#${tag}`,
                title: javaId,
                context: `Java item tag #${tag} → ${mapping.bedrock.identifier}`,
                status: gap === undefined || !unexpected.has(gap) ? 'passed' : 'failed',
                ...(gap === undefined ? {} : { details: gap })
            });
        }
    }

    for (const tag of content.tags.tags('entity_type')) {
        for (const javaId of content.tags.members('entity_type', tag)) {
            const mapping = javaEntityTypeToBedrock(javaId);
            if (mapping.kind !== 'mapped') continue;
            const entity = content.entities.registry.get(mapping.bedrock);
            const gap =
                entity === undefined
                    ? `entity:${javaId}:missing:${mapping.bedrock}`
                    : !entity.hasTag(tag)
                      ? `entity:${javaId}:tag:${tag}`
                      : undefined;
            cases.push({
                id: `entity/${javaId}#${tag}`,
                title: javaId,
                context: `Java entity tag #${tag} → ${mapping.bedrock}`,
                status: gap === undefined || !unexpected.has(gap) ? 'passed' : 'failed',
                ...(gap === undefined ? {} : { details: gap })
            });
        }
    }

    return cases;
};

/** Counts the resolved tags and memberships the real stack exposes in each registry. */
const runtimeTagMeasurements = (content: ServerContent): Record<string, number> => {
    const measurements: Record<string, number> = {};
    const registries = ['block', 'item', 'entity_type', 'worldgen/biome'] as const;

    for (const registry of registries) {
        const tags = content.tags.tags(registry);
        const members = tags.reduce((total, tag) => total + content.tags.members(registry, tag).length, 0);
        const key = registry.replace('/', '_');
        measurements[`${key}_tags`] = tags.length;
        measurements[`${key}_memberships`] = members;
    }

    const bedrockItemTags = content.items.tags.names();
    measurements.bedrock_item_tags = bedrockItemTags.length;
    measurements.bedrock_item_tag_memberships = bedrockItemTags.reduce(
        (total, tag) => total + content.items.tags.members(tag).length,
        0
    );

    return measurements;
};

/** Reads the Bedrock tags a biome definition carries, preserving source order. */
const bedrockBiomeTagsOf = (data: unknown): readonly string[] => {
    if (!isRecord(data)) return [];
    const biome = data['minecraft:biome'];
    if (!isRecord(biome) || !isRecord(biome.components)) return [];
    const tags = biome.components['minecraft:tags'];
    if (!isRecord(tags) || !Array.isArray(tags.tags)) return [];

    return tags.tags.filter((tag): tag is string => typeof tag === 'string');
};

/** Checks that Java's biome tags point only at biomes in its loaded world generation registry. */
const javaBiomeTagGaps = (content: ServerContent): string[] => {
    const sources = findJavaWorldgenSources();
    if (sources === undefined) return ['missing-java-worldgen-sources'];

    const java = loadJavaWorldgenRegistries(sources);
    const contentTags = content.tags.tags('worldgen/biome');
    const sourceTags = [...java.biomeTags.keys()].sort();
    const gaps: string[] = [];

    if (JSON.stringify(contentTags) !== JSON.stringify(sourceTags)) gaps.push('biome-tag-catalog');

    for (const tag of contentTags) {
        for (const biome of content.tags.members('worldgen/biome', tag)) {
            if (!java.biomes.has(biome)) gaps.push(`biome-tag:${tag}:unknown:${biome}`);
        }
    }

    return gaps;
};

/** A Bedrock biome's expected world-view tags, keyed by the Bedrock name in the real content. */
const biomeWorldViewGaps = (content: ServerContent): string[] => {
    const chunk = new Chunk(0, 0);
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
        dimension: Dimensions.Overworld
    });
    const groups = worldContentGroups({
        dimension: Dimensions.Overworld.name,
        world: () => world,
        seed: 0n,
        difficulty: () => 2,
        random: { nextFloat: () => 0, nextInt: () => 0 },
        content: () => content
    });
    const gaps: string[] = [];

    for (const identifier of content.biomes.keys()) {
        const biome = bedrockBiomeToJava(identifier);
        if (biome.kind === 'unknown') {
            gaps.push(`biome:${identifier}:no-client-id`);
            continue;
        }

        const { id } = biome.bedrock;
        const position = { x: id % 16, y: 64, z: Math.floor(id / 16) };
        chunk.getBiomes().fillColumn(position.x, position.z, id);

        if (groups.blocks.biome(position) !== identifier) gaps.push(`biome:${identifier}:identifier`);
        const definition = content.biomes.get(identifier);
        if (definition === undefined) {
            gaps.push(`biome:${identifier}:missing-definition`);
        } else if (
            JSON.stringify(groups.blocks.biomeTags(position)) !== JSON.stringify(bedrockBiomeTagsOf(definition.data))
        ) {
            gaps.push(`biome:${identifier}:tags`);
        }
    }

    return gaps;
};

/** Checks payload entries and their references against the registries a client receives. */
const clientPayloadComparison = (
    content: ServerContent
): {
    gaps: string[];
    measurements: Record<string, number>;
    cases: ReturnType<typeof parityCase>[];
} => {
    const payloads = buildNetworkContentPayloads(content);
    const gaps: string[] = [];
    const capturedBlocks = new Map(block_definitions.map((entry) => [entry.name, entry.definition]));
    const actualCaptured = payloads.blockProperties.filter((entry) => capturedBlocks.has(entry.name));
    const expectedCaptured = block_definitions.filter((entry) => content.blocks.types.has(entry.name));

    if (
        JSON.stringify(actualCaptured.map((entry) => entry.name)) !==
        JSON.stringify(expectedCaptured.map((entry) => entry.name))
    ) {
        gaps.push('block-property-catalog');
    }
    for (const block of actualCaptured) {
        const captured = capturedBlocks.get(block.name);
        if (captured === undefined || !block.definition.equals(captured)) gaps.push(`block-property:${block.name}`);
    }

    const inventedBlocks = payloads.blockProperties.filter((entry) => !capturedBlocks.has(entry.name));
    if (payloads.report.inventedBlocks !== inventedBlocks.length) gaps.push('invented-block-report');

    const advertisedItems = new Map(payloads.items.map((entry) => [entry.name, entry]));
    const contentItems = [...content.items.types.keys()].sort();
    const payloadItems = [...advertisedItems.keys()].sort();
    if (JSON.stringify(payloadItems) !== JSON.stringify(contentItems)) gaps.push('item-registry-catalog');

    const capturedItems = loadRequiredItemList();
    const allocated = new Set(payloads.report.allocatedItemIds);
    for (const entry of payloads.items) {
        const captured = capturedItems[entry.name];
        if (captured === undefined) {
            if (!allocated.has(entry.name)) gaps.push(`item:${entry.name}:unreported-id`);
        } else if (entry.runtimeId !== captured.runtime_id || entry.componentBased !== captured.component_based) {
            gaps.push(`item:${entry.name}:capture`);
        }
    }
    for (const identifier of allocated) {
        if (!advertisedItems.has(identifier)) gaps.push(`item:${identifier}:allocation-without-entry`);
    }

    const runtimeIds = new Set(payloads.items.map((entry) => entry.runtimeId));
    const names = new Set(advertisedItems.keys());
    if (payloads.report.unknownCreativeItems.length > 0) gaps.push('creative-items-without-registry-entry');

    for (const [index, source] of payloads.creativeItems.entries()) {
        const entry = payloads.creative.entries[index];
        const registryItem = advertisedItems.get(source.name);
        if (entry === undefined || registryItem === undefined) {
            gaps.push(`creative:${source.name}:missing-entry`);
            continue;
        }

        const expectedRuntimeId = source.name === 'minecraft:air' ? 0 : registryItem.runtimeId;
        if (entry.item.runtimeId !== expectedRuntimeId) gaps.push(`creative:${source.name}:runtime-id`);
        if (payloads.creative.groups[entry.group] === undefined) gaps.push(`creative:${source.name}:group`);
    }

    for (const group of payloads.creative.groups) {
        if (group.icon.runtimeId !== 0 && !runtimeIds.has(group.icon.runtimeId))
            gaps.push(`creative-group:${group.name}:icon`);
    }

    const ingredientGaps: string[] = [];
    const checkIngredient = (ingredient: {
        descriptor: { kind: 'name'; name: string } | { kind: 'tag'; tag: string } | null;
    }): void => {
        const descriptor = ingredient.descriptor;
        if (descriptor === null) return;
        if (descriptor.kind === 'name' && !names.has(descriptor.name)) ingredientGaps.push(`item:${descriptor.name}`);
        if (descriptor.kind === 'tag' && !content.items.tags.has(descriptor.tag))
            ingredientGaps.push(`tag:${descriptor.tag}`);
    };
    const outputGaps: string[] = [];
    const checkOutput = (output: { runtimeId: number }): void => {
        if (!runtimeIds.has(output.runtimeId)) outputGaps.push(String(output.runtimeId));
    };

    for (const recipe of payloads.crafting.shaped) {
        recipe.pattern.forEach(checkIngredient);
        recipe.outputs.forEach(checkOutput);
    }
    for (const recipe of payloads.crafting.shapeless) {
        recipe.ingredients.forEach(checkIngredient);
        recipe.outputs.forEach(checkOutput);
    }
    for (const recipe of payloads.crafting.smithingTransform) {
        checkIngredient(recipe.template);
        checkIngredient(recipe.base);
        checkIngredient(recipe.addition);
        checkOutput(recipe.output);
    }
    for (const mix of payloads.crafting.potionMixes) {
        for (const runtimeId of [mix.inputId, mix.reagentId, mix.outputId]) {
            if (!runtimeIds.has(runtimeId)) outputGaps.push(String(runtimeId));
        }
    }
    if (ingredientGaps.length > 0) gaps.push(`crafting-ingredients:${ingredientGaps.join(',')}`);
    if (outputGaps.length > 0) gaps.push(`crafting-outputs:${outputGaps.join(',')}`);
    if (!payloads.crafting.cleanRecipes) gaps.push('crafting-clear-flag');

    const cases = [
        parityCase(
            'block-property-catalog',
            'Block property catalog',
            'Bedrock block definitions in the client payload',
            !gaps.includes('block-property-catalog')
        ),
        ...[...new Set([...expectedCaptured, ...actualCaptured].map((entry) => entry.name))].map((name) => {
            const block = actualCaptured.find((entry) => entry.name === name);
            const captured = capturedBlocks.get(name);
            return parityCase(
                `block-property:${name}`,
                name,
                'Bedrock block property definition',
                block !== undefined && captured !== undefined && block.definition.equals(captured)
            );
        }),
        parityCase(
            'invented-block-report',
            'Invented block count',
            'Client payload report matches unrecognized block properties',
            !gaps.includes('invented-block-report')
        ),
        parityCase(
            'item-registry-catalog',
            'Item registry catalog',
            'Server item types in the client payload',
            !gaps.includes('item-registry-catalog')
        ),
        ...[...new Set([...contentItems, ...payloadItems])].map((name) => {
            const entry = advertisedItems.get(name);
            const captured = capturedItems[name];
            const matched =
                entry !== undefined &&
                content.items.types.has(name) &&
                (captured === undefined
                    ? allocated.has(name)
                    : entry.runtimeId === captured.runtime_id && entry.componentBased === captured.component_based);
            return parityCase(`item:${name}`, name, 'Bedrock item registry payload', matched);
        }),
        ...[...allocated].map((name) =>
            parityCase(
                `allocated-item:${name}`,
                name,
                'Allocated item id has a client registry entry',
                advertisedItems.has(name)
            )
        ),
        parityCase(
            'creative-items-without-registry-entry',
            'Creative item registry references',
            'Every creative item has an item registry entry',
            payloads.report.unknownCreativeItems.length === 0
        ),
        ...payloads.creativeItems.map((source) =>
            parityCase(
                `creative:${source.name}`,
                source.name,
                'Creative item runtime id and group',
                !gaps.some((gap) => gap.startsWith(`creative:${source.name}:`))
            )
        ),
        ...payloads.creative.groups.map((group) =>
            parityCase(
                `creative-group:${group.name}`,
                group.name,
                'Creative group icon references an item registry entry',
                group.icon.runtimeId === 0 || runtimeIds.has(group.icon.runtimeId)
            )
        ),
        ...[...new Set(ingredientGaps)].map((ingredient) =>
            parityCase(
                `crafting-ingredient:${ingredient}`,
                ingredient,
                'Crafting ingredient reference resolves in the client registry',
                false
            )
        ),
        ...[...new Set(outputGaps)].map((runtimeId) =>
            parityCase(
                `crafting-output:${runtimeId}`,
                `Runtime item ${runtimeId}`,
                'Crafting output has a client item registry entry',
                false
            )
        ),
        parityCase(
            'crafting-clean-recipes',
            'Clean recipes flag',
            'Client crafting payload signals a full recipe replacement',
            payloads.crafting.cleanRecipes
        )
    ];

    return {
        gaps,
        cases,
        measurements: {
            blockPropertyEntries: payloads.blockProperties.length,
            itemEntries: payloads.items.length,
            creativeItems: payloads.creative.entries.length,
            shapedRecipes: payloads.crafting.shaped.length,
            shapelessRecipes: payloads.crafting.shapeless.length,
            smithingRecipes: payloads.crafting.smithingTransform.length,
            potionMixes: payloads.crafting.potionMixes.length
        }
    };
};

const REAL_STACK_REFERENCES = [REFERENCES.bedrockBehaviorPack, REFERENCES.javaWorldgenData] as const;

describeFamily(FAMILIES.integrationBlockBehaviors, [REFERENCES.bedrockBlockPalette], () => {
    it('filters random ticks by Bedrock state facts for mapped Java blocks', () => {
        const capture = loadBlockPaletteCapture();
        const cases: {
            readonly name: string;
            readonly states: Readonly<Record<string, number>>;
            readonly expected: boolean;
        }[] = [
            ...[0, 1, 3, 5].map((growth) => ({
                name: 'minecraft:pitcher_crop',
                states: { growth, upper_block_bit: 0 },
                expected: true
            })),
            { name: 'minecraft:cocoa', states: { age: 0, direction: 2 }, expected: true },
            ...[0, 1, 2, 3].map((direction) => ({
                name: 'minecraft:cocoa',
                states: { age: 2, direction },
                expected: false
            })),
            { name: 'minecraft:melon_stem', states: { facing_direction: 2, growth: 6 }, expected: true },
            // Java's attached melon stem maps to a mature Bedrock melon_stem state.
            ...[2, 3, 4, 5].map((facing_direction) => ({
                name: 'minecraft:melon_stem',
                states: { facing_direction, growth: 7 },
                expected: false
            }))
        ];
        for (const { name, states, expected } of cases) {
            const domain = capture.domains[name];
            expect(domain).toBeDefined();
            for (const [property, value] of Object.entries(states)) {
                const values = domain?.[property]?.values.map((accepted) =>
                    typeof accepted === 'boolean' ? String(Number(accepted)) : String(accepted)
                );
                expect(values).toContain(String(value));
            }

            expect(bedrockBlockPropertiesOf(name, states)?.randomTick).toBe(expected);
            const runtimeId = BlockRuntimeIds.tryGetByState(name, states);
            if (runtimeId === null) throw new Error(`No runtime id for ${name} ${JSON.stringify(states)}`);
            expect(takesRandomTicks(runtimeId)).toBe(expected);
        }
    });

    it('writes grown bamboo states that the captured Bedrock catalog accepts', () => {
        const capture = loadBlockPaletteCapture();
        const states = {
            age_bit: 0,
            bamboo_leaf_size: 'large_leaves',
            bamboo_stalk_thickness: 'thick'
        };
        const bamboo = capture.domains['minecraft:bamboo'];
        expect(bamboo?.age_bit?.values.map(Number)).toContain(states.age_bit);
        expect(bamboo?.bamboo_leaf_size?.values).toContain(states.bamboo_leaf_size);
        expect(bamboo?.bamboo_stalk_thickness?.values).toContain(states.bamboo_stalk_thickness);
        expect(BlockRuntimeIds.tryGetByState('minecraft:bamboo', states)).not.toBeNull();

        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        const plant = { x: 0, y: 1, z: 0 };
        const above = { x: 0, y: 2, z: 0 };
        harness.dimension.set(plant, 'minecraft:bamboo', states);
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        const grown = harness.dimension.block(above);
        expect(grown.identifier).toBe('minecraft:bamboo');
        expect(BlockRuntimeIds.tryGetByState(grown.identifier, grown.states)).not.toBeNull();
    });

    it('keeps a vine on a jungle log when an unrelated face changes', () => {
        const states = { vine_direction_bits: 8 };
        const vine = loadBlockPaletteCapture().domains['minecraft:vine'];
        expect(vine?.vine_direction_bits?.values.map(Number)).toContain(states.vine_direction_bits);
        expect(BlockRuntimeIds.tryGetByState('minecraft:vine', states)).not.toBeNull();

        const harness = bindFamily(climbingFamily, 'minecraft:vine');
        const plant = { x: 0, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:vine', states);
        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:jungle_log');

        harness.neighborChanged(plant, 'west');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:vine');
    });
});

describeFamily(FAMILIES.integrationBlockBehaviors, REAL_STACK_REFERENCES, () => {
    it('keeps a dead bush on sand using Java dry vegetation support data', { timeout: 180_000 }, () => {
        const { content } = realStack();
        const tag = 'minecraft:supports_dry_vegetation';
        const supported = content.tags.includes('block', tag, 'minecraft:sand');

        const harness = bindFamily(floraFamily, 'minecraft:deadbush', { world: new JavaTagWorld(content) });
        const plant = { x: 0, y: 1, z: 0 };
        harness.dimension.set({ x: 0, y: 0, z: 0 }, 'minecraft:sand');
        harness.dimension.set(plant, 'minecraft:deadbush');

        harness.neighborChanged(plant, 'down');

        const remained = harness.dimension.identifierAt(plant) === 'minecraft:deadbush';
        reportParityCases(FAMILIES.integrationBlockBehaviors, import.meta.filename, [
            {
                id: 'minecraft:deadbush#minecraft:supports_dry_vegetation',
                title: 'minecraft:deadbush',
                context: 'Java block tag #minecraft:supports_dry_vegetation includes minecraft:sand',
                status: supported && remained ? 'passed' : 'failed'
            }
        ]);
        expect(supported).toBe(true);
        expect(remained).toBe(true);
    });
});

describeFamily(
    FAMILIES.integrationTags,
    REAL_STACK_REFERENCES,
    () => {
        it(
            'resolves loaded tag files and carries mapped memberships onto runtime registries',
            { timeout: 180_000 },
            () => {
                const { content } = realStack();
                const gaps = [
                    ...content.diagnostics
                        .filter((diagnostic) => diagnostic.severity === 'error')
                        .map((diagnostic) => `content:${diagnostic.code}:${diagnostic.path ?? diagnostic.message}`),
                    ...loadedTagGaps(content),
                    ...runtimeTagGaps(content),
                    ...javaBiomeTagGaps(content)
                ];
                const verdict = checkAllowList(FAMILIES.integrationTags, gaps);
                const definitions = [...content.definitions.tags.values()];
                const values = definitions.flatMap((definition) => tagValuesOf(definition.data));
                const unexpected = new Set(verdict.unexpected);

                reportParityCases(FAMILIES.integrationTags, import.meta.filename, [
                    ...runtimeTagCases(content, unexpected),
                    ...definitions.map((definition) => {
                        const members = tagValuesOf(definition.data);
                        const related = verdict.unexpected.filter((gap) => gap.includes(definition.identifier));
                        return {
                            id: `tag:${definition.identifier}`,
                            title: definition.identifier,
                            context: `Java tag members: ${members.map(({ id }) => id).join(', ')}`,
                            status: related.length === 0 ? ('passed' as const) : ('failed' as const),
                            ...(related.length === 0 ? {} : { details: related.join('; ') })
                        };
                    })
                ]);

                reportParityProgress(FAMILIES.integrationTags, {
                    loadedTagDefinitions: definitions.length,
                    declaredTagValues: values.length,
                    requiredTagValues: values.filter((value) => value.required).length,
                    ...runtimeTagMeasurements(content)
                });

                expect(verdict.unexpected).toEqual([]);
                expect(verdict.stale).toEqual([]);
                expect(content.tags.includes('block', 'minecraft:mineable/pickaxe', 'minecraft:stone')).toBe(true);
                expect(content.items.types.get('minecraft:oak_planks')?.hasJavaTag('minecraft:planks')).toBe(true);
                expect(content.entities.registry.get('minecraft:zombie')?.hasTag('minecraft:undead')).toBe(true);
                expect(content.tags.includes('worldgen/biome', 'minecraft:is_overworld', 'minecraft:plains')).toBe(
                    true
                );
            }
        );

        /**
         * Java's `minecraft:tool` rules name Java blocks, and Java has no lit variants: its
         * furnace and its redstone ore light up as a state rather than as a block of their
         * own. A pickaxe that read the Bedrock name against `#minecraft:mineable/pickaxe` was
         * the wrong tool for every lit block, so mining one dropped nothing of it.
         */
        it('keeps a pickaxe the correct tool for the lit Bedrock-only blocks', { timeout: 180_000 }, () => {
            const { content } = realStack();
            const pickaxe = new PrismarineItem({ name: 'minecraft:diamond_pickaxe', content });

            for (const identifier of [
                'minecraft:lit_furnace',
                'minecraft:lit_blast_furnace',
                'minecraft:lit_smoker',
                'minecraft:lit_redstone_ore',
                'minecraft:lit_deepslate_redstone_ore'
            ]) {
                const harvests = pickaxe.harvests(identifier);
                const asFastAsUnlit =
                    pickaxe.getMiningSpeed(identifier) === pickaxe.getMiningSpeed(bedrockBlockToJava(identifier)[0]!);
                reportParityCases(FAMILIES.integrationTags, import.meta.filename, [
                    {
                        id: `${identifier}/mineable-pickaxe`,
                        title: identifier,
                        context: 'Java #minecraft:mineable/pickaxe through the block mapping',
                        status: harvests && asFastAsUnlit ? 'passed' : 'failed'
                    }
                ]);
                expect(harvests, identifier).toBe(true);
                expect(asFastAsUnlit, identifier).toBe(true);
            }
        });

        /**
         * Java 26.3 keeps the tool transforms in its `block_transformer` registry, and the
         * rules name Java tags and blocks. Each case runs one real registry file against the
         * real tag stack and the block mapping: the loaded data decides what a tool does.
         */
        it('resolves the real block transformers: till, path, and strip', { timeout: 180_000 }, () => {
            const { content } = realStack();
            const blockAt = () => ({ identifier: 'minecraft:air', states: {} });

            const cases = [
                {
                    id: 'minecraft:hoe/till-grass',
                    transformer: 'minecraft:hoe',
                    clicked: 'minecraft:grass_block',
                    states: {},
                    expected: { identifier: 'minecraft:farmland', states: { moisturized_amount: 0 } }
                },
                {
                    id: 'minecraft:shovel/path-grass',
                    transformer: 'minecraft:shovel',
                    clicked: 'minecraft:grass_block',
                    states: {},
                    expected: { identifier: 'minecraft:grass_path', states: {} }
                },
                {
                    id: 'minecraft:axe/strip-log',
                    transformer: 'minecraft:axe',
                    clicked: 'minecraft:oak_log',
                    states: { pillar_axis: 'z' },
                    expected: { identifier: 'minecraft:stripped_oak_log', states: { pillar_axis: 'z' } }
                }
            ] as const;

            for (const found of cases) {
                const placement = resolveTransform(
                    content.blockTransformers,
                    { tags: content.tags, blockAt },
                    found.transformer,
                    { identifier: found.clicked, states: found.states, position: { x: 0, y: 64, z: 0 } },
                    'up'
                );
                const matches = JSON.stringify(placement) === JSON.stringify(found.expected);
                reportParityCases(FAMILIES.integrationTags, import.meta.filename, [
                    {
                        id: found.id,
                        title: found.transformer,
                        context: `Java block_transformer registry on ${found.clicked}`,
                        status: matches ? 'passed' : 'failed'
                    }
                ]);
                expect(placement, found.id).toEqual(found.expected);
            }
        });

        /**
         * Java's `FarmBlock.shouldMaintainFarmland` is a tag read, not a shape read, so the
         * real `#minecraft:maintains_farmland` has to decide it: the torchflower holds a field
         * without growing and the sweet berry bush grows without holding one.
         */
        it('reads the real maintains_farmland tag when farmland dries out', { timeout: 180_000 }, () => {
            const { content } = realStack();
            const farmland = { x: 0, y: 0, z: 0 };
            const planted = { x: 0, y: 1, z: 0 };

            for (const [identifier, stays] of [
                ['minecraft:wheat', true],
                ['minecraft:torchflower', true],
                ['minecraft:pumpkin_stem', true],
                ['minecraft:sweet_berry_bush', false]
            ] as const) {
                const tagged = content.tags.includes('block', 'minecraft:maintains_farmland', identifier);
                const harness = bindFamily(soilFamily, 'minecraft:farmland', { world: new JavaTagWorld(content) });
                harness.dimension.set(farmland, 'minecraft:farmland', { moisturized_amount: 0 });
                harness.dimension.set(planted, identifier);

                harness.randomTick(farmland);

                const kept = harness.dimension.identifierAt(farmland) === 'minecraft:farmland';
                reportParityCases(FAMILIES.integrationTags, import.meta.filename, [
                    {
                        id: `minecraft:farmland/maintains:${identifier}`,
                        title: 'minecraft:farmland',
                        context: `Java #minecraft:maintains_farmland under ${identifier}`,
                        status: kept === stays ? 'passed' : 'failed'
                    }
                ]);
                expect(kept, identifier).toBe(stays);
                // The tag is what decided it, rather than the block happening to grow.
                expect(tagged, identifier).toBe(stays);
            }
        });

        it('keeps bamboo on real Java sand and gravel supports', { timeout: 180_000 }, () => {
            const { content } = realStack();
            const tag = 'minecraft:supports_bamboo';
            const ground = { x: 0, y: 0, z: 0 };
            const plant = { x: 0, y: 1, z: 0 };

            for (const identifier of ['minecraft:sand', 'minecraft:gravel']) {
                const supported = content.tags.includes('block', tag, identifier);
                const harness = bindFamily(bambooFamily, 'minecraft:bamboo', { world: new JavaTagWorld(content) });
                harness.dimension.set(ground, identifier);
                harness.dimension.set(plant, 'minecraft:bamboo');

                harness.neighborChanged(plant, 'down');

                const remained = harness.dimension.identifierAt(plant) === 'minecraft:bamboo';
                const noDrops = harness.dimension.drops.length === 0;
                reportParityCases(FAMILIES.integrationTags, import.meta.filename, [
                    {
                        id: `minecraft:bamboo/support:${identifier}`,
                        title: 'minecraft:bamboo',
                        context: `Java tag #${tag} support on ${identifier}`,
                        status: supported && remained && noDrops ? 'passed' : 'failed'
                    }
                ]);
                expect(supported).toBe(true);
                expect(remained).toBe(true);
                expect(noDrops).toBe(true);
            }
        });

        it('returns every real Bedrock biome tag through the chunk-backed world view', { timeout: 180_000 }, () => {
            const { content } = realStack();

            reportParityProgress(FAMILIES.integrationTags, {
                bedrockBiomeWorldViews: [...content.biomes.keys()].length
            });
            expect(biomeWorldViewGaps(content)).toEqual([]);
        });
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.integrationEntityRuntime,
    REAL_STACK_REFERENCES,
    () => {
        it('applies a vanilla entity event and runs its data-driven physics', { timeout: 180_000 }, () => {
            const { runtime } = realStack();
            reportParityProgress(FAMILIES.integrationEntityRuntime, {
                dataDrivenEntityTypes: realStack().content.entities.registry.size
            });
            const cube = runtime.spawn('minecraft:sulfur_cube', { x: 0.5, y: 64.5, z: 0.5 });
            if (cube === undefined) throw new Error('the vanilla stack declares no minecraft:sulfur_cube');

            cube.body.push({ x: 1, y: -1, z: 0 });
            cube.instance.fire('minecraft:become_bouncy');
            runtime.tick(1);

            const bouncy = cube.instance.hasComponent('minecraft:bounciness');
            const moving = cube.body.velocity.x > 0 && cube.body.velocity.y > 0;
            reportParityCases(FAMILIES.integrationEntityRuntime, import.meta.filename, [
                {
                    id: 'minecraft:sulfur_cube/minecraft:become_bouncy',
                    title: 'minecraft:sulfur_cube',
                    context: 'Java vanilla event → bounciness component and runtime physics',
                    status: bouncy && moving ? 'passed' : 'failed'
                }
            ]);
            expect(bouncy).toBe(true);
            expect(cube.body.velocity.x).toBeGreaterThan(0);
            expect(cube.body.velocity.y).toBeGreaterThan(0);
            runtime.remove(cube.id, 'parity runtime check complete');
        });

        it('ticks the Java piglin brain without selecting Bedrock goals', { timeout: 180_000 }, () => {
            const { runtime } = realStack();
            const piglin = runtime.spawn('minecraft:piglin', { x: 0.5, y: 64.5, z: 0.5 });
            if (piglin === undefined) throw new Error('the vanilla stack declares no minecraft:piglin');

            let goalChecks = 0;
            piglin.instance.goals.add({
                name: 'parity:brain-goal-probe',
                priority: 0,
                controlFlags: [],
                goal: { canStart: () => (goalChecks += 1) > 0 }
            });
            runtime.tick(1);

            expect(piglin.brainMob?.id).toBe('minecraft:piglin');
            expect(piglin.brain).toBeDefined();
            expect(goalChecks).toBe(0);
            runtime.remove(piglin.id, 'parity brain goal check complete');
        });

        it(
            'phases Java goal selectors by entity id and resets inactivity only near players',
            { timeout: 180_000 },
            () => {
                const { runtime, world } = realStack();
                const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: 64.5, z: 0.5 });
                if (cow === undefined) throw new Error('the vanilla stack declares no minecraft:cow');

                let selectorStarts = 0;
                let selectorTicks = 0;
                let everyTickTicks = 0;
                cow.instance.goals.add({
                    name: 'parity:selector-cadence',
                    priority: 100,
                    controlFlags: [],
                    goal: {
                        canStart: () => {
                            selectorStarts += 1;
                            return true;
                        },
                        canContinue: () => false,
                        tick: () => {
                            selectorTicks += 1;
                        }
                    }
                });
                cow.instance.goals.add({
                    name: 'parity:every-tick',
                    priority: 101,
                    controlFlags: [],
                    goal: {
                        canStart: () => true,
                        tick: () => {
                            everyTickTicks += 1;
                        },
                        requiresUpdateEveryTick: () => true
                    }
                });

                let expectedSelectorTicks = 0;
                for (let tick = 1; tick <= 8; tick += 1) {
                    if (tick === 1 || (tick + cow.id) % 2 === 0) expectedSelectorTicks += 1;
                    runtime.tick(tick);
                }

                expect(selectorStarts).toBe(expectedSelectorTicks);
                expect(selectorTicks).toBe(expectedSelectorTicks);
                expect(everyTickTicks).toBe(8);
                expect(cow.instance.noActionTime).toBe(8);

                world.players = [
                    {
                        id: 100_001,
                        identifier: 'minecraft:player',
                        position: { x: cow.position.x + 31.99, y: cow.position.y, z: cow.position.z }
                    }
                ];
                runtime.tick(9);
                expect(cow.instance.noActionTime).toBe(1);

                world.players = [
                    {
                        id: 100_001,
                        identifier: 'minecraft:player',
                        position: { x: cow.position.x + 32, y: cow.position.y, z: cow.position.z }
                    }
                ];
                runtime.tick(10);
                expect(cow.instance.noActionTime).toBe(2);
                runtime.remove(cow.id, 'parity goal cadence complete');
            }
        );

        it('selects the nearest Java axolotl water and frog land targets', { timeout: 180_000 }, () => {
            const { runtime, world } = realStack();
            world.setBlock({ x: 103, y: 64, z: 0 }, 'minecraft:water');
            world.setBlock({ x: 105, y: 64, z: 0 }, 'minecraft:water');
            world.setBlock({ x: 200, y: 64, z: 0 }, 'minecraft:water');

            const axolotl = runtime.spawn('minecraft:axolotl', { x: 100.5, y: 64.5, z: 0.5 });
            const frog = runtime.spawn('minecraft:frog', { x: 200.5, y: 64.5, z: 0.5 });
            if (axolotl?.brain === undefined || frog?.brain === undefined) {
                throw new Error('the Java stack must declare axolotls and frogs with brains');
            }

            runtime.tick(1);

            // Java 26.3 orders the bounded scans by Manhattan distance, then x from negative to positive.
            expect(axolotl.brain.getMemory(MemoryModuleTypes.WALK_TARGET)?.target.currentBlockPosition()).toEqual({
                x: 103,
                y: 64,
                z: 0
            });
            expect(frog.brain.getMemory(MemoryModuleTypes.WALK_TARGET)?.target.currentBlockPosition()).toEqual({
                x: 199,
                y: 64,
                z: 0
            });
            runtime.remove(frog.id, 'parity brain search complete');
            runtime.remove(axolotl.id, 'parity brain search complete');
        });
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.gameplayBrainEffects,
    REAL_STACK_REFERENCES,
    () => {
        it('drops the Java sniffer digging loot through the entity host', { timeout: 180_000 }, () => {
            const { runtime, world } = realStack();
            const sniffer = runtime.spawn('minecraft:sniffer', { x: 0.5, y: 64, z: 0.5 });
            if (sniffer === undefined) throw new Error('the Java stack declares no minecraft:sniffer');
            const dropsBefore = world.drops.length;
            const soundsBefore = world.sounds.length;

            runtime.dropSnifferSeed(sniffer.body);

            const drops = world.drops.slice(dropsBefore);
            const validDrops =
                drops.length > 0 &&
                drops.every(({ item }) => item.count > 0) &&
                drops.every(({ item }) =>
                    ['minecraft:torchflower_seeds', 'minecraft:pitcher_pod'].includes(item.identifier)
                ) &&
                world.sounds.slice(soundsBefore).includes('minecraft:entity.sniffer.drop_seed');
            reportParityCases(FAMILIES.gameplayBrainEffects, import.meta.filename, [
                {
                    id: 'minecraft:sniffer/digging',
                    title: 'minecraft:sniffer',
                    context: 'Java digging → seed drops and entity sound',
                    status: validDrops ? 'passed' : 'failed'
                }
            ]);
            expect(drops.length).toBeGreaterThan(0);
            expect(drops.every(({ item }) => item.count > 0)).toBe(true);
            expect(
                drops.every(({ item }) =>
                    ['minecraft:torchflower_seeds', 'minecraft:pitcher_pod'].includes(item.identifier)
                )
            ).toBe(true);
            expect(world.sounds.slice(soundsBefore)).toContain('minecraft:entity.sniffer.drop_seed');
            runtime.remove(sniffer.id, 'parity brain effect complete');
        });

        it('deals ten sonic-boom damage and applies the Java impulse to an indexed target', () => {
            const { runtime, world } = realStack();
            const warden = runtime.spawn('minecraft:warden', { x: 0.5, y: 64, z: 0.5 });
            const target = runtime.spawn('minecraft:cow', { x: 0.5, y: 64, z: 8.5 });
            if (warden === undefined || target === undefined) {
                throw new Error('the Java stack must declare both minecraft:warden and minecraft:cow');
            }
            const startingHealth = target.instance.attributes.get('health')?.current;
            if (startingHealth === undefined) throw new Error('the cow has no Java health attribute');
            const soundsBefore = world.sounds.length;

            runtime.sonicBoom(warden.body, target.id);

            const health = target.instance.attributes.get('health')?.current;
            const impulse = Math.hypot(target.body.velocity.x, target.body.velocity.y - 0.5, target.body.velocity.z);
            const matches =
                health === startingHealth - 10 &&
                Math.abs(target.body.velocity.x) < 1e-5 &&
                target.body.velocity.z > 0 &&
                Math.abs(impulse - 2.5) < 1e-5 &&
                world.sounds.slice(soundsBefore).includes('minecraft:entity.warden.sonic_boom');
            reportParityCases(FAMILIES.gameplayBrainEffects, import.meta.filename, [
                {
                    id: 'minecraft:warden/minecraft:sonic_boom',
                    title: 'minecraft:warden',
                    context: 'Java sonic-boom damage and impulse against minecraft:cow',
                    status: matches ? 'passed' : 'failed'
                }
            ]);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth - 10);
            expect(target.body.velocity.x).toBeCloseTo(0);
            expect(target.body.velocity.z).toBeGreaterThan(0);
            expect(
                Math.hypot(target.body.velocity.x, target.body.velocity.y - 0.5, target.body.velocity.z)
            ).toBeCloseTo(2.5);
            expect(world.sounds.slice(soundsBefore)).toContain('minecraft:entity.warden.sonic_boom');
            runtime.remove(target.id, 'parity brain effect complete');
            runtime.remove(warden.id, 'parity brain effect complete');
        });

        it('reads Java raid state and sends villager raid effects to the host', () => {
            const { runtime, world } = realStack();
            world.villagerRaidState = { hasStarted: true, betweenWaves: false, victory: true };
            const villager = runtime.spawn('minecraft:villager', { x: 0.5, y: 64, z: 0.5 });
            if (villager === undefined) throw new Error('the Java stack declares no minecraft:villager');
            const effectsBefore = world.villagerRaidEffects.length;

            expect(runtime.villagerRaidState(villager.body)).toEqual(world.villagerRaidState);
            runtime.villagerRaidEffect(villager.body, 'ring_bell');
            runtime.villagerRaidEffect(villager.body, 'move_to_sky_seeing_spot');
            runtime.villagerRaidEffect(villager.body, 'celebrate_victory');
            runtime.villagerRaidEffect(villager.body, 'reset_status');

            const effects = world.villagerRaidEffects.slice(effectsBefore).map(({ effect }) => effect);
            const expected = ['ring_bell', 'move_to_sky_seeing_spot', 'celebrate_victory', 'reset_status'];
            const matches =
                JSON.stringify(runtime.villagerRaidState(villager.body)) === JSON.stringify(world.villagerRaidState) &&
                JSON.stringify(effects) === JSON.stringify(expected);
            reportParityCases(FAMILIES.gameplayBrainEffects, import.meta.filename, [
                {
                    id: 'minecraft:villager/raid-effects',
                    title: 'minecraft:villager',
                    context: 'Java raid state and host effects',
                    status: matches ? 'passed' : 'failed'
                }
            ]);
            expect(runtime.villagerRaidState(villager.body)).toEqual(world.villagerRaidState);
            expect(effects).toEqual(expected);
            world.villagerRaidState = undefined;
            runtime.remove(villager.id, 'parity brain effect complete');
        });
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.integrationSpawning,
    REAL_STACK_REFERENCES,
    () => {
        it(
            'places vanilla cows on supported positions outside the world-spawn exclusion radius',
            { timeout: 180_000 },
            () => {
                const { content } = realStack();
                const cowRules = content.spawnRules.filter(
                    (rule) => rule.identifier === 'minecraft:cow' && rule.populationControl === 'animal'
                );
                const world = {
                    site: (flag, at) => (flag === 'surface' ? at.y >= 64 : flag === 'underground' && at.y < 64),
                    block: (at) => (at.y <= 63 ? 'minecraft:grass_block' : 'minecraft:air'),
                    solid: (at) => at.y === 63,
                    light: () => 15,
                    biomeTags: () => ['animal', 'plains', 'overworld'],
                    biome: () => 'minecraft:plains',
                    surfaceY: () => 64,
                    minY: () => -64,
                    players: () => [{ position: { x: 72.5, y: 64, z: 72.5 } }],
                    worldSpawn: () => ({ x: 0, y: 64, z: 0 }),
                    poolCount: () => 0,
                    typeCount: () => 0,
                    difficulty: () => 'normal' as const,
                    weather: () => 'clear' as const,
                    age: () => 100_000,
                    mobEventActive: () => true,
                    villageBorderDistance: () => 4
                } satisfies SpawnWorld;
                const constants = {
                    ...SPAWN_CONSTANTS,
                    spawnRadiusChunks: 4,
                    chunksPerCycle: 1,
                    positionsPerChunk: 1,
                    herdRadius: 0
                };
                const runWithDistance = (spawnWorld: SpawnWorld, minimumSpawnDistance: number) =>
                    new Spawner({
                        rules: cowRules,
                        world: spawnWorld,
                        random: { nextFloat: () => 0, nextInt: () => 0 },
                        constants: { ...constants, minimumSpawnDistance },
                        engineRules: new Map()
                    }).cycle('animal', 0);

                const supportedSpawns = runWithDistance(world, 0);
                const rejectedUnsupported = runWithDistance({ ...world, solid: () => false }, 0).length === 0;
                const rejectedSpawnRadius = runWithDistance(world, SPAWN_CONSTANTS.minimumSpawnDistance).length === 0;
                const matches =
                    cowRules.length > 0 &&
                    supportedSpawns.length > 0 &&
                    supportedSpawns.every(({ position }) => position.y === 64) &&
                    rejectedUnsupported &&
                    rejectedSpawnRadius;
                reportParityCases(FAMILIES.integrationSpawning, import.meta.filename, [
                    {
                        id: 'minecraft:cow/animal-spawn',
                        title: 'minecraft:cow',
                        context: 'Java spawn rules · surface support and world-spawn exclusion radius',
                        status: matches ? 'passed' : 'failed'
                    }
                ]);
                expect(cowRules.length).toBeGreaterThan(0);
                expect(supportedSpawns.length).toBeGreaterThan(0);
                expect(supportedSpawns.every(({ position }) => position.y === 64)).toBe(true);
                expect(rejectedUnsupported).toBe(true);
                expect(rejectedSpawnRadius).toBe(true);
            }
        );

        it('spawns vanilla cows on the forest floor rather than on the canopy over it', { timeout: 180_000 }, () => {
            const { content } = realStack();
            const cowRules = content.spawnRules.filter(
                (rule) => rule.identifier === 'minecraft:cow' && rule.populationControl === 'animal'
            );

            // One real chunk of forest: dirt, the grass block a cow belongs on, the grass
            // growing out of it, and a canopy seven blocks over its head.
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
            for (let x = 0; x < 16; x += 1) {
                for (let z = 0; z < 16; z += 1) {
                    chunk.setBlockRuntimeId(x, 62, z, BlockRuntimeIds.getByName('minecraft:dirt'));
                    chunk.setBlockRuntimeId(x, 63, z, BlockRuntimeIds.getByName('minecraft:grass_block'));
                    chunk.setBlockRuntimeId(x, 64, z, BlockRuntimeIds.getByName('minecraft:tall_grass'));
                    chunk.setBlockRuntimeId(x, 70, z, BlockRuntimeIds.getByName('minecraft:oak_leaves'));
                }
            }

            const world: World = Object.assign(Object.create(World.prototype), {
                chunks: new Map([[Chunk.packXZ(0, 0), chunk]]),
                dimension: Dimensions.Overworld
            });
            const groups = worldContentGroups({
                dimension: Dimensions.Overworld.name,
                world: () => world,
                seed: 0n,
                difficulty: () => 2,
                random: { nextFloat: () => 0, nextInt: () => 0 },
                content: () => content
            });
            const blockAt = ({ x, y, z }: SpawnPosition) => world.loadedBlockAt(x, y, z)?.name;
            const solidAt = (at: SpawnPosition) => {
                const block = world.loadedBlockAt(at.x, at.y, at.z);
                if (block === undefined) return true;
                const type = content.blocks.types.get(block.name);
                return type === undefined || content.blocks.table.solid[type.state(block.states).runtimeId] === 1;
            };

            const spawnWorld = {
                // The two passes split on the spawn surface, which is the split
                // `src/entity/contentAdapter.ts` makes over the same adapter member.
                site: (flag, at) => {
                    const surface = groups.blocks.surfaceY(at.x, at.z);
                    if (surface === undefined) return false;
                    if (flag === 'surface') return at.y >= surface;
                    if (flag === 'underground') return at.y < surface;
                    return false;
                },
                block: blockAt,
                solid: solidAt,
                light: () => 15,
                biomeTags: () => ['animal', 'forest', 'overworld'],
                biome: () => 'minecraft:forest',
                surfaceY: (x, z) => groups.blocks.surfaceY(x, z),
                minY: () => Dimensions.Overworld.minY,
                players: () => [{ position: { x: 8.5, y: 64, z: 8.5 } }],
                worldSpawn: () => undefined,
                poolCount: () => 0,
                typeCount: () => 0,
                difficulty: () => 'normal' as const,
                weather: () => 'clear' as const,
                age: () => 100_000,
                mobEventActive: () => true,
                villageBorderDistance: () => 4
            } satisfies SpawnWorld;

            const spawns = new Spawner({
                rules: cowRules,
                world: spawnWorld,
                random: { nextFloat: () => 0, nextInt: () => 0 },
                constants: {
                    ...SPAWN_CONSTANTS,
                    spawnRadiusChunks: 0,
                    chunksPerCycle: 1,
                    positionsPerChunk: 1,
                    herdRadius: 0,
                    minimumSpawnDistance: 0
                },
                engineRules: new Map()
            }).cycle('animal', 0);

            // The grass block's own y plus one: the cow stands in the tall grass, on the
            // ground the rule's block filter names, with the canopy well over its head.
            const onTheFloor =
                spawns.length > 0 &&
                spawns.every(
                    ({ position }) =>
                        position.y === 64 && blockAt({ ...position, y: position.y - 1 }) === 'minecraft:grass_block'
                );
            reportParityCases(FAMILIES.integrationSpawning, import.meta.filename, [
                {
                    id: 'minecraft:cow/forest-floor-spawn',
                    title: 'minecraft:cow',
                    context: 'Java spawn heightmap · MOTION_BLOCKING_NO_LEAVES under a canopy',
                    status: onTheFloor ? 'passed' : 'failed'
                }
            ]);
            expect(spawns.length).toBeGreaterThan(0);
            expect(onTheFloor).toBe(true);
        });
    },
    { tags: ['real-data'] }
);

/** Groups component names by namespace so per-entity dashboard details stay compact. */
const groupComponentNamesByNamespace = (identifiers: readonly string[]): string => {
    const namesByNamespace = new Map<string, string[]>();

    for (const identifier of identifiers) {
        const separator = identifier.indexOf(':');
        const namespace = separator < 0 ? '' : identifier.slice(0, separator);
        const name = separator < 0 ? identifier : identifier.slice(separator + 1);
        const names = namesByNamespace.get(namespace) ?? [];
        names.push(name);
        namesByNamespace.set(namespace, names);
    }

    return [...namesByNamespace]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([namespace, names]) => `${namespace}[${names.toSorted().join(',')}]`)
        .join(';');
};

interface EntityRuntimeCase {
    readonly identifier: string;
    readonly components: readonly string[];
    readonly gaps: readonly string[];
    readonly runtimeSupport: TrackerRuntimeSupport;
}

interface JavaEntityRuntimeCase {
    readonly identifier: string;
    readonly runtimeSupport: TrackerRuntimeSupport;
}

/** Compares every entity declaration with its resolved type, component path, and live spawn/tick. */
const compareEntityRuntimeCoverage = (
    stack: RealStack
): {
    gaps: string[];
    measurements: Record<string, number>;
    cases: EntityRuntimeCase[];
    javaCases: JavaEntityRuntimeCase[];
} => {
    const { content, runtime, reports, reportContext } = stack;
    const source = content.definitions.entities;
    const types = content.entities.registry;
    const components = content.entities.components;
    const dataComponents = new Set(DATA_COMPONENTS);
    const triggerComponents = new Set<string>(TRIGGER_COMPONENTS);
    const sourceIdentifiers = [...source.keys()].sort();
    const gaps: string[] = [];
    const declaredComponents = new Set<string>();
    const unimplementedEntities = new Set<string>();
    const runtimeIdentifiers = new Set([...types].map(([identifier]) => identifier));
    const measurements: Record<string, number> = {};
    const entityCoverage = new Map<string, EntityCoverageCounts>();
    const runtimeSupportByIdentifier = new Map<string, TrackerRuntimeSupport>();
    let spawnedTypes = 0;
    let tickedTypes = 0;
    let missingRuntimeTypes = 0;
    let runtimeTypesWithoutDeclarations = 0;
    let unimplementedComponentDeclarations = 0;
    let dataOnlyComponentDeclarations = 0;
    let triggerComponentDeclarations = 0;
    let goalComponentDeclarations = 0;
    let registeredComponentDeclarationsWithoutHooks = 0;
    let tick = 0;

    reports.length = 0;
    reportContext.identifier = undefined;

    for (const identifier of runtimeIdentifiers) {
        if (!source.has(identifier)) {
            runtimeTypesWithoutDeclarations += 1;
            gaps.push(`runtime-type-without-declaration:${identifier}`);
        }
    }

    for (const identifier of sourceIdentifiers) {
        const type = types.get(identifier);
        if (type === undefined) {
            missingRuntimeTypes += 1;
            gaps.push(`missing-runtime-type:${identifier}`);
            runtimeSupportByIdentifier.set(identifier, {
                status: 'missing',
                details: `No resolved runtime entity definition exists for ${identifier}.`
            });
            continue;
        }

        for (const component of type.declaredComponents) declaredComponents.add(component);
        const coverage = {
            declared: type.declaredComponents.length,
            hookBacked: 0,
            dataOnly: 0,
            registeredNoHook: 0,
            triggers: 0,
            goals: 0,
            unimplemented: 0,
            spawnActive: 0,
            spawnActiveGoals: 0
        };
        entityCoverage.set(identifier, coverage);
        const unimplementedComponents: string[] = [];
        const registeredNoHookComponents: string[] = [];

        for (const component of type.unimplementedComponents) {
            unimplementedEntities.add(identifier);
            unimplementedComponentDeclarations += 1;
            coverage.unimplemented += 1;
            unimplementedComponents.push(component);
            gaps.push(`unimplemented-component:${identifier}:${component}`);
        }
        const implementationIssues = type.unimplementedComponents.map(
            (component) => `Unimplemented component ${component}.`
        );

        if (unimplementedComponents.length > 0) {
            measurements[`entity:${identifier}:unimplemented-components:${unimplementedComponents.join(',')}`] =
                unimplementedComponents.length;
        }

        for (const component of type.declaredComponents) {
            const hooks = components.hooksOf(component);
            if (!components.has(component)) continue;
            if (triggerComponents.has(component)) {
                coverage.triggers += 1;
                triggerComponentDeclarations += 1;
            } else if (component.startsWith('minecraft:behavior.')) {
                coverage.goals += 1;
                goalComponentDeclarations += 1;
            } else if (dataComponents.has(component)) {
                coverage.dataOnly += 1;
                dataOnlyComponentDeclarations += 1;
            } else if (hooks.size > 0) {
                coverage.hookBacked += 1;
            } else {
                registeredComponentDeclarationsWithoutHooks += 1;
                coverage.registeredNoHook += 1;
                registeredNoHookComponents.push(component);
            }
        }

        if (registeredNoHookComponents.length > 0) {
            const names = groupComponentNamesByNamespace(registeredNoHookComponents);
            measurements[`entity:${identifier}:registered-no-hook-components:${names}`] =
                registeredNoHookComponents.length;
        }

        const data = type.declaredComponents.includes('jsprismarine:falling_block')
            ? { block: 'minecraft:stone' }
            : undefined;
        let entity: ReturnType<EntityRuntime['spawn']>;
        reportContext.identifier = identifier;
        try {
            entity = runtime.spawn(
                identifier,
                { x: spawnedTypes * 4 + 0.5, y: 64.5, z: 0.5 },
                data === undefined ? {} : { data }
            );
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            gaps.push(`spawn-failed:${identifier}:${reason}`);
            runtimeSupportByIdentifier.set(identifier, {
                status: 'missing',
                details: `Runtime type ${identifier} is registered but cannot spawn: ${reason}`
            });
            reportContext.identifier = undefined;
            continue;
        }
        if (entity === undefined) {
            gaps.push(`spawn-failed:${identifier}:runtime returned no entity`);
            runtimeSupportByIdentifier.set(identifier, {
                status: 'missing',
                details: `Runtime type ${identifier} is registered, but spawn returned no entity.`
            });
            reportContext.identifier = undefined;
            continue;
        }

        spawnedTypes += 1;
        if (entity.identifier !== identifier) {
            gaps.push(`spawned-wrong-type:${identifier}:${entity.identifier}`);
            implementationIssues.push(`Spawned ${entity.identifier} instead of ${identifier}.`);
        }
        const activeComponentNames = entity.instance.activeComponents().toSorted();
        const activeGoalNames = entity.instance.goals.names().toSorted();
        const componentCoverage = entityCoverage.get(identifier);
        if (componentCoverage !== undefined) {
            componentCoverage.spawnActive = activeComponentNames.length;
            componentCoverage.spawnActiveGoals = activeGoalNames.length;
        }
        const declaredComponentsForEntity = new Set(type.declaredComponents);
        for (const component of activeComponentNames) {
            if (!declaredComponentsForEntity.has(component)) {
                gaps.push(`active-component-without-declaration:${identifier}:${component}`);
                implementationIssues.push(`Active component ${component} has no declaration.`);
            }
        }
        for (const goal of activeGoalNames) {
            if (!declaredComponentsForEntity.has(goal)) {
                gaps.push(`active-goal-without-declaration:${identifier}:${goal}`);
                implementationIssues.push(`Active goal ${goal} has no declaration.`);
            }
        }
        try {
            runtime.tick(++tick);
            tickedTypes += 1;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            gaps.push(`tick-failed:${identifier}:${reason}`);
            implementationIssues.push(`Runtime tick failed: ${reason}`);
        } finally {
            runtime.remove(entity.id, 'parity entity coverage check complete');
            reportContext.identifier = undefined;
        }

        runtimeSupportByIdentifier.set(identifier, {
            status: implementationIssues.length === 0 ? 'spawnable' : 'partial',
            details: [
                `Runtime type ${identifier} resolves and spawns. ${coverage.declared} declared components: ${coverage.hookBacked} hook-backed, ${coverage.dataOnly} data-only, ${coverage.triggers} triggers, ${coverage.goals} AI goals, ${coverage.registeredNoHook} registered without direct hooks, and ${coverage.unimplemented} unresolved. ${activeComponentNames.length} components and ${activeGoalNames.length} AI goals are active at spawn.`,
                ...(type.unimplementedComponents.length === 0
                    ? []
                    : [`Unresolved: ${type.unimplementedComponents.join(', ')}.`]),
                ...implementationIssues
            ].join(' ')
        });
    }

    const componentTypes = [...declaredComponents];
    const componentsWithHooks = componentTypes.filter((component) => components.hooksOf(component).size > 0);
    const definitionErrors = content.diagnostics.filter(
        (diagnostic) =>
            diagnostic.severity === 'error' &&
            (diagnostic.code.startsWith('entity.') || diagnostic.code.startsWith('component.'))
    );
    for (const diagnostic of definitionErrors) {
        gaps.push(`definition-error:${diagnostic.code}:${diagnostic.path ?? diagnostic.message}`);
    }

    for (const report of reports) {
        const identifier = report.identifier ?? 'unattributed';
        const message = report.message
            .replace(/[\r\n|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const name = `entity:${identifier}:runtime-report:${message}`;
        measurements[name] = (measurements[name] ?? 0) + 1;
    }

    const componentTypesWithTriggerSemantics = new Set(
        componentTypes.filter((component) => triggerComponents.has(component))
    );
    const componentsWithoutDirectHooks = componentTypes.filter((component) => components.hooksOf(component).size === 0);
    for (const [identifier, coverage] of entityCoverage) {
        const summary = Object.entries(coverage)
            .map(([category, count]) => `${category}=${count}`)
            .join(',');
        measurements[`entity:${identifier}:component-coverage:${summary}`] = coverage.declared;
    }

    const cases = sourceIdentifiers.map((identifier): EntityRuntimeCase => {
        const type = types.get(identifier);
        const relatedGaps = gaps.filter((gap) => gap.includes(`${identifier}:`) || gap.endsWith(`:${identifier}`));
        return {
            identifier,
            components: type?.declaredComponents ?? [],
            gaps: relatedGaps,
            runtimeSupport: runtimeSupportByIdentifier.get(identifier) ?? {
                status: 'missing',
                details: `No runtime check result exists for ${identifier}.`
            }
        };
    });
    const javaIdentifiers = [
        ...new Set([...Object.keys(entitiesTable.entities), ...ENTITY_LOSSES.map(({ javaId }) => javaId)])
    ].toSorted((left, right) => left.localeCompare(right, 'en'));
    const javaCases = javaIdentifiers.map((identifier): JavaEntityRuntimeCase => {
        const mapping = javaEntityTypeToBedrock(identifier);
        if (mapping.kind === 'mapped') {
            return {
                identifier,
                runtimeSupport: runtimeSupportByIdentifier.get(mapping.bedrock) ?? {
                    status: 'missing',
                    details: `Java ${identifier} maps to ${mapping.bedrock}, but that runtime type was not checked.`
                }
            };
        }
        if (mapping.kind === 'loss') {
            if (mapping.loss.kind === 'block') {
                return {
                    identifier,
                    runtimeSupport: {
                        status: 'block-backed',
                        details: `${mapping.loss.reason} Runtime entity spawn does not apply.`
                    }
                };
            }
            if (mapping.loss.bedrockFallback === undefined) {
                return {
                    identifier,
                    runtimeSupport: { status: 'unrepresentable', details: mapping.loss.reason }
                };
            }

            const fallbackSupport = runtimeSupportByIdentifier.get(mapping.loss.bedrockFallback);
            return {
                identifier,
                runtimeSupport:
                    fallbackSupport === undefined || fallbackSupport.status === 'missing'
                        ? {
                              status: 'missing',
                              details: `${mapping.loss.reason} The substitute ${mapping.loss.bedrockFallback} has no working runtime spawn.`
                          }
                        : {
                              status: 'substitute',
                              details: `${mapping.loss.reason} Substitute runtime: ${fallbackSupport.details}`
                          }
            };
        }

        return {
            identifier,
            runtimeSupport: {
                status: 'missing',
                details: `Java entity ${identifier} does not have a known Bedrock runtime mapping.`
            }
        };
    });

    return {
        gaps,
        cases,
        javaCases,
        measurements: {
            ...measurements,
            sourceEntityDeclarations: source.size,
            runtimeEntityTypes: types.size,
            sourceEntityTypesWithoutRuntimeTypes: missingRuntimeTypes,
            runtimeEntityTypesWithoutSourceDeclarations: runtimeTypesWithoutDeclarations,
            runtimeEntitySpawns: spawnedTypes,
            runtimeEntityTicks: tickedTypes,
            declaredEntityComponentTypes: componentTypes.length,
            componentTypesWithHooks: componentsWithHooks.length,
            componentTypesWithTriggerSemantics: componentTypesWithTriggerSemantics.size,
            componentTypesWithoutDirectHooks: componentsWithoutDirectHooks.length,
            dataOnlyComponentDeclarations,
            triggerComponentDeclarations,
            goalComponentDeclarations,
            registeredComponentDeclarationsWithoutHooks,
            entitiesWithUnimplementedComponents: unimplementedEntities.size,
            unimplementedComponentDeclarations,
            entityDefinitionErrors: definitionErrors.length,
            entityRuntimeReports: reports.length
        }
    };
};

describeFamily(
    FAMILIES.integrationEntityCoverage,
    REAL_STACK_REFERENCES,
    () => {
        it('resolves and runs every entity declaration in the composed vanilla stack', { timeout: 180_000 }, () => {
            const stack = realStack();
            const comparison = compareEntityRuntimeCoverage(stack);
            const verdict = checkAllowList(FAMILIES.integrationEntityCoverage, comparison.gaps);
            const unexpected = new Set(verdict.unexpected);

            reportParityCases(
                FAMILIES.integrationEntityCoverage,
                import.meta.filename,
                comparison.cases.map(({ identifier, components, gaps, runtimeSupport }) => ({
                    id: identifier,
                    title: identifier,
                    context: `Declared entity components: ${components.join(', ')}`,
                    status: gaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                    runtimeSupport,
                    ...(gaps.length === 0 ? {} : { details: gaps.join('; ') })
                }))
            );
            reportParityCases(
                FAMILIES.entitiesBehavior,
                import.meta.filename,
                comparison.javaCases.map(({ identifier, runtimeSupport }) => ({
                    id: `runtime-behavior:${identifier}`,
                    title: identifier,
                    status: 'not measured',
                    runtimeSupport
                }))
            );

            reportParityProgress(FAMILIES.integrationEntityCoverage, comparison.measurements);
            expect(comparison.javaCases.map(({ identifier }) => identifier)).toContain('minecraft:ender_dragon');
            expect(
                comparison.javaCases.find(({ identifier }) => identifier === 'minecraft:ender_dragon')?.runtimeSupport
                    .details
            ).toContain('minecraft:ender_dragon');
            expect(comparison.javaCases).toHaveLength(
                new Set([...Object.keys(entitiesTable.entities), ...ENTITY_LOSSES.map(({ javaId }) => javaId)]).size
            );
            expect(verdict.unexpected).toEqual([]);
            expect(verdict.stale).toEqual([]);
        });
    },
    { tags: ['real-data'] }
);

describeFamily(
    FAMILIES.integrationClientPackets,
    REAL_STACK_REFERENCES,
    () => {
        it(
            'builds join payloads that preserve Bedrock catalogs and resolve client references',
            { timeout: 180_000 },
            () => {
                const { content } = realStack();
                const comparison = clientPayloadComparison(content);
                reportParityCases(FAMILIES.integrationClientPackets, import.meta.filename, comparison.cases);
                reportParityProgress(FAMILIES.integrationClientPackets, comparison.measurements);
                expect(comparison.gaps).toEqual([]);
            }
        );
    },
    { tags: ['real-data'] }
);
