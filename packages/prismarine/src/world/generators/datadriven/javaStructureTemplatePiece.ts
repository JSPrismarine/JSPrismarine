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
    transformPosition,
    transformTemplate,
    transformedSize,
    translateJavaTemplate
} from '@jsprismarine/structures';

import { javaBlockEntityTypeForBedrockBlock } from '../../../blockentity/bedrockBlockEntityIds';
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
    /**
     * The Java block a saved block entity sat in, for a compound of this template.
     *
     * The translation to Bedrock drops the Java palette, and a banner's color lives there and
     * nowhere else. The saved compounds travel by reference through the translation, the
     * transforms and the processors, so they index this directly.
     *
     * @returns The Java block name, or undefined for a compound this template never saved.
     */
    javaBlockOf(identifier: string, nbt: NBTTagCompound): string | undefined;
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
    const javaBlocks = new Map<string, Map<NBTTagCompound, string>>();

    const template = (identifier: string): BedrockStructureTemplate | undefined => {
        if (translated.has(identifier)) return translated.get(identifier);

        const raw = source.template(identifier);
        if (raw !== undefined) {
            // Indexed before the translation drops the Java palette. `translateJavaTemplate`
            // reads the same `palette` this does, so the names line up with the blocks it keeps.
            const blocks = new Map<NBTTagCompound, string>();
            for (const block of raw.blocks) {
                const name = raw.palette[block.state]?.name;
                if (block.nbt !== undefined && name !== undefined) blocks.set(block.nbt, name);
            }
            javaBlocks.set(identifier, blocks);
        }

        const result = raw === undefined ? undefined : translateJavaTemplate(raw).template;
        translated.set(identifier, result);
        return result;
    };

    return {
        template,
        javaBlockOf: (identifier, nbt) => {
            template(identifier);
            return javaBlocks.get(identifier)?.get(nbt);
        },
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
    /** Java's `getGroundLevelDelta`, which only a jigsaw pool piece carries. */
    readonly groundLevelDelta?: number;
    /** Whether the terrain adaptation leaves this piece alone, as it does a terrain-matching one. */
    readonly ignoresTerrainAdaptation?: boolean;
    /**
     * Handles one data marker, which is how a legacy structure fills in a chest, a spawner or a
     * decoration from code. Java's `TemplateStructurePiece.handleDataMarker`.
     */
    readonly onDataMarker?: (marker: DataMarker, writer: StructureWriter, random: RandomSource) => void;
    /**
     * Runs once the template's blocks and its markers are placed, which is where a structure
     * does the touching up Java does after `placeInWorld` returns.
     */
    readonly onPlaced?: (writer: StructureWriter, random: RandomSource) => void;
}

/**
 * Where a template's own block zero lands when Java turns it about a pivot.
 *
 * Java's `StructureTemplate.transform` turns a block position about
 * `StructurePlaceSettings.rotationPivot`, which a legacy structure sets to a point of the
 * building rather than to a corner, so the turned template spreads around that point and into
 * negative coordinates. `transformTemplate` keeps a turned template inside its own extent
 * instead. The two differ by a translation and nothing else, so the corner is the one the
 * translation puts the template's own zero block on.
 */
export const pivotedCorner = (
    position: TemplatePosition,
    size: TemplatePosition,
    placement: Placement,
    pivot: TemplatePosition
): TemplatePosition => {
    const [pivotX, , pivotZ] = pivot;
    const java: TemplatePosition =
        placement.rotation === 'clockwise_90'
            ? [pivotX + pivotZ, 0, pivotZ - pivotX]
            : placement.rotation === 'clockwise_180'
              ? [pivotX + pivotX, 0, pivotZ + pivotZ]
              : placement.rotation === 'counterclockwise_90'
                ? [pivotX - pivotZ, 0, pivotX + pivotZ]
                : [0, 0, 0];

    const ours = transformPosition(size, [0, 0, 0], placement);
    return [position[0] + java[0] - ours[0], position[1], position[2] + java[2] - ours[2]];
};

/** One structure template stamped at a position. */
export class TemplatePiece implements StructurePiece {
    /** @inheritDoc */
    public readonly boundingBox: BoundingBox;

    /** @inheritDoc */
    public readonly groundLevelDelta: number;

    /** @inheritDoc */
    public readonly ignoresTerrainAdaptation: boolean;

    public constructor(private readonly options: TemplatePieceOptions) {
        this.groundLevelDelta = options.groundLevelDelta ?? 0;
        this.ignoresTerrainAdaptation = options.ignoresTerrainAdaptation ?? false;
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

            const request =
                block.nbt === undefined
                    ? undefined
                    : blockEntityOf(
                          block.nbt,
                          state.name,
                          this.options.store.javaBlockOf(this.options.template, block.nbt)
                      );
            if (request !== undefined) writer.setBlockEntity(x, y, z, request);
        }

