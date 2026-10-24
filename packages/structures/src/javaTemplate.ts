import { gunzipSync } from 'node:zlib';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import { compoundAt, compoundListAt, listAt, numberAt, stringAt, stringRecord, tripleAt } from './nbtAccess';
import type { JavaBlockState, JavaPaletteKeySpelling, JavaStructureTemplate, TemplateEntity } from './types';
import { StructureFormatError } from './types';

/**
 * The first `DataVersion` observed to spell palette entries `id`/`properties`
 * instead of `Name`/`Properties`. Java 26.3 writes 5023 and uses the new
 * spelling; the newest file in the pinned Bedrock Dedicated Server zip writes
 * 5009 and uses the old one. The exact release that renamed the keys lies
 * between those two and is not observable from the pinned data, so this
 * constant only picks which spelling to look for first: a file whose entries
 * disagree still reads, through {@link readJavaStructureTemplate}'s probe.
 */
export const PALETTE_KEY_RENAME_DATA_VERSION = 5023;

const GZIP_MAGIC = [0x1f, 0x8b] as const;

/** Whether the bytes start with a gzip member header. */
export const isGzip = (bytes: Uint8Array): boolean => bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];

const toBuffer = (bytes: Uint8Array): Buffer =>
    Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const readPaletteEntry = (entry: NBTTagCompound, spelling: JavaPaletteKeySpelling): JavaBlockState | undefined => {
    const name = stringAt(entry, spelling) ?? stringAt(entry, spelling === 'id' ? 'Name' : 'id');
    if (name === undefined) return undefined;
    const properties = compoundAt(entry, 'properties') ?? compoundAt(entry, 'Properties');
    return { name, properties: stringRecord(properties) };
};

const readPalette = (entries: NBTTagCompound[], spelling: JavaPaletteKeySpelling): JavaBlockState[] => {
    const palette: JavaBlockState[] = [];
    for (const [index, entry] of entries.entries()) {
        const state = readPaletteEntry(entry, spelling);
        if (state === undefined) {
            throw new StructureFormatError(`java structure template: palette entry ${index} has no block identifier`);
        }
        palette.push(state);
    }
    return palette;
};

/** Whichever spelling the file's own palette entries use, independent of `DataVersion`. */
const probeSpelling = (entries: readonly NBTTagCompound[]): JavaPaletteKeySpelling | undefined => {
    for (const entry of entries) {
        if (stringAt(entry, 'id') !== undefined) return 'id';
        if (stringAt(entry, 'Name') !== undefined) return 'Name';
    }
    return undefined;
};

const readEntity = (entry: NBTTagCompound): TemplateEntity => ({
    pos: tripleAt(entry, 'pos', 'java structure template entity'),
    blockPos: tripleAt(entry, 'blockPos', 'java structure template entity'),
    nbt: compoundAt(entry, 'nbt')
});

/**
 * Reads a Java Edition structure template: the gzip-compressed, big-endian
 * NBT that both Mojang's server jar and the Bedrock Dedicated Server zip ship
 * for structure pieces. Uncompressed bytes are accepted too.
 *
 * Palette entries are read under whichever key spelling the file uses.
 * `DataVersion` picks which spelling to try first, since Java 26.3 renamed
 * `Name`/`Properties` to `id`/`properties`, and the other spelling is a
 * fallback, so a file that disagrees with its own version still reads.
 *
 * @throws {StructureFormatError} When the bytes are not a structure template.
 */
export const readJavaStructureTemplate = (bytes: Uint8Array): JavaStructureTemplate => {
    const raw = isGzip(bytes) ? gunzipSync(toBuffer(bytes)) : toBuffer(bytes);

    let root: NBTTagCompound;
    try {
        root = NBTTagCompound.readFromStream(new BinaryStream(raw), ByteOrder.BIG_ENDIAN);
    } catch (error) {
        throw new StructureFormatError(
            `java structure template: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    const size = tripleAt(root, 'size', 'java structure template');
    const dataVersion = numberAt(root, 'DataVersion');

    const variantLists = listAt(root, 'palettes').filter((entry): entry is Set<unknown> => entry instanceof Set);
    const paletteEntryLists =
        variantLists.length > 0
            ? variantLists.map((variant) =>
                  [...variant].filter((entry): entry is NBTTagCompound => entry instanceof NBTTagCompound)
              )
            : [compoundListAt(root, 'palette')];

    const firstEntries = paletteEntryLists[0] ?? [];
    if (firstEntries.length === 0) {
        throw new StructureFormatError('java structure template: no palette');
    }

    const preferred: JavaPaletteKeySpelling =
        dataVersion !== undefined && dataVersion >= PALETTE_KEY_RENAME_DATA_VERSION ? 'id' : 'Name';
    const paletteKeySpelling = probeSpelling(firstEntries) ?? preferred;
    const variants = paletteEntryLists.map((entries) => readPalette(entries, paletteKeySpelling));
    const palette = variants[0] ?? [];

    const blocks = compoundListAt(root, 'blocks').map((entry) => ({
        pos: tripleAt(entry, 'pos', 'java structure template block'),
        state: numberAt(entry, 'state') ?? 0,
        nbt: compoundAt(entry, 'nbt')
    }));

    return {
        size,
        palette,
        ...(variantLists.length > 0 ? { paletteVariants: variants } : {}),
        blocks,
        entities: compoundListAt(root, 'entities').map(readEntity),
        ...(dataVersion === undefined ? {} : { dataVersion }),
        ...(numberAt(root, 'version') === undefined ? {} : { version: numberAt(root, 'version') }),
        ...(stringAt(root, 'author') === undefined ? {} : { author: stringAt(root, 'author') }),
        paletteKeySpelling
    };
};
