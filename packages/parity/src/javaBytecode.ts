import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { readServerJar } from './javaDatapack.ts';
import { FETCH_CACHE, REFERENCES } from './references.ts';

/** The pinned jar's entries, inflated once per process for the classes the disk cache misses. */
let pinnedJar: { readonly path: string; readonly entries: Map<string, Uint8Array> } | undefined;

/**
 * The bytes of one class in the pinned Java server jar, or undefined when the jar holds no such class.
 *
 * Reading the jar inflates every entry, so each class read is kept in the fetch cache beside the
 * jar and later calls read that copy.
 *
 * @param className - The class's binary name, such as `net/minecraft/world/entity/animal/cow/Cow`.
 * @throws {Error} When the jar is not in the fetch cache.
 */
export const pinnedJavaClassBytes = (className: string): Uint8Array | undefined => {
    const jarPath = REFERENCES.javaServerJar.locate();
    if (jarPath === undefined) throw new Error('the pinned Java server jar is not in the fetch cache');

    const version = basename(dirname(jarPath)) || 'unknown';
    const entry = `${className}.class`;
    const cached = join(FETCH_CACHE, 'java-classes', version, ...entry.split('/'));
    if (existsSync(cached)) return readFileSync(cached);
    if (pinnedJar?.path !== jarPath) pinnedJar = { path: jarPath, entries: readServerJar(jarPath) };
    const bytes = pinnedJar.entries.get(entry);
    if (bytes === undefined) return undefined;
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, bytes);
    return bytes;
};