        this.placeEntities(writer);

        const handler = this.options.onDataMarker;
        if (handler !== undefined) {
            for (const marker of prepared.markers) {
                handler(
                    { value: marker.value, x: originX + marker.x, y: originY + marker.y, z: originZ + marker.z },
                    writer,
                    random
                );
            }
        }

        this.options.onPlaced?.(writer, random);
    }

    /**
     * Records the entities the template saved, which is Java's `addEntitiesToWorld`.
     *
     * A template's entity list is how a village gets its villagers and its cats, an igloo its
     * two villagers and a bastion its piglins. The whole saved entity is not kept: the chunk
     * carries a type and a place to stand, and the world builds the entity from its own
     * defaults when the chunk is first loaded.
     */
    private placeEntities(writer: StructureWriter): void {
        const prepared = this.options.store.prepared(this.options.template, this.options.placement);
        if (prepared === undefined) return;

        const [originX, originY, originZ] = this.options.position;
        for (const entity of prepared.template.entities) {
            const nbt = entity.nbt;
            if (nbt === undefined) continue;

            const type = stringField(nbt, 'id');
            if (type === undefined) continue;

            writer.spawnEntity(
                type,
                originX + entity.pos[0],
                originY + entity.pos[1],
                originZ + entity.pos[2],
                turnedYaw(savedYaw(nbt), this.options.placement)
            );
        }
    }
}

/** The yaw a saved entity faces, out of the two-float `Rotation` list Java writes. */
const savedYaw = (nbt: NBTTagCompound): number => {
    const rotation = nbt.children.get('Rotation');
    if (!(rotation instanceof Set)) return 0;

    const [yaw] = [...rotation];
    return yaw instanceof Types.FloatVal || yaw instanceof Types.DoubleVal ? yaw.getValue() : 0;
};

/**
 * The yaw an entity ends up facing under a placement, Java's `Entity.mirror` then
 * `Entity.rotate`: the mirror reflects the angle and the rotation adds its quarter turns.
 */
const turnedYaw = (yaw: number, placement: Placement): number => {
    const mirrored = placement.mirror === 'left_right' ? -yaw : placement.mirror === 'front_back' ? 180 - yaw : yaw;
    const quarters =
        placement.rotation === 'clockwise_90'
            ? 90
            : placement.rotation === 'clockwise_180'
              ? 180
              : placement.rotation === 'counterclockwise_90'
                ? 270
                : 0;
    return mirrored + quarters;
};

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
 * The block entity a template block carries.
 *
 * The type, the loot table and a spawner's entity are read out here because the pieces that
 * build a legacy structure from code set the same three fields. The saved compound rides along
 * whole, and `javaGeneratedContent` translates the rest of it when the chunk stores the block
 * entity.
 *
 * The type is the compound's own where the template saved one, and otherwise the block's. A rule
 * processor's `append_loot` writes a compound holding a loot table and nothing else, because Java
 * adds that table to a block entity the block itself already has. Trail ruins are where that
 * reaches a chunk. Without the fallback their suspicious gravel carries no loot table, so
 * brushing it yields nothing.
 *
 * @param bedrockBlock - The Bedrock identifier of the block the compound sits in.
 * @param javaBlock - The Java block it sat in, where the template saved the compound at all.
 */
const blockEntityOf = (
    nbt: NBTTagCompound,
    bedrockBlock: string,
    javaBlock: string | undefined
): BlockEntityRequest | undefined => {
    const id = stringField(nbt, 'id') ?? javaBlockEntityTypeForBedrockBlock(bedrockBlock);
    if (id === undefined) return undefined;

    const lootTable = lootTableOf(nbt);
    const spawnEntity = spawnerEntityOf(nbt);
    return {
        id,
        saved: nbt,
        ...(javaBlock === undefined ? {} : { javaBlock }),
        ...(lootTable === undefined ? {} : { lootTable }),
        ...(spawnEntity === undefined ? {} : { spawnEntity })
    };
};

/**
 * The table a saved container rolls when it is first opened.
 *
 * A chest, a barrel, a decorated pot and a suspicious sand all carry it at the top level under
 * one of the two spellings Java has used.
 *
 * A vault's is not read here, though it keeps one a level down inside `config`. Bedrock's vault
 * reads `config.loot_table` and the content translation writes it there; a vault is not a
 * container, so `fillContainerLoot` never rolls it, and a top-level `LootTable` beside the real
 * one would be a tag nothing reads.
 */
const lootTableOf = (nbt: NBTTagCompound): string | undefined =>
    stringField(nbt, 'LootTable') ?? stringField(nbt, 'loot_table');

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
