import * as raknet from '@jsprismarine/raknet';
import { afterAll, beforeAll, vi } from 'vitest';

/**
 * Stands an inert listener in for `RakNetListener` while a file's tests run, so a server they
 * boot binds no socket.
 *
 * A spy on the package export rather than `vi.mock`: test files share their worker, and a
 * module mock outlives the file that declared it, so every later file in the worker got the
 * stand-in too and the real-server suites had to reload the whole module graph to undo it. The
 * spy is installed before the file's tests and restored after them, so nothing is left behind.
 */
export const stubRakNetListener = (): void => {
    beforeAll(() => {
        vi.spyOn(raknet, 'RakNetListener').mockImplementation(function (this: raknet.RakNetListener) {
            Object.assign(this, {
                start: vi.fn(),
                // The server holds its first tick until each transport listens, so the stand-in
                // says it does, on a later turn as a socket would.
                on: vi.fn((event: string, listener: () => void) => {
                    if (event === 'listening') queueMicrotask(listener);
                }),
                kill: vi.fn()
            });
        });
    });

    afterAll(() => {
        vi.mocked(raknet.RakNetListener).mockRestore();
    });
};
