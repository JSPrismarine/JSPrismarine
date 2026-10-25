import { assert, beforeEach, describe, expect, it } from 'vitest';
import type Command from './Command';
import CommandDispatcher from './CommandDispatcher';
import type RedirectModifier from './RedirectModifier';
import StringReader from './StringReader';
import type ArgumentType from './arguments/ArgumentType';
import { DefaultType } from './arguments/ArgumentType';
import { literal as literalOf } from './builder/LiteralArgumentBuilder';
import { argument as argumentOf } from './builder/RequiredArgumentBuilder';
import type CommandContext from './context/CommandContext';
import CommandSyntaxException from './exceptions/CommandSyntaxException';

const { integer } = DefaultType;

const literal = literalOf<Object>;
const argument = <T>(name: string, type: ArgumentType<T>) => argumentOf<Object, T>(name, type);

interface MockedCommand<S> extends Command<S> {
    execHistory: CommandContext<S>[];
    when(arg: unknown, returnValue: number): void;
    verify(arg: 'anything' | CommandContext<S>): number;
}

const createMockedCommand = (): MockedCommand<Object> => {
    const execHistory: CommandContext<Object>[] = [];
    const execCount = new Map<CommandContext<Object>, number>();
    const whenArg = new Map<unknown, number>();

    const run = async (arg: CommandContext<Object>): Promise<number> => {
        if (!execCount.has(arg)) execHistory.push(arg);
        execCount.set(arg, (execCount.get(arg) ?? 0) + 1);

        return whenArg.get(arg) ?? whenArg.get('anything') ?? 69;
    };
    const verify = (arg: 'anything' | CommandContext<Object>): number => {
        if (arg === 'anything') return [...execCount.values()].reduce((sum, count) => sum + count, 0);

        return execCount.get(arg) ?? 0;
    };
    const when = (arg: unknown, returnValue: number): void => {
        whenArg.set(arg, returnValue);
    };

    return Object.assign(run, { verify, when, execHistory });
};

