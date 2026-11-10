import { startTestModule, stubService } from '@jsprismarine/kernel/testing';
import { describe, expect, it } from 'vitest';

import type { CommandManager } from '../command/CommandManager';
import type { ServerContent } from '../content/ServerContent';
import { stub } from '../testing/stub.test.helper';
import type ChunkScheduler from '../world/ChunkScheduler';
import type WorldManager from '../world/WorldManager';
import { commandsModule, loadFunctionsModule } from './commands';
import { contentModule } from './content';
import type { PermissionManager } from '../permission/PermissionManager';
import type { Ticker } from './ticker';
import { commandsToken, contentToken, permissionsToken, tickerToken, worldsToken } from './tokens';
import { worldsModule } from './worlds';

const content = { getContent: () => stub<ServerContent>({}) };

describe('modules/content', () => {
    it('builds on start and closes the entity runtimes on stop', async () => {
        const calls: string[] = [];
        const handle = await startTestModule(
            contentModule(content, { build: () => void calls.push('build'), close: () => void calls.push('close') })
        );
        expect(handle.get(contentToken)).toBe(content);
        await handle.stop();

        expect(calls).toEqual(['build', 'close']);
    });
});

describe('modules/worlds', () => {
    const doubles = (enable: () => Promise<void>) => {
        const calls: string[] = [];
        const worlds = stub<WorldManager>({
            enable: async () => {
                calls.push('enable');
                await enable();
            },
            disable: async () => void calls.push('disable')
        });
        const chunks = stub<ChunkScheduler>({ close: async () => void calls.push('close chunks') });
        return { calls, module: worldsModule(worlds, chunks) };
    };
    const stubs = [stubService(contentToken, content), stubService(tickerToken, stub<Ticker>({}))];

    it('drains the chunk deliveries before closing the worlds', async () => {
        const { calls, module } = doubles(async () => {});
        const handle = await startTestModule(module, { stubs });
        await handle.stop();

        expect(calls).toEqual(['enable', 'close chunks', 'disable']);
    });

    it('tears down what a failed start opened, since the kernel will not stop it', async () => {
        const { calls, module } = doubles(async () => {
            throw new Error('preload failed');
        });

        await expect(startTestModule(module, { stubs })).rejects.toThrow('preload failed');
        expect(calls).toEqual(['enable', 'close chunks', 'disable']);
    });
});

describe('modules/commands', () => {
    it('builds the registry on start without waiting for the worlds', async () => {
        const calls: string[] = [];
        const commands = stub<CommandManager>({
            enable: async () => void calls.push('enable'),
            disable: async () => void calls.push('disable')
        });
        const handle = await startTestModule(commandsModule(commands), {
            stubs: [stubService(contentToken, content), stubService(permissionsToken, stub<PermissionManager>({}))]
        });
        expect(handle.get(commandsToken)).toBe(commands);
        await handle.stop();

        expect(calls).toEqual(['enable', 'disable']);
    });

    it('runs the load functions once the commands and the worlds are up', async () => {
        const calls: string[] = [];
        const commands = stub<CommandManager>({
            runLoadFunctions: async () => {
                calls.push('load');
                return 0;
            }
        });
        await startTestModule(loadFunctionsModule(commands), {
            stubs: [stubService(commandsToken, commands), stubService(worldsToken, stub<WorldManager>({}))]
        });

        expect(calls).toEqual(['load']);
    });
});
