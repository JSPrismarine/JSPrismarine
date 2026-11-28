import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import {
    compoundAt,
    compoundListAt,
    listAt,
    numberAt,
    numberListAt,
    numbersOf,
    stateRecord,
    stringAt,
    tripleAt
} from './nbtAccess';
import type {
    BedrockBlockState,
    BedrockStructureTemplate,
    BedrockTemplateBlock,
    TemplateEntity,
    TemplatePosition
} from './types';
import { NO_BLOCK } from './types';
import { StructuresErrors } from '@jsprismarine/errors/structures';

/**
 * The `.mcstructure` `format_version`s this reader takes. Version 2 keeps one block layer, as a
 * TAG_Int_Array rather than a list of ints, with the same order and the same -1 for a position
 * that changes nothing; the `pack-structures` parity scenario read one on BDS 1.26.60.6.
 */
export const MCSTRUCTURE_FORMAT_VERSIONS: readonly number[] = [1, 2];

/**
 * The index a `.mcstructure` uses for a block, which walks x slowest and z
 * fastest. Measured against the sulfur spring templates, whose saved block
 * entity coordinates pin the order.
 */
export const mcStructureIndex = (size: TemplatePosition, x: number, y: number, z: number): number =>
    (x * size[1] + y) * size[2] + z;

/** The template position a `.mcstructure` block index refers to. */
export const mcStructurePosition = (size: TemplatePosition, index: number): TemplatePosition => [
    Math.floor(index / (size[1] * size[2])),
    Math.floor(index / size[2]) % size[1],
    index % size[2]
];

const readLayer = (structure: NBTTagCompound, layer: number): number[] | undefined => {
    const entry = listAt(structure, 'block_indices')[layer];
    if (entry === undefined) return undefined;
    // Version 1 writes a layer as a list of ints, which read as value wrappers, and version 2 as an
    // int array, which reads as plain numbers.
    let indices: number[];
    let length: number;
    if (entry instanceof Set) {
        indices = numbersOf([...entry]);
        length = entry.size;
    } else if (Array.isArray(entry)) {
        indices = entry.filter((value): value is number => typeof value === 'number');
        length = entry.length;
    } else {
        throw new StructuresErrors.McstructureBlockLayerNotList();
    }
    if (indices.length !== length) {
        throw new StructuresErrors.McstructureBlockIndexNotNumeric();
    }
    return indices;
};

const readPalette = (structure: NBTTagCompound): { palette: BedrockBlockState[]; versions: number[] } => {
    const palettes = compoundAt(structure, 'palette');
    const chosen = palettes === undefined ? undefined : compoundAt(palettes, 'default');
    if (chosen === undefined) throw new StructuresErrors.McstructureNoDefaultPalette();

    const palette: BedrockBlockState[] = [];
    const versions: number[] = [];
    for (const entry of compoundListAt(chosen, 'block_palette')) {
        const name = stringAt(entry, 'name');
        if (name === undefined) throw new StructuresErrors.McstructurePaletteEntryHasNoName();
        palette.push({ name, states: stateRecord(compoundAt(entry, 'states')) });
        versions.push(numberAt(entry, 'version') ?? 0);
    }
    return { palette, versions };
};

/** The per-index block entity and tick queue records, keyed by the index's decimal string. */
const readPositionData = (structure: NBTTagCompound): Map<number, { nbt?: NBTTagCompound; tickDelays?: number[] }> => {
    const data = new Map<number, { nbt?: NBTTagCompound; tickDelays?: number[] }>();
    const palettes = compoundAt(structure, 'palette');
    const chosen = palettes === undefined ? undefined : compoundAt(palettes, 'default');
    const positions = chosen === undefined ? undefined : compoundAt(chosen, 'block_position_data');
    if (positions === undefined) return data;

    for (const [key, value] of positions.entries()) {
        const index = Number.parseInt(key, 10);
        if (!Number.isInteger(index) || !(value instanceof NBTTagCompound)) continue;
        const tickDelays = compoundListAt(value, 'tick_queue_data').map((tick) => numberAt(tick, 'tick_delay') ?? 0);
        data.set(index, {
            ...(compoundAt(value, 'block_entity_data') === undefined
                ? {}
                : { nbt: compoundAt(value, 'block_entity_data') }),
            ...(tickDelays.length === 0 ? {} : { tickDelays })
        });
    }
    return data;
};

const readEntities = (structure: NBTTagCompound, origin: TemplatePosition): TemplateEntity[] =>
    compoundListAt(structure, 'entities').map((entity) => {
        const [x = 0, y = 0, z = 0] = numberListAt(entity, 'Pos');
        // `.mcstructure` saves entity positions in world coordinates; the
        // template-relative position is the offset from the saved origin.
        return { pos: [x - origin[0], y - origin[1], z - origin[2]] as const, nbt: entity };
    });

/**
 * Reads a Bedrock `.mcstructure` template: uncompressed little-endian NBT
 * with Bedrock block states, two block storage layers and world-coordinate
 * entity positions. Fifteen of these ship in the Bedrock Dedicated Server
 * zip, where everything else is the Java format.
 *
 * Positions where both layers hold no block are left out of
 * {@link BedrockStructureTemplate.blocks}, since the format uses them for
 * "change nothing here".
 *
 * @throws {StructureFormatError} When the bytes are not a `.mcstructure`.
 */
export const readMcStructure = (bytes: Uint8Array): BedrockStructureTemplate => {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let root: NBTTagCompound;
    try {
        root = NBTTagCompound.readFromStream(new BinaryStream(buffer), ByteOrder.LITTLE_ENDIAN);
    } catch (error) {
        throw new StructuresErrors.McstructureUnreadable({
            value: error instanceof Error ? error.message : String(error)
        });
    }

    const formatVersion = numberAt(root, 'format_version');
    if (formatVersion !== undefined && !MCSTRUCTURE_FORMAT_VERSIONS.includes(formatVersion)) {
        throw new StructuresErrors.McstructureUnsupportedFormatVersion({ formatVersion });
    }

    const size = tripleAt(root, 'size', 'mcstructure');
    const structure = compoundAt(root, 'structure');
    if (structure === undefined) throw new StructuresErrors.McstructureNoStructureCompound();

    const worldOrigin: TemplatePosition =
        numberListAt(root, 'structure_world_origin').length === 3
            ? tripleAt(root, 'structure_world_origin', 'mcstructure')
            : [0, 0, 0];

    const primary = readLayer(structure, 0);
    if (primary === undefined) throw new StructuresErrors.McstructureNoBlockIndices();
    const secondary = readLayer(structure, 1);

    const expected = size[0] * size[1] * size[2];
    if (primary.length !== expected) {
        throw new StructuresErrors.McstructureBlockCountMismatch({
            primaryCount: primary.length,
            size: size.join('x')
        });
    }

    const { palette, versions } = readPalette(structure);
    const positionData = readPositionData(structure);

    const blocks: BedrockTemplateBlock[] = [];
    for (let index = 0; index < primary.length; index++) {
        const state = primary[index] ?? NO_BLOCK;
        const extraState = secondary?.[index] ?? NO_BLOCK;
        if (state === NO_BLOCK && extraState === NO_BLOCK) continue;
        blocks.push({
            pos: mcStructurePosition(size, index),
            state,
            extraState,
            ...(positionData.get(index) ?? {})
        });
    }

    return {
        size,
        palette,
        paletteVersions: versions,
        blocks,
        entities: readEntities(structure, worldOrigin),
        worldOrigin
    };
};
