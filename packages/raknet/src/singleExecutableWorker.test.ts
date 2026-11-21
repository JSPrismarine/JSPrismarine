import { RaknetErrors } from '@jsprismarine/errors/raknet';
import { describe, expect, it } from 'vitest';

import { singleExecutableWorkerUrl } from './singleExecutableWorker';
import type { SingleExecutable } from './singleExecutableWorker';

/** A single executable whose assets are the given texts. */
const executable = (assets: Record<string, string>, isSea = true): SingleExecutable => ({
    isSea: () => isSea,
    getAsset: (key) => new TextEncoder().encode(assets[key]).buffer
});

// A Node single executable has no worker file beside it, so `package-sea.mts` embeds the socket
// worker as an asset and the worker loads it from a `data:` URL (#3504).
describe('a socket worker embedded in a Node single executable', () => {
    it('loads from the asset as a data URL that holds its source', async () => {
        const source = 'export const answer = 42;';
        const url = singleExecutableWorkerUrl('raknet-socket-worker', executable({ 'raknet-socket-worker': source }));

        const module: unknown = await import(url);
        expect(module).toMatchObject({ answer: 42 });
    });

    it('is refused outside a single executable, where its define is a packaging bug', () => {
        expect(() => singleExecutableWorkerUrl('raknet-socket-worker', executable({}, false))).toThrow(
            RaknetErrors.EmbeddedWorkerOutsideExecutable
        );
    });
});
