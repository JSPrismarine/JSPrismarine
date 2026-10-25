/**
 * Stamping a Java structure template into the region being generated.
 *
 * This is the generator's seam onto `@jsprismarine/structures`. That package reads the `.nbt`,
 * turns the rotation and the mirror on both the positions and the direction-valued states, and
 * runs the `worldgen/processor_list` the feature named. It answers in Bedrock block states,
 * because the transform table is keyed that way and the processor rules compare against it, so a
 * template block is the one thing that reaches the region already translated.
 *
 * Only `template` and `fossil` place one. Java 26.3 writes nine of them: two `minecraft:fossil`
 * features, and seven `minecraft:template` features nested inside the desert well and the sulfur
 * spring, which is why neither shows up as a feature document of that type.
 */
import type {
    BlockEntityRequest,
    BlockState,
    HeightmapType,
    TemplateProcessors,
    TemplateRequest
} from '@jsprismarine/features';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound } from '@jsprismarine/nbt';
import type {
    BedrockBlockState,
    BedrockStructureTemplate,
    JavaStructureTemplate,
    Placement,
    Rotation
} from '@jsprismarine/structures';
import {
    NO_BLOCK,
    applyProcessors,
    createLegacyRandom,
    createProcessorList,
    transformTemplate,
    translateJavaTemplate
} from '@jsprismarine/structures';

import { blockEntityOf } from './javaStructureTemplatePiece';

/** Where the templates and their processor lists are read from. */
export interface TemplateSource {
    /**
     * The template for an identifier such as `minecraft:fossil/spine_1`.
     *
     * @returns The template, or undefined when this server does not carry it, which makes the
     *   feature place nothing rather than place something wrong.
     */
    template(identifier: string): JavaStructureTemplate | undefined;
    /** The `worldgen/processor_list` document for an identifier, parsed no further than JSON. */
    processorList(identifier: string): unknown;
}

/** What placing a template needs from the region it lands in. */
export interface TemplateTarget {
    /** The Java state already in the region at a world position. */
    blockAt(x: number, y: number, z: number): BlockState;
    /** The surface height of a world column, for a request that projects to a heightmap. */
    heightAt(heightmap: HeightmapType, x: number, z: number): number;
    /** Whether a block identifier is in a Java block tag. */
    hasTag(identifier: string, tag: string): boolean;
    /** Writes one resolved block. Returns whether it landed inside the region. */
    write(x: number, y: number, z: number, state: BedrockBlockState): boolean;
    /**
     * Records the block entity a template block carries, on a block that landed.
     *
     * Optional, because a target that cannot store one still gets the block. What it costs is
     * the block's contents: a desert well's suspicious sand with nothing to brush out of it.
     */
    setBlockEntity?(x: number, y: number, z: number, request: BlockEntityRequest): void;
}

/** Java's quarter turns, in the order `rotation` numbers them. */
const ROTATIONS: readonly Rotation[] = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'];

/** The template block that means "leave whatever the world has here". */
const STRUCTURE_VOID = 'minecraft:structure_void';

const AIR = 'minecraft:air';

/** The Bedrock state a Java one maps to, or undefined when the mapping has no row for it. */
export const bedrockStateOf = (state: BlockState): BedrockBlockState | undefined => {
    const mapped = javaBlockStateToBedrock(state.name, state.properties);
    return mapped.kind === 'unknown' ? undefined : mapped.bedrock;
};

/**
 * Places one template.
 *
 * @param seed - The world seed, which together with the origin seeds the processors' draws. Java
 *   passes the feature's own random, which does not reach this far; deriving the stream from the
 *   position instead keeps a fossil's rot the same every time the chunk is generated.
 * @returns Whether any block landed, which is what the feature reports upward.
 */
export const placeJavaTemplate = (
    request: TemplateRequest,
    source: TemplateSource,
    target: TemplateTarget,
    seed: bigint
): boolean => {
    const template = source.template(request.template);
    if (template === undefined) return false;

    const placement: Placement = {
        rotation: ROTATIONS[((request.rotation % 4) + 4) % 4] ?? 'none',
        mirror: request.mirror
    };

    const transformed = transformTemplate(translateJavaTemplate(template).template, placement);
    const origin = originOf(request, target);
    const processors = processorsOf(request.processors, source);
    const javaBlocks = javaBlocksOf(template);
    const processed =
        processors.length === 0
            ? transformed.template
            : applyProcessors(ownCompounds(transformed.template, javaBlocks), processors, {
                  origin: [origin.x, origin.y, origin.z],
                  random: createLegacyRandom(seedOf(seed, origin)),
                  blockAt: ([x, y, z]) => bedrockStateOf(target.blockAt(x, y, z)),
                  heightAt: (heightmap, x, z) => target.heightAt(heightmapOf(heightmap), x, z),
                  // The protected lists name Java blocks and the processor asks about the Bedrock
                  // identifier it holds. The two spell every block those lists name the same way.
                  hasTag: (identifier, tag) => target.hasTag(identifier, tag),
                  isFullBlock: (state) => state.name !== AIR
              });

    const overwrite = request.overwrite ?? true;
    let placed = false;
    for (const block of processed.blocks) {
        if (block.state === NO_BLOCK) continue;

        const state = processed.palette[block.state];
        if (state === undefined || state.name === STRUCTURE_VOID) continue;
        if (!overwrite && state.name === AIR) continue;

        const x = origin.x + block.pos[0];
        const y = origin.y + block.pos[1];
        const z = origin.z + block.pos[2];
        const landed = target.write(x, y, z, state);
        placed ||= landed;
        if (!landed || block.nbt === undefined) continue;

        const blockEntity = blockEntityOf(block.nbt, state.name, javaBlocks.get(block.nbt));
        if (blockEntity !== undefined) target.setBlockEntity?.(x, y, z, blockEntity);
    }

    return placed;
};

