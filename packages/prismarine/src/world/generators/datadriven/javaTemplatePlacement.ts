/**
 * Stamping a Java structure template into the region being generated.
 *
 * This is the generator's seam onto `@jsprismarine/structures`. That package reads the `.nbt`,
 * turns the rotation and the mirror on both the positions and the direction-valued states, and
 * runs the `worldgen/processor_list` the feature named. It answers in Bedrock block states,
 * because the transform table is keyed that way and the processor rules compare against it, so a
 * template block is the one thing that reaches the region already translated.
 *
 * Only `template` and `fossil` place one. Java 26.3 ships no `minecraft:template` feature and two
 * `minecraft:fossil` features, so what this covers today is the fossil buried under a desert or a
 * swamp.
 */
import type { BlockState, HeightmapType, TemplateRequest } from '@jsprismarine/features';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { BedrockBlockState, JavaStructureTemplate, Placement, Rotation } from '@jsprismarine/structures';
import {
    NO_BLOCK,
    applyProcessors,
    createLegacyRandom,
    createProcessorList,
    transformTemplate,
    translateJavaTemplate
} from '@jsprismarine/structures';

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
    const processed =
        processors.length === 0
            ? transformed.template
            : applyProcessors(transformed.template, processors, {
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

        const landed = target.write(origin.x + block.pos[0], origin.y + block.pos[1], origin.z + block.pos[2], state);
        placed ||= landed;
    }

    return placed;
};

/** The corner the template's own block zero lands on. */
const originOf = (request: TemplateRequest, target: TemplateTarget): { x: number; y: number; z: number } => {
    const offset = request.offset;
    const x = request.origin.x + (offset?.x ?? 0);
    const z = request.origin.z + (offset?.z ?? 0);
    const base =
        request.projectToHeightmap === undefined ? request.origin.y : target.heightAt(request.projectToHeightmap, x, z);

    return { x, y: base + (offset?.y ?? 0), z };
};

/** Reads the processor list a feature named, treating an unreadable one as no processors. */
const processorsOf = (identifier: string | undefined, source: TemplateSource) => {
    if (identifier === undefined) return [];

    const document = source.processorList(identifier);
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
