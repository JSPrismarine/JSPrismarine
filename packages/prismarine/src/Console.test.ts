import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@jsprismarine/logger';
import Console, { completeCommand } from './Console';
import type { Server } from './';
import type { CommandManager } from './command/CommandManager';
import { stub } from './testing/stub.test.helper';

/** A server double that records what the console dispatches. */
const fakeServer = () => {
    const dispatchCommand = vi.fn(async () => {});
    const server = stub<Server>({
        on: vi.fn(),
        getCommandManager: () => stub<CommandManager>({ dispatchCommand }),
        getLogger: () => stub<Logger>({ setConsole: vi.fn(), info: vi.fn(), error: vi.fn() })
    });
    return { server, dispatchCommand };
};

describe('Console', () => {
    describe('line input', () => {
        it('dispatches each non-empty line as a command from the console', async () => {
            const { server, dispatchCommand } = fakeServer();
            const input = new PassThrough();
            const console = new Console(server, input);

            await console.enable();
            input.write('help\n\n   \r\nstop\n');
            await setImmediate();

            expect(dispatchCommand.mock.calls).toEqual([
                [console, console, 'help'],
                [console, console, 'stop']
            ]);
            await console.disable();
        });

        it('reads nothing when the input is already gone', async () => {
            const { server, dispatchCommand } = fakeServer();
            const input = new PassThrough();
            input.destroy();
            const console = new Console(server, input);

            await expect(console.enable()).resolves.toBeUndefined();
            await setImmediate();

            expect(dispatchCommand).not.toHaveBeenCalled();
            await console.disable();
        });
    });

    describe('completeCommand', () => {
        const names = ['command1', 'command2', 'command3'];

        it('returns every command that starts with the typed text', () => {
            expect(completeCommand(names, 'co')).toEqual([names, 'co']);
            expect(completeCommand(names, 'command1')).toEqual([['command1'], 'command1']);
        });

        it('offers every command when nothing matches', () => {
            expect(completeCommand(names, 'zzz')).toEqual([names, 'zzz']);
        });

        it('drops duplicate names, keeping the last occurrence', () => {
            expect(completeCommand(['a', 'b', 'a'], '')).toEqual([['b', 'a'], '']);
        });
    });
});
