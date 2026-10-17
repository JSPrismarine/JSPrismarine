import fs from 'node:fs';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';

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
