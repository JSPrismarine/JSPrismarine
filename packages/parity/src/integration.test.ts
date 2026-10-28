import { block_definitions } from '@jsprismarine/bedrock-data';
import {
    bedrockBiomeToJava,
    bedrockBlockStateToJava,
    javaBlockStateToBedrock,
    javaEntityTypeToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';
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
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { describeFamily } from './measure.ts';
import { loadRequiredItemList } from './goldens.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import {
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenData';

import type { ServerWorldAdapter } from '@jsprismarine/prismarine/content/world/adapter';

interface RealStack {
    readonly content: ServerContent;
    readonly runtime: EntityRuntime;
}

let builtStack: RealStack | undefined;

/** Builds the fetched Bedrock and Java content with a live data-driven entity runtime attached. */
const realStack = (): RealStack => {
    if (builtStack !== undefined) return builtStack;

    const world = new TestEntityWorld();
    let content: ServerContent | undefined;
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content build finished');
            return content;
        },
        world: world.world,
        host: world.host,
        report: () => undefined
    });
    const adapter: ServerWorldAdapter = {
        ...world.world,
        ticks: world.ticks,
        ...entityContentGroups(runtime)
    };

    content = buildServerContent({ world: singleDimension(adapter) });
    builtStack = { content, runtime };

    return builtStack;
};

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
const clientPayloadComparison = (content: ServerContent): { gaps: string[]; measurements: Record<string, number> } => {
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

    return {
        gaps,
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

describeFamily(FAMILIES.integrationTags, REAL_STACK_REFERENCES, () => {
    it('resolves loaded tag files and carries mapped memberships onto runtime registries', { timeout: 180_000 }, () => {
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
        expect(content.tags.includes('worldgen/biome', 'minecraft:is_overworld', 'minecraft:plains')).toBe(true);
    });

    it('returns every real Bedrock biome tag through the chunk-backed world view', { timeout: 180_000 }, () => {
        const { content } = realStack();

        reportParityProgress(FAMILIES.integrationTags, { bedrockBiomeWorldViews: [...content.biomes.keys()].length });
        expect(biomeWorldViewGaps(content)).toEqual([]);
    });
});

describeFamily(FAMILIES.integrationEntityRuntime, REAL_STACK_REFERENCES, () => {
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

        expect(cube.instance.hasComponent('minecraft:bounciness')).toBe(true);
        expect(cube.body.velocity.x).toBeGreaterThan(0);
        expect(cube.body.velocity.y).toBeGreaterThan(0);
        runtime.remove(cube.id, 'parity runtime check complete');
    });
});

describeFamily(FAMILIES.integrationClientPackets, REAL_STACK_REFERENCES, () => {
    it(
        'builds join payloads that preserve Bedrock catalogs and resolve client references',
        { timeout: 180_000 },
        () => {
            const { content } = realStack();
            const comparison = clientPayloadComparison(content);
            reportParityProgress(FAMILIES.integrationClientPackets, comparison.measurements);
            expect(comparison.gaps).toEqual([]);
        }
    );
});
