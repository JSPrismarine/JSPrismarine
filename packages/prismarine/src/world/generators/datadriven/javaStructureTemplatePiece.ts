/**
 * The piece every template-driven structure is built out of, and the store it reads from.
 *
 * Java's `TemplateStructurePiece` is one `.nbt` file stamped at a position under a rotation and
 * a mirror, with a processor chain over it and its data markers handed to the structure that
 * owns it. Villages, igloos, shipwrecks, ocean ruins, ruined portals, end cities, woodland
 * mansions and nether fossils are all that piece with different files; between them they account
 * for most of the 52 structures.
 *
 * Two caches make it affordable. A template is read, translated to Bedrock states and stripped
 * of its data markers once per world, and transformed once per rotation and mirror. The
 * processors are not cached, because Java runs them per chunk from that chunk's own random, and
 * a piece spanning a chunk border draws two streams; caching the result would quietly remove a
 * difference the game has.
 */
import type { BlockEntityRequest } from '@jsprismarine/features';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import type {
    BedrockStructureTemplate,
    BoundingBox,
    Placement,
    RandomSource,
    StructureProcessor,
    TemplatePosition
} from '@jsprismarine/structures';
import {
    NO_BLOCK,
    applyProcessors,
    createProcessor,
    createProcessorList,
    transformTemplate,
    transformedSize,
    translateJavaTemplate
} from '@jsprismarine/structures';

import type { StructurePiece, StructureWriter } from './javaStructureWorld';
import { boxFromSize } from './javaStructureWorld';
import type { TemplateSource } from './javaTemplatePlacement';

const AIR = 'minecraft:air';
const STRUCTURE_VOID = 'minecraft:structure_void';
const STRUCTURE_BLOCK = 'minecraft:structure_block';
const JIGSAW = 'minecraft:jigsaw';

/**
 * Java's `JigsawReplacementProcessor`, which every pool element is placed through unless the
 * caller asks to keep its jigsaws. It runs before the element's own processors, as Java adds it.
 */
const JIGSAW_REPLACEMENT = createProcessor({ processor_type: 'minecraft:jigsaw_replacement' });

/** A processor chain named by identifier, or written inline as Java 26.3 lets a field be. */
export type ProcessorsReference = string | { readonly processors: readonly unknown[] } | undefined;