/**
 * The Java block each saved compound sat in, keyed by the compound itself.
 *
 * The translation to Bedrock drops the Java palette, and a banner's color lives there and
 * nowhere else. The saved compounds travel by reference through the translation and the
 * transforms, so indexing them before either runs is what carries the name across.
 */
const javaBlocksOf = (template: JavaStructureTemplate): Map<NBTTagCompound, string> => {
    const blocks = new Map<NBTTagCompound, string>();
    for (const block of template.blocks) {
        const name = template.palette[block.state]?.name;
        if (block.nbt !== undefined && name !== undefined) blocks.set(block.nbt, name);
    }

    return blocks;
};

/**
 * The same template with its saved block entities copied, for a chain that is about to run.
 *
 * A rule's `append_loot` adds the loot table to the compound it is handed, and that compound is
 * the one the source decoded and kept for the life of the world. Copying first is what keeps one
 * placement's table out of every later placement of the same template. Each copy is indexed
 * under the Java block the original sat in, because the block entity request reads a banner's
 * color from it.
 *
 * Compounds and lists are copied and the values inside them are shared, which is the line a
 * block entity modifier writes at: it returns the compound the block carries and adds to it.
 */
const ownCompounds = (
    template: BedrockStructureTemplate,
    javaBlocks: Map<NBTTagCompound, string>
): BedrockStructureTemplate => ({
    ...template,
    blocks: template.blocks.map((block) => {
        if (block.nbt === undefined) return block;

        const nbt = copyCompound(block.nbt);
        const javaBlock = javaBlocks.get(block.nbt);
        if (javaBlock !== undefined) javaBlocks.set(nbt, javaBlock);
        return { ...block, nbt };
    })
});

const copyCompound = (nbt: NBTTagCompound): NBTTagCompound => {
    const copy = new NBTTagCompound(nbt.getName());
    for (const [key, value] of nbt.children) copy.addValue(key, copyTag(value));

    return copy;
};

const copyTag = (value: unknown): unknown =>
    value instanceof NBTTagCompound
        ? copyCompound(value)
        : value instanceof Set
          ? new Set([...value].map(copyTag))
          : value;

/** The corner the template's own block zero lands on. */
const originOf = (request: TemplateRequest, target: TemplateTarget): { x: number; y: number; z: number } => {
    const offset = request.offset;
    const x = request.origin.x + (offset?.x ?? 0);
    const z = request.origin.z + (offset?.z ?? 0);
    const base =
        request.projectToHeightmap === undefined ? request.origin.y : target.heightAt(request.projectToHeightmap, x, z);

    return { x, y: base + (offset?.y ?? 0), z };
};

/**
 * Reads the chain a feature carries, treating an unreadable one as no processors.
 *
 * A reference is looked up in the `worldgen/processor_list` registry and an inline list is
 * already the document, which is the form the desert well's archaeology rule arrives in.
 */
const processorsOf = (reference: TemplateProcessors | undefined, source: TemplateSource) => {
    if (reference === undefined) return [];

    const document = typeof reference === 'string' ? source.processorList(reference) : reference;
    if (document === undefined) return [];

    try {
        return createProcessorList(document);
    } catch {
        // Extracted game data: a list this server cannot read places the template unprocessed,
        // which is a visible fossil rather than no fossil at all.
        return [];
    }
};

/** Java's `Heightmap.Types` names, which the processor context passes as plain strings. */
const heightmapOf = (name: string): HeightmapType =>
    name === 'WORLD_SURFACE' ||
    name === 'WORLD_SURFACE_WG' ||
    name === 'OCEAN_FLOOR' ||
    name === 'OCEAN_FLOOR_WG' ||
    name === 'MOTION_BLOCKING' ||
    name === 'MOTION_BLOCKING_NO_LEAVES'
        ? name
        : 'WORLD_SURFACE_WG';

/** A stream that depends on the world and on where the template landed, and on nothing else. */
const seedOf = (seed: bigint, origin: { x: number; y: number; z: number }): bigint =>
    BigInt.asIntN(64, seed + BigInt(origin.x) * 341873128712n + BigInt(origin.y) + BigInt(origin.z) * 132897987541n);