describe('CommandDispatcherTest', () => {
    let command: MockedCommand<Object>;
    let subject: CommandDispatcher<Object>;
    const source: Object = {};

    beforeEach(() => {
        subject = new CommandDispatcher();

        command = createMockedCommand();
        command.when('anything', 42);
    });

    function inputWithOffset(input: string, offset: number): StringReader {
        const result = new StringReader(input);
        result.setCursor(offset);
        return result;
    }

    it('testCreateAndExecuteCommand', async () => {
        subject.register(literal('foo').executes(command));
        assert.deepEqual(await Promise.all(subject.execute('foo', source)), [42]);
        assert.equal(command.verify('anything') === 1, true);
    });

    it('testCreateAndExecuteOffsetCommand', async () => {
        subject.register(literal('foo').executes(command));
        assert.deepEqual(await Promise.all(subject.execute(inputWithOffset('/foo', 1), source)), [42]);
        assert.equal(command.verify('anything') === 1, true);
    });

    it('testCreateAndMergeCommands', async () => {
        subject.register(literal('base').then(literal('foo').executes(command)));
        subject.register(literal('base').then(literal('bar').executes(command)));

        assert.deepEqual(await Promise.all(subject.execute('base foo', source)), [42]);
        assert.deepEqual(await Promise.all(subject.execute('base bar', source)), [42]);
        assert.equal(command.verify('anything') === 2, true);
    });

    it('testExecuteUnknownCommand', async () => {
        subject.register(literal('bar'));
        subject.register(literal('baz'));

        try {
            subject.execute('foo', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testExecuteImpermissibleCommand', async () => {
        subject.register(literal('foo').requires(() => false));

        try {
            subject.execute('foo', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testExecuteEmptyCommand', async () => {
        subject.register(literal(''));

        try {
            subject.execute('', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testExecuteUnknownSubcommand', async () => {
        subject.register(literal('foo').executes(command));

        try {
            subject.execute('foo bar', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownArgument());
            assert.equal(ex.getCursor(), 4);
            return;
        }

        assert.fail();
    });

    it('testExecuteIncorrectLiteral', async () => {
        subject.register(literal('foo').executes(command).then(literal('bar')));

        try {
            subject.execute('foo baz', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownArgument());
            assert.equal(ex.getCursor(), 4);
            return;
        }

        assert.fail();
    });

    it('testExecuteAmbiguousIncorrectArgument', async () => {
        subject.register(literal('foo').executes(command).then(literal('bar')).then(literal('baz')));

        try {
            subject.execute('foo unknown', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownArgument());
            assert.equal(ex.getCursor(), 4);
            return;
        }

        assert.fail();
    });

    it('testExecuteSubcommand', async () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        subject.register(
            literal('foo')
                .then(literal('a'))
                .then(literal('=').executes(subCommand))
                .then(literal('c'))
                .executes(command)
        );

        assert.deepEqual(await Promise.all(subject.execute('foo =', source)), [100]);
        assert.equal(subCommand.verify('anything') === 1, true);
    });

    it('testParseIncompleteLiteral', () => {
        subject.register(literal('foo').then(literal('bar').executes(command)));

        const parse = subject.parse('foo ', source);
        assert.equal(parse.getReader().getRemaining(), ' ');
        assert.equal(parse.getContext().getNodes().length, 1);
    });

    it('testParseIncompleteArgument', () => {
        subject.register(literal('foo').then(argument('bar', integer()).executes(command)));

        const parse = subject.parse('foo ', source);
        assert.equal(parse.getReader().getRemaining(), ' ');
        assert.equal(parse.getContext().getNodes().length, 1);
    });

    it('testExecuteAmbiguiousParentSubcommand', async () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        subject.register(
            literal('test')
                .then(argument('incorrect', integer()).executes(command))
                .then(argument('right', integer()).then(argument('sub', integer()).executes(subCommand)))
        );

        assert.deepEqual(await Promise.all(subject.execute('test 1 2', source)), [100]);
        assert.equal(subCommand.verify('anything') > 0, true);
        assert.equal(command.verify('anything') === 0, true);
    });

    it('testExecuteAmbiguiousParentSubcommandViaRedirect', async () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        const real = subject.register(
            literal('test')
                .then(argument('incorrect', integer()).executes(command))
                .then(argument('right', integer()).then(argument('sub', integer()).executes(subCommand)))
        );

        subject.register(literal('redirect').redirect(real));

        assert.deepEqual(await Promise.all(subject.execute('redirect 1 2', source)), [100]);
        assert.equal(subCommand.verify('anything') > 0, true);
        assert.equal(command.verify('anything') === 0, true);
    });

    it('testExecuteRedirectedMultipleTimes', async () => {
        const concreteNode = subject.register(literal('actual').executes(command));
        const redirectNode = subject.register(literal('redirected').redirect(subject.getRoot()));

        const input = 'redirected redirected actual';

        const parse = subject.parse(input, source);
        assert.equal(parse.getContext().getRange().get(input), 'redirected');
        assert.equal(parse.getContext().getNodes().length, 1);
        assert.equal(parse.getContext().getRootNode(), subject.getRoot());
        const [rootParsedNode] = parse.getContext().getNodes();
        assert.isDefined(rootParsedNode);
        expect(rootParsedNode.getRange()).to.deep.equal(parse.getContext().getRange());
        assert.equal(rootParsedNode.getNode(), redirectNode);

        const child1 = parse.getContext().getChild();
        assert.isNotNull(child1);
        assert.equal(child1.getRange().get(input), 'redirected');
        assert.equal(child1.getNodes().length, 1);
        assert.equal(child1.getRootNode(), subject.getRoot());
        const [child1ParsedNode] = child1.getNodes();
        assert.isDefined(child1ParsedNode);
        expect(child1ParsedNode.getRange()).to.deep.equal(child1.getRange());
        assert.equal(child1ParsedNode.getNode(), redirectNode);

        const child2 = child1.getChild();
        assert.isNotNull(child2);
        assert.equal(child2.getRange().get(input), 'actual');
        assert.equal(child2.getNodes().length, 1);
        assert.equal(child2.getRootNode(), subject.getRoot());
        const [child2ParsedNode] = child2.getNodes();
        assert.isDefined(child2ParsedNode);
        expect(child2ParsedNode.getRange()).to.deep.equal(child2.getRange());
        assert.equal(child2ParsedNode.getNode(), concreteNode);

        assert.deepEqual(await Promise.all(subject.execute(parse)), [42]);
        assert.equal(command.verify('anything') > 0, true);
    });

    it('testExecuteRedirected', async () => {
        const source1 = { name: 'Obj1' };
        const source2 = { name: 'Obj2' };
        const mockedModifier: RedirectModifier<Object> = {
            apply(obj) {
                if (obj.getSource() === source) return [source1, source2];
                return [];
            }
        };

        const concreteNode = subject.register(literal('actual').executes(command));
        const redirectNode = subject.register(literal('redirected').fork(subject.getRoot(), mockedModifier));

        const input = 'redirected actual';
        const parse = subject.parse(input, source);
        assert.equal(parse.getContext().getRange().get(input), 'redirected');
        assert.equal(parse.getContext().getNodes().length, 1);
        assert.equal(parse.getContext().getRootNode(), subject.getRoot());
        const [rootParsedNode] = parse.getContext().getNodes();
        assert.isDefined(rootParsedNode);
        expect(rootParsedNode.getRange()).to.deep.equal(parse.getContext().getRange());
        assert.equal(rootParsedNode.getNode(), redirectNode);
        assert.equal(parse.getContext().getSource(), source);

        const parent = parse.getContext().getChild();
        assert.isNotNull(parent);
        assert.equal(parent.getRange().get(input), 'actual');
        assert.equal(parent.getNodes().length, 1);
        assert.equal(parse.getContext().getRootNode(), subject.getRoot());
        const [parentParsedNode] = parent.getNodes();
        assert.isDefined(parentParsedNode);
        expect(parentParsedNode.getRange()).to.deep.equal(parent.getRange());
        assert.equal(parentParsedNode.getNode(), concreteNode);
        assert.equal(parent.getSource(), source);
        assert.lengthOf(await Promise.all(subject.execute(parse)), 2);

        const executedSources = command.execHistory.map((context) => context.getSource());
        assert.include(executedSources, source1);
        assert.include(executedSources, source2);
    });

    it('throws for an incomplete redirected command', () => {
        const target = subject.register(
            literal('foo')
                .then(literal('bar').then(argument('value', integer()).executes(command)))
                .then(literal('awa').executes(command))
        );
        subject.register(literal('baz').redirect(target));

        expect(() => subject.execute('baz bar', source)).toThrow(CommandSyntaxException);
    });

    it('returns no executions when a fork modifier matches no sources', () => {
        const target = subject.register(
            literal('foo').then(literal('bar').then(argument('value', integer()).executes(command)))
        );
        const modifier: RedirectModifier<Object> = { apply: () => [] };
        subject.register(literal('baz').fork(target, modifier));

        assert.deepEqual(subject.execute('baz bar 100', source), []);
        assert.equal(command.verify('anything'), 0);
    });

    it('testExecuteOrphanedSubcommand', async () => {
        subject.register(literal('foo').then(argument('bar', integer())).executes(command));

        try {
            subject.execute('foo 5', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand());
            assert.equal(ex.getCursor(), 5);
            return;
        }

        assert.fail();
    });

    it('testExecute_invalidOther', async () => {
        const wrongCommand = createMockedCommand();

        subject.register(literal('w').executes(wrongCommand));
        subject.register(literal('world').executes(command));

        assert.deepEqual(await Promise.all(subject.execute('world', source)), [42]);
        assert.equal(wrongCommand.verify('anything') === 0, true);
        assert.equal(command.verify('anything') > 0, true);
    });

    it('parse_noSpaceSeparator', async () => {
        subject.register(literal('foo').then(argument('bar', integer()).executes(command)));

        try {
            subject.execute('foo$', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testExecuteInvalidSubcommand', async () => {
        subject.register(literal('foo').then(argument('bar', integer())).executes(command));

        try {
            subject.execute('foo bar', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedInt());
            assert.equal(ex.getCursor(), 4);
            return;
        }

        assert.fail();
    });

    it('tells the consumer a thrown command finished with the result 0', () => {
        const completions: { success: boolean; result: number }[] = [];
        subject.setConsumer({
            onCommandComplete(_context, success, result) {
                completions.push({ success, result });
            }
        });
        subject.register(
            literal('boom').executes(() => {
                throw new Error('the command threw');
            })
        );

        expect(() => subject.execute('boom', source)).toThrow('the command threw');
        // Upstream passes 0 here, the same value a command that did nothing returns, so an
        // `execute store result` sink reading the third argument always reads a number.
        expect(completions).toEqual([{ success: false, result: 0 }]);
    });

    it('testGetPath', () => {
        const bar = literal('bar').build();
        subject.register(literal('foo').then(bar));

        expect(subject.getPath(bar)).to.deep.equal(['foo', 'bar']);
    });

    it('testFindNodeExists', () => {
        const bar = literal('bar').build();
        subject.register(literal('foo').then(bar));

        assert.equal(subject.findNode(['foo', 'bar']), bar);
    });

    it('testFindNodeDoesntExist', () => {
        expect(subject.findNode(['foo', 'bar'])).to.equal(null);
    });
});
