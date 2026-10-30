import fs from 'node:fs';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { Generator } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';
import type { FlatGeneratorDefinition, FlatGeneratorSettings, GeneratorDefinition } from '@jsprismarine/worldgen';

import { bedrockBiomeIdOf } from '../../generators/datadriven';

/**
 * `level.dat`, and the `levelname.txt` beside it.
 *
 * The file is an 8 byte header - a little endian int32 storage version, then the payload's length
 * - followed by a single NBT compound in little endian, fixed width form. Version 10 is what
 * every modern release writes.
 *
 * `levelname.txt` is the same name as the compound's `LevelName` field, in plain text. The game's
 * world list reads the text file, so a world whose two disagree shows one name in the menu and
 * another once it is open.
 */

export const LEVEL_DAT_FILE_NAME = 'level.dat';
export const LEVEL_DAT_BACKUP_FILE_NAME = 'level.dat_old';
export const LEVEL_NAME_FILE_NAME = 'levelname.txt';

export const LEVEL_DAT_STORAGE_VERSION = 10;

const HEADER_BYTES = 8;

export interface LevelDat {
    storageVersion: number;
    root: NBTTagCompound;
}

export const decodeLevelDat = (data: Buffer): LevelDat => {
    if (data.byteLength < HEADER_BYTES) {
        throw new Error(`level.dat is ${data.byteLength} bytes, the header alone is ${HEADER_BYTES}`);
    }

    const storageVersion = data.readInt32LE(0);
    const declared = data.readInt32LE(4);
    const payload = data.subarray(HEADER_BYTES);

    if (declared !== payload.byteLength) {
        throw new Error(`level.dat declares ${declared} bytes of payload but carries ${payload.byteLength}`);
    }

    const reader = new NBTReader(new BinaryStream(payload), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);

    return { storageVersion, root: reader.parse() };
};

export const encodeLevelDat = ({ storageVersion, root }: LevelDat): Buffer => {
    const payload = new BinaryStream();
    const writer = new NBTWriter(payload, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(root);

    const body = payload.getBuffer();
    const header = Buffer.allocUnsafe(HEADER_BYTES);
    header.writeInt32LE(storageVersion, 0);
    header.writeInt32LE(body.byteLength, 4);

    return Buffer.concat([header, body]);
};

export const readLevelDat = (worldPath: string): LevelDat | null => {
    const file = path.join(worldPath, LEVEL_DAT_FILE_NAME);
    if (!fs.existsSync(file)) return null;

    return decodeLevelDat(fs.readFileSync(file));
};

/**
 * Writes `level.dat`, keeping the previous one as `level.dat_old`.
 *
 * The backup is not ceremony: it is what the game itself falls back to, so a world whose
 * `level.dat` was truncated by a crash still opens.
 */
export const writeLevelDat = (worldPath: string, level: LevelDat): void => {
    const file = path.join(worldPath, LEVEL_DAT_FILE_NAME);

    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(worldPath, LEVEL_DAT_BACKUP_FILE_NAME));
    }

    fs.writeFileSync(file, encodeLevelDat(level));
};

export const readLevelName = (worldPath: string): string | null => {
    const file = path.join(worldPath, LEVEL_NAME_FILE_NAME);
    if (!fs.existsSync(file)) return null;

    return fs.readFileSync(file, 'utf8').trim();
};

export const writeLevelName = (worldPath: string, name: string): void => {
    fs.writeFileSync(path.join(worldPath, LEVEL_NAME_FILE_NAME), name, 'utf8');
};

/**
 * The `Generator` int `level.dat` carries for the Overworld's generator kind.
 *
 * Bedrock has one generator per save, so the Overworld stem decides: 2 for `minecraft:flat`, 5
 * for `jsprismarine:void`, and 1 (Infinite) for a noise generator or no stem at all. The Nether
 * and the End have no field; the game generates them its own way whatever this says.
 */
export const levelDatGeneratorOf = (overworld: GeneratorDefinition | undefined): Generator => {
    switch (overworld?.type) {
        case 'minecraft:flat':
            return Generator.FLAT;
        case 'jsprismarine:void':
            return Generator.VOID;
        default:
            return Generator.OVERWORLD;
    }
};

/**
 * Whether a stem's generator is `minecraft:flat`, narrowing it so its layers can be read. The
 * union carries an unknown-kind variant typed `type: string`, which is why a plain comparison
 * on `type` does not narrow by itself.
 */
export const isFlatGenerator = (generator: GeneratorDefinition): generator is FlatGeneratorDefinition =>
    generator.type === 'minecraft:flat';

/** The layers of the game's own `ClassicFlat` preset, which is what a fresh flat world gets. */
const CLASSIC_FLAT_LAYERS: readonly { block: string; height: number }[] = [
    { block: 'minecraft:bedrock', height: 1 },
    { block: 'minecraft:dirt', height: 2 },
    { block: 'minecraft:grass_block', height: 1 }
];

/**
 * The `FlatWorldLayers` JSON string for a flat Overworld.
 *
 * The shape is the one the game writes: a Bedrock numeric `biome_id`, `block_layers` bottom up
 * as `block_name` and `count`, `encoding_version` 6 and `world_version` `version.post_1_18`.
 * Block and biome ids go through the Java to Bedrock mapping, so a Java `minecraft:grass_block`
 * layer lands under the name the game spells. `preset_id` names the game's `ClassicFlat` when
 * the layers are its three over plains and `Custom` otherwise; the game reads the layers either
 * way, the id only labels the preset picker.
 */
export const flatWorldLayersOf = (settings: FlatGeneratorSettings): string => {
    const isClassic =
        settings.biome === 'minecraft:plains' &&
        settings.layers.length === CLASSIC_FLAT_LAYERS.length &&
        settings.layers.every(
            (layer, index) =>
                layer.block === CLASSIC_FLAT_LAYERS[index]?.block && layer.height === CLASSIC_FLAT_LAYERS[index]?.height
        );

    return JSON.stringify({
        biome_id: bedrockBiomeIdOf(settings.biome),
        block_layers: settings.layers.map((layer) => ({
            block_name: bedrockBlockNameOf(layer.block),
            count: layer.height
        })),
        encoding_version: 6,
        preset_id: isClassic ? 'ClassicFlat' : 'Custom',
        structure_options: null,
        world_version: 'version.post_1_18'
    });
};

/** The Bedrock name of a Java block, or the Java id itself for one the mapping does not know. */
const bedrockBlockNameOf = (javaBlock: string): string => {
    const mapped = javaBlockStateToBedrock(javaBlock);
    return mapped.kind === 'unknown' ? javaBlock : mapped.bedrock.name;
};
