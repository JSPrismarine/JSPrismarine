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
import { NO_BLOCK, StructureFormatError } from './types';

/** The only `format_version` Mojang has published for `.mcstructure` files. */
export const MCSTRUCTURE_FORMAT_VERSION = 1;

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
    if (!(entry instanceof Set)) throw new StructureFormatError('mcstructure: block_indices layer is not a list');

    const indices = numbersOf([...entry]);
    if (indices.length !== entry.size) {
        throw new StructureFormatError('mcstructure: block_indices holds a non-numeric entry');
    }
    return indices;
};

const readPalette = (structure: NBTTagCompound): { palette: BedrockBlockState[]; versions: number[] } => {
    const palettes = compoundAt(structure, 'palette');
    const chosen = palettes === undefined ? undefined : compoundAt(palettes, 'default');
    if (chosen === undefined) throw new StructureFormatError('mcstructure: no default palette');

    const palette: BedrockBlockState[] = [];
    const versions: number[] = [];
    for (const entry of compoundListAt(chosen, 'block_palette')) {
        const name = stringAt(entry, 'name');
        if (name === undefined) throw new StructureFormatError('mcstructure: palette entry has no name');
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
        throw new StructureFormatError(`mcstructure: ${error instanceof Error ? error.message : String(error)}`);
    }

    const formatVersion = numberAt(root, 'format_version');
    if (formatVersion !== undefined && formatVersion !== MCSTRUCTURE_FORMAT_VERSION) {
        throw new StructureFormatError(`mcstructure: unsupported format_version ${formatVersion}`);
    }

    const size = tripleAt(root, 'size', 'mcstructure');
    const structure = compoundAt(root, 'structure');
    if (structure === undefined) throw new StructureFormatError('mcstructure: no structure compound');

    const worldOrigin: TemplatePosition =
        numberListAt(root, 'structure_world_origin').length === 3
            ? tripleAt(root, 'structure_world_origin', 'mcstructure')
            : [0, 0, 0];

    const primary = readLayer(structure, 0);
    if (primary === undefined) throw new StructureFormatError('mcstructure: no block_indices');
    const secondary = readLayer(structure, 1);

    const expected = size[0] * size[1] * size[2];
    if (primary.length !== expected) {
        throw new StructureFormatError(
            `mcstructure: block_indices holds ${primary.length} entries for a ${size.join('x')} template`
        );
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