/** A `structure_block` in DATA mode: how a legacy structure marks a spot it fills in from code. */
export interface DataMarker {
    /** The `metadata` string the structure block carries, such as `chest` or `bookshelf`. */
    readonly value: string;
    /** The marker's position, in template space for a stored one and in the world for a handled one. */
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A template ready to place: its data markers lifted out and the blocks that remain. */
export interface PreparedTemplate {
    readonly template: BedrockStructureTemplate;
    /** The data markers, in template space, in the order the file lists them. */
    readonly markers: readonly DataMarker[];
    /** Whether any block is a jigsaw, which decides whether the replacement processor is needed. */
    readonly hasJigsaw: boolean;
}

/** Where a template piece reads its template, its transforms and its processors. */
export interface StructureTemplateStore {
    /** The Bedrock-shaped template for an identifier, translated once and kept. */
    template(identifier: string): BedrockStructureTemplate | undefined;
    /** The same template under a rotation and a mirror, prepared once and kept. */
    prepared(identifier: string, placement: Placement): PreparedTemplate | undefined;
    /** The size a template occupies under a rotation, which a layout needs before it places. */
    size(identifier: string, placement: Placement): TemplatePosition | undefined;
    /** The processor chain a reference names, parsed once and kept. */
    processors(reference: ProcessorsReference): readonly StructureProcessor[];
}

const placementKey = (placement: Placement): string => `${placement.rotation ?? 'none'}|${placement.mirror ?? 'none'}`;

/**
 * Builds the store over the raw `.nbt` source.
 *
 * Everything is deferred and memoized: a world that generates no igloo never translates an
 * igloo template, and a world that generates two hundred villages translates each house once.
 */
export const createStructureTemplateStore = (source: TemplateSource): StructureTemplateStore => {
    const translated = new Map<string, BedrockStructureTemplate | undefined>();
    const prepares = new Map<string, PreparedTemplate | undefined>();
    const chains = new Map<string, readonly StructureProcessor[]>();

    const template = (identifier: string): BedrockStructureTemplate | undefined => {
        if (translated.has(identifier)) return translated.get(identifier);

        const raw = source.template(identifier);
        const result = raw === undefined ? undefined : translateJavaTemplate(raw).template;
        translated.set(identifier, result);
        return result;
    };

    return {
        template,
        prepared: (identifier, placement) => {
            const key = `${identifier}|${placementKey(placement)}`;
            if (prepares.has(key)) return prepares.get(key);

            const base = template(identifier);
            const result = base === undefined ? undefined : prepare(transformTemplate(base, placement).template);
            prepares.set(key, result);
            return result;
        },
        size: (identifier, placement) => {
            const base = template(identifier);
            return base === undefined ? undefined : transformedSize(base.size, placement);
        },
        processors: (reference) => {
            if (reference === undefined) return [];

            const document = typeof reference === 'string' ? source.processorList(reference) : reference;
            if (document === undefined) return [];
            if (typeof reference !== 'string') return readChain(document);

            const cached = chains.get(reference);
            if (cached !== undefined) return cached;

            const chain = readChain(document);
            chains.set(reference, chain);
            return chain;
        }
    };
};

/**
 * Lifts the data markers out of a transformed template.
 *
 * Java drops the structure blocks with `BlockIgnoreProcessor.STRUCTURE_BLOCK` before any other
 * processor sees them, and reads their metadata from the unprocessed file, so the two happen
 * here rather than during placement.
 */
const prepare = (template: BedrockStructureTemplate): PreparedTemplate => {
    const markers: DataMarker[] = [];
    let hasJigsaw = false;
    let hasMarker = false;

    for (const block of template.blocks) {
        const state = block.state === NO_BLOCK ? undefined : template.palette[block.state];
        if (state === undefined) continue;
        if (state.name === JIGSAW) hasJigsaw = true;
        if (state.name !== STRUCTURE_BLOCK) continue;

        hasMarker = true;
        const marker = block.nbt === undefined ? undefined : dataMarkerOf(block.nbt);
        if (marker !== undefined) markers.push({ value: marker, x: block.pos[0], y: block.pos[1], z: block.pos[2] });
    }

    if (!hasMarker) return { template, markers, hasJigsaw };

    const blocks = template.blocks.filter(
        (block) => (block.state === NO_BLOCK ? undefined : template.palette[block.state]?.name) !== STRUCTURE_BLOCK
    );
    return { template: { ...template, blocks }, markers, hasJigsaw };
};

/** Reads a chain, treating one this server cannot parse as no processors rather than no piece. */
const readChain = (document: unknown): readonly StructureProcessor[] => {
    try {
        return createProcessorList(document);
    } catch {
        // Extracted game data: an unreadable list places the template unprocessed, which is a
        // visible house rather than a hole in the village.
        return [];
    }
};

/** How a {@link TemplatePiece} is built. */
export interface TemplatePieceOptions {
    readonly store: StructureTemplateStore;
    /** The template identifier, for example `minecraft:igloo/top`. */
    readonly template: string;
    /** Where the transformed template's origin corner lands in the world. */
    readonly position: TemplatePosition;
    readonly placement: Placement;
    readonly processors?: ProcessorsReference;
    /** Whether the template's air overwrites what the world already has. Java's default is yes. */
    readonly overwrite?: boolean;
    /** Whether a jigsaw block stays rather than being replaced by its `final_state`. */
    readonly keepJigsaws?: boolean;
    /**
     * Handles one data marker, which is how a legacy structure fills in a chest, a spawner or a
     * decoration from code. Java's `TemplateStructurePiece.handleDataMarker`.
     */
    readonly onDataMarker?: (marker: DataMarker, writer: StructureWriter, random: RandomSource) => void;
}

/** One structure template stamped at a position. */
export class TemplatePiece implements StructurePiece {
    /** @inheritDoc */
    public readonly boundingBox: BoundingBox;

    public constructor(private readonly options: TemplatePieceOptions) {
        const size = options.store.size(options.template, options.placement) ?? [0, 0, 0];
        this.boundingBox = boxFromSize(
            options.position[0],
            options.position[1],
            options.position[2],
            size[0],
            size[1],
            size[2]
        );
    }

    /** Whether the template this piece names was found at all. */
    public get isPresent(): boolean {
        return this.options.store.template(this.options.template) !== undefined;
    }

