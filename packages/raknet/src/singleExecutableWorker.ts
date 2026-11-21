import { createRequire } from 'node:module';

import { RaknetErrors } from '@jsprismarine/errors/raknet';

/** The part of `node:sea` that reads an embedded worker. */
export interface SingleExecutable {
    isSea(): boolean;
    getAsset(key: string): ArrayBuffer;
}

/** Loads `node:sea`, which `createRequire` resolves without its imported type. */
const loadSea = (): SingleExecutable => createRequire(process.execPath)('node:sea') as typeof import('node:sea');

/**
 * Reads a worker a Node single executable embedded as an asset, as a URL a worker can load. The
 * executable has no files beside it, so the worker runs from a `data:` URL.
 * @param asset - The asset's key, which `scripts/package-sea.mts` defines.
 * @param sea - The `node:sea` module; a parameter so a test can pass its own.
 * @returns The worker's `data:` URL.
 * @throws {RaknetError} Outside a single executable, where the define is a packaging bug.
 */
export const singleExecutableWorkerUrl = (asset: string, sea: SingleExecutable = loadSea()): string => {
    if (!sea.isSea()) throw new RaknetErrors.EmbeddedWorkerOutsideExecutable();
    return `data:text/javascript;base64,${Buffer.from(sea.getAsset(asset)).toString('base64')}`;
};
