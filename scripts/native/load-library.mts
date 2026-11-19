/**
 * Loads a build of a native library with `node:ffi` and calls the function that returns its
 * interface version, so a build job proves the operating system loads it and links every symbol.
 * It needs only Node.js, so it runs in the bare container a Linux build was made in.
 *
 *     node scripts/native/load-library.mts <package-id> <library>
 */
import { resolve } from 'node:path';

import { nativePackage } from './packages.mts';

/** The part of `node:ffi` this script calls; Node.js 26 ships no types for it. */
interface NodeFfi {
    dlopen(
        path: string,
        definitions: Record<string, { arguments: readonly string[]; return: string }>
    ): { functions: Record<string, () => unknown>; lib: { close(): void } };
}

const pkg = nativePackage(process.argv[2]);
const library = process.argv[3];
if (library === undefined) throw new Error('Usage: node scripts/native/load-library.mts <package-id> <library>');

// `node:ffi` has no published types; NodeFfi above is the part this script calls.
const ffi = process.getBuiltinModule('node:ffi') as NodeFfi | undefined;
if (ffi === undefined) throw new Error(`node:ffi is not available in Node.js ${process.version}`);
const opened = ffi.dlopen(resolve(library), { [pkg.abiSymbol]: { arguments: [], return: 'int32' } });
const version = opened.functions[pkg.abiSymbol]!();
opened.lib.close();
if (typeof version !== 'number' || version <= 0) throw new Error(`${pkg.abiSymbol} returned ${String(version)}`);
console.log(`${library} loads on ${process.platform}-${process.arch}; ${pkg.abiSymbol}() is ${version}`);
