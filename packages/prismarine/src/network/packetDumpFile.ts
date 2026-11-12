import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Makes sure `directory` is a private directory of this process's user, creating it when it is
 * missing. The default dump directory sits in the shared temporary directory under a fixed name,
 * so another local user could make it first, or put a symbolic link in its place, and have the
 * dumps written wherever they chose.
 *
 * @param directory - Where dumps go.
 * @throws Error when the path is a symbolic link or not a directory, or, where the platform has
 * user ids, when another user owns it or other users can write to it.
 */
export const ensurePrivateDirectory = (directory: string): void => {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

    // `lstat`, not `stat`: a symbolic link is refused rather than followed.
    const stats = fs.lstatSync(directory);
    if (!stats.isDirectory()) throw new Error(`${directory} is not a directory, or is a symbolic link`);

    const uid = process.getuid?.();
    if (uid === undefined) return;
    if (stats.uid !== uid) throw new Error(`${directory} belongs to another user`);
    if ((stats.mode & 0o022) !== 0) throw new Error(`${directory} can be written by other users`);
};

/**
 * Writes one dump into a private directory, as a new file only this user can read.
 *
 * The name ends in random hex, and the file is opened with `wx`, which fails on any existing
 * entry, a symbolic link included, rather than following it and overwriting what it points to.
 *
 * @param directory - The directory, which {@link ensurePrivateDirectory} checks first.
 * @param stem - The start of the file name, before the random part and `.bin`.
 * @param bytes - What to write.
 * @returns The path written.
 * @throws Error when the directory is not private or the file cannot be created.
 */
export const writePacketDump = (directory: string, stem: string, bytes: Uint8Array): string => {
    ensurePrivateDirectory(directory);

    const file = path.join(directory, `${stem}-${randomBytes(4).toString('hex')}.bin`);
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    return file;
};
