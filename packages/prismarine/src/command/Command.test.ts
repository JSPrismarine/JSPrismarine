import { CommandDispatcher } from '@jsprismarine/brigadier';
import { describe, expect, it } from 'vitest';

import { stub } from '../testing/stub.test.helper';
import { asyncCommand, collectAsyncCommands, literal } from './Command';
import type { CommandExecutor } from './CommandExecutor';

const source = stub<CommandExecutor>({ getName: () => 'console' });

describe('asyncCommand', () => {
    it('reports that the command ran and hands its body back to be awaited', async () => {
        const dispatcher = new CommandDispatcher<CommandExecutor>();
        dispatcher.register(literal('stop').executes(asyncCommand(async () => 'Stopping the server...')));

        let results: number[] = [];
        const bodies = collectAsyncCommands(() => {
            results = dispatcher.execute('stop', source);
        });

        expect(results).toEqual([1]);
        await expect(Promise.all(bodies)).resolves.toEqual(['Stopping the server...']);
    });

    it('fails the collection when a body rejects, rather than dropping it', async () => {
        const dispatcher = new CommandDispatcher<CommandExecutor>();
        dispatcher.register(
            literal('boom').executes(
                asyncCommand(async () => {
                    throw new Error('the world refused');
                })
            )
        );

        const bodies = collectAsyncCommands(() => dispatcher.execute('boom', source));

        await expect(Promise.all(bodies)).rejects.toThrow('the world refused');
    });

    it('leaves an enclosing collection its own bodies when one dispatches another command', async () => {
        const inner = new CommandDispatcher<CommandExecutor>();
        inner.register(literal('inner').executes(asyncCommand(async () => 'inner')));

        const outer = new CommandDispatcher<CommandExecutor>();
        outer.register(
            literal('outer').executes(
                // `/execute` dispatches before it awaits anything, so this nested collection
                // runs while the outer one is still open.
                asyncCommand(async () => {
                    const nested = await Promise.all(collectAsyncCommands(() => inner.execute('inner', source)));
                    return `outer after ${nested.join()}`;
                })
            )
        );

        const bodies = collectAsyncCommands(() => outer.execute('outer', source));

        expect(bodies).toHaveLength(1);
        await expect(Promise.all(bodies)).resolves.toEqual(['outer after inner']);
    });
});
