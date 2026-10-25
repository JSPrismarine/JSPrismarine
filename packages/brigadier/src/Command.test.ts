import { describe, expect, it } from 'vitest';

import type Command from './Command';
import CommandDispatcher from './CommandDispatcher';
import { literal } from './builder/LiteralArgumentBuilder';

describe('Command', () => {
    it('accepts a synchronous executor that returns a number', () => {
        // Upstream's `Command.run` returns an `int`, and the dispatcher reads the value
        // synchronously, so this assignment is the contract. It is a compile-time assertion
        // first: `tsc` rejects it unless `Command<S>` returns a number.
        const run: Command<object> = (context) => context.getInput().length;

        const dispatcher = new CommandDispatcher<object>();
        dispatcher.register(literal<object>('count').executes(run));

        expect(dispatcher.execute('count', {})).toEqual([5]);
    });

    it('hands the returned number to the result consumer unchanged', () => {
        const results: number[] = [];
        const dispatcher = new CommandDispatcher<object>();
        dispatcher.setConsumer({
            onCommandComplete(_context, _success, result) {
                results.push(result);
            }
        });
        dispatcher.register(literal<object>('fill').executes(() => 7));

        expect(dispatcher.execute('fill', {})).toEqual([7]);
        expect(results).toEqual([7]);
    });
});
