import { describe, expect, it } from 'vitest';

import StringArgumentType from './arguments/StringArgumentType';
import { literal } from './builder/LiteralArgumentBuilder';
import { argument } from './builder/RequiredArgumentBuilder';
import CommandDispatcher from './CommandDispatcher';

describe('ParseResults.copyFor', () => {
    it('executes the same parsed arguments with the new source', () => {
        const dispatcher = new CommandDispatcher<{ readonly name: string }>();
        dispatcher.register(
            literal<{ readonly name: string }>('say').then(
                argument<{ readonly name: string }, string>('message', StringArgumentType.string()).executes(
                    (context) => (context.getSource().name === 'second' ? 2 : 1)
                )
            )
        );
        const parsed = dispatcher.parse('say hello', { name: 'first' });
        const rebound = parsed.copyFor({ name: 'second' });

        expect(dispatcher.execute(parsed)).toEqual([1]);
        expect(dispatcher.execute(rebound)).toEqual([2]);
    });

    it('keeps a failed parse and its exception when copying the source', () => {
        const dispatcher = new CommandDispatcher<{ readonly name: string }>();
        dispatcher.register(
            literal<{ readonly name: string }>('say').then(
                argument<{ readonly name: string }, string>('message', StringArgumentType.string())
            )
        );
        const parsed = dispatcher.parse('say "unterminated', { name: 'first' });
        const rebound = parsed.copyFor({ name: 'second' });

        expect(parsed.getExceptions().size).toBeGreaterThan(0);
        expect(rebound.getExceptions()).toEqual(parsed.getExceptions());
        expect(rebound.getReader().getString()).toBe(parsed.getReader().getString());
    });

    it('keeps redirects that derive a new source', () => {
        type Source = { readonly name: string };
        const dispatcher = new CommandDispatcher<Source>();
        const target = dispatcher.register(
            literal<Source>('target').then(
                literal<Source>('run').executes((context) => (context.getSource().name === 'redirected:second' ? 2 : 1))
            )
        );
        dispatcher.register(
            literal<Source>('redirect').redirect(target, {
                apply: (context) => ({ name: `redirected:${context.getSource().name}` })
            })
        );
        const parsed = dispatcher.parse('redirect run', { name: 'first' });

        expect(dispatcher.execute(parsed.copyFor({ name: 'second' }))).toEqual([2]);
    });
});
