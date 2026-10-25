import { describe, expect, it, vi } from 'vitest';
import type { ConsoleFrontend, TuiFrontendOptions } from './frontends';
import { loadTuiFrontend } from './frontends';
import { Supervisor } from './Supervisor';

type StartConsole = Awaited<ReturnType<NonNullable<TuiFrontendOptions['load']>>>['startConsole'];
type StartConsoleOptions = Parameters<StartConsole>[0];

/** A supervisor that is never started; the frontend only hands it to the console. */
const fakeSupervisor = (): Supervisor =>
    new Supervisor({
        spawnChild: async () => {
            throw new Error('the test never spawns a child');
        },
        exit: () => {}
    });

const setup = (overrides: Partial<TuiFrontendOptions> = {}) => {
    const started: StartConsoleOptions[] = [];
    const close = vi.fn(async () => {});
    const warn = vi.fn<(line: string) => void>();
    const fallback: ConsoleFrontend = { attach: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    const startConsole: StartConsole = async (options) => {
        started.push(options);
        return { close };
    };
    const options: TuiFrontendOptions = {
        load: async () => ({ startConsole }),
        warn,
        fallback: () => fallback,
        serverName: 'Test server',
        version: '1.2.3',
        historyFile: '/tmp/history',
        ...overrides
    };
    return { options, started, close, warn, fallback };
};

describe('loadTuiFrontend', () => {
    it('starts the console with the supervisor and the host details, and closes its handle', async () => {
        const t = setup();
        const supervisor = fakeSupervisor();

        const frontend = await loadTuiFrontend(t.options);
        expect(frontend).toBeDefined();
        await frontend?.attach(supervisor);

        expect(t.started).toHaveLength(1);
        expect(t.started[0]).toMatchObject({
            supervisor,
            serverName: 'Test server',
            version: '1.2.3',
            historyFile: '/tmp/history'
        });
        expect(t.close).not.toHaveBeenCalled();

        await frontend?.close();
        expect(t.close).toHaveBeenCalledTimes(1);
        expect(t.warn).not.toHaveBeenCalled();
    });

    it('returns undefined and names the reason when the console package cannot load', async () => {
        const t = setup({
            load: async () => {
                throw new Error('Cannot find module @opentui/core-linux-x64');
            }
        });

        await expect(loadTuiFrontend(t.options)).resolves.toBeUndefined();

        expect(t.warn).toHaveBeenCalledTimes(1);
        expect(t.warn.mock.calls[0]?.[0]).toContain('Cannot find module @opentui/core-linux-x64');
    });

    it('falls back to the plain frontend when the console cannot start', async () => {
        const t = setup({
            load: async () => ({
                startConsole: async () => {
                    throw new Error('The console could not start its renderer: libopentui.dylib missing');
                }
            })
        });
        const supervisor = fakeSupervisor();

        const frontend = await loadTuiFrontend(t.options);
        await frontend?.attach(supervisor);
        await frontend?.close();

        expect(t.warn).toHaveBeenCalledTimes(1);
        expect(t.warn.mock.calls[0]?.[0]).toContain('libopentui.dylib missing');
        expect(t.fallback.attach).toHaveBeenCalledWith(supervisor);
        expect(t.fallback.close).toHaveBeenCalledTimes(1);
    });

    it('closes without a console when attach never ran', async () => {
        const t = setup();

        const frontend = await loadTuiFrontend(t.options);
        await expect(frontend?.close()).resolves.toBeUndefined();

        expect(t.close).not.toHaveBeenCalled();
        expect(t.fallback.close).not.toHaveBeenCalled();
    });
});