    /** @inheritDoc */
    public place(writer: StructureWriter, random: RandomSource): void {
        const prepared = this.options.store.prepared(this.options.template, this.options.placement);
        if (prepared === undefined) return;

        const [originX, originY, originZ] = this.options.position;
        const named = this.options.store.processors(this.options.processors);
        const chain = prepared.hasJigsaw && this.options.keepJigsaws !== true ? [JIGSAW_REPLACEMENT, ...named] : named;

        const processed =
            chain.length === 0
                ? prepared.template
                : applyProcessors(prepared.template, chain, {
                      origin: this.options.position,
                      random,
                      blockAt: ([x, y, z]) => bedrockViewOf(writer.blockAt(x, y, z)),
                      heightAt: (heightmap, x, z) => writer.heightAt(asHeightmap(heightmap), x, z),
                      hasTag: (identifier, tag) => writer.hasTag(identifier, tag),
                      isFullBlock: (state) => state.name !== AIR
                  });

        const overwrite = this.options.overwrite ?? true;

        for (const block of processed.blocks) {
            if (block.state === NO_BLOCK) continue;

            const state = processed.palette[block.state];
            if (state === undefined || state.name === STRUCTURE_VOID) continue;
            if (!overwrite && state.name === AIR) continue;

            const x = originX + block.pos[0];
            const y = originY + block.pos[1];
            const z = originZ + block.pos[2];
            if (!writer.setBedrockBlock(x, y, z, state)) continue;

            const request = block.nbt === undefined ? undefined : blockEntityOf(block.nbt);
            if (request !== undefined) writer.setBlockEntity(x, y, z, request);
        }

        const handler = this.options.onDataMarker;
        if (handler === undefined) return;

        for (const marker of prepared.markers) {
            handler(
                { value: marker.value, x: originX + marker.x, y: originY + marker.y, z: originZ + marker.z },
                writer,
                random
            );
        }
    }
}

/** The Bedrock view of a Java state, for the processors' location and protection tests. */
const bedrockViewOf = (state: { name: string; properties: Readonly<Record<string, string>> }) => {
    const mapped = javaBlockStateToBedrock(state.name, state.properties);
    return mapped.kind === 'unknown' ? undefined : mapped.bedrock;
};

/** Java's `Heightmap.Types` names, which the processor context passes as plain strings. */
const asHeightmap = (name: string) =>
    name === 'WORLD_SURFACE' ||
    name === 'WORLD_SURFACE_WG' ||
    name === 'OCEAN_FLOOR' ||
    name === 'OCEAN_FLOOR_WG' ||
    name === 'MOTION_BLOCKING' ||
    name === 'MOTION_BLOCKING_NO_LEAVES'
        ? name
        : ('WORLD_SURFACE_WG' as const);

/** The `metadata` of a structure block in DATA mode, or undefined for any other mode. */
const dataMarkerOf = (nbt: NBTTagCompound): string | undefined => {
    const mode = stringField(nbt, 'mode');
    if (mode !== undefined && mode !== 'DATA') return undefined;

    const metadata = stringField(nbt, 'metadata');
    return metadata === undefined || metadata === '' ? undefined : metadata;
};

/**
 * The block entity a template block carries, reduced to the fields the chunk can store.
 *
 * A template's NBT holds the whole saved block entity. Only the type, the loot table and a
 * spawner's entity survive into a generated chunk, because an unopened container is what the
 * game saves too.
 */
const blockEntityOf = (nbt: NBTTagCompound): BlockEntityRequest | undefined => {
    const id = stringField(nbt, 'id');
    if (id === undefined) return undefined;

    const lootTable = stringField(nbt, 'LootTable') ?? stringField(nbt, 'loot_table');
    const spawnEntity = spawnerEntityOf(nbt);
    return {
        id,
        ...(lootTable === undefined ? {} : { lootTable }),
        ...(spawnEntity === undefined ? {} : { spawnEntity })
    };
};

/** The entity a saved spawner produces, which both NBT spellings bury a level or two down. */
const spawnerEntityOf = (nbt: NBTTagCompound): string | undefined => {
    const spawnData = compoundField(nbt, 'SpawnData') ?? compoundField(nbt, 'spawn_data');
    const entity = spawnData === undefined ? undefined : compoundField(spawnData, 'entity');
    return entity === undefined ? undefined : stringField(entity, 'id');
};

const stringField = (nbt: NBTTagCompound, key: string): string | undefined => {
    const value = nbt.children.get(key);
    return value instanceof Types.StringVal ? value.getValue() : undefined;
};

const compoundField = (nbt: NBTTagCompound, key: string): NBTTagCompound | undefined => {
    const value = nbt.children.get(key);
    return value instanceof NBTTagCompound ? value : undefined;
};
