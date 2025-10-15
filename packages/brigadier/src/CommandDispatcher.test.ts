import { assert, beforeEach, describe, expect, it } from 'vitest';
import type Command from './Command';
import CommandDispatcher from './CommandDispatcher';
import type RedirectModifier from './RedirectModifier';
import StringReader from './StringReader';
import { DefaultType } from './arguments/ArgumentType';
import { literal } from './builder/LiteralArgumentBuilder';
import { argument } from './builder/RequiredArgumentBuilder';
import CommandSyntaxException from './exceptions/CommandSyntaxException';

const { integer } = DefaultType;

interface MockedCommand<S> extends Command<S> {
    execHistory: object;
    when(arg: any, returnValue: number): void;
    verify(arg: any): number;
}

const createMockedCommand = (): MockedCommand<Object> => {
    const execHistory: any[] = [];
    const execCount: any[] = [];
    const whenArg = new Map<any, number>();
    const command = (arg): number => {
        let i = execHistory.indexOf(arg);
        if (i === -1) {
            i = execCount.length;
            execCount[i] = 0;
            execHistory[i] = arg;
        }
        execCount[i]++;

        if (whenArg.has(arg)) return whenArg.get(arg)!;
        else if (whenArg.has('anything')) return whenArg.get('anything')!;

        return 69;
    };
    command.verify = (arg) => {
        let i = execHistory.indexOf(arg);
        if (i > -1) return execCount[i];
        else if (arg === 'anything') {
            let result = 0;
            execCount.forEach((v) => (result += v));
            return result;
        }

        return null;
    };
    command.when = (o, r: number) => {
        whenArg.set(o, r);
    };
    command.execHistory = execHistory;
    return command as any; // FIXME
};

describe('CommandDispatcherTest', () => {
    let command;
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

    it('testCreateAndExecuteCommand', () => {
        subject.register(literal('foo').executes(command));
        assert.equal(subject.execute('foo', source), 42);
        assert.equal(command.verify('anything') === 1, true);
    });

    it('testCreateAndExecuteOffsetCommand', () => {
        subject.register(literal('foo').executes(command));
        assert.equal(subject.execute(inputWithOffset('/foo', 1), source), 42);
        assert.equal(command.verify('anything') === 1, true);
    });

    it('testCreateAndMergeCommands', () => {
        subject.register(literal('base').then(literal('foo').executes(command)));
        subject.register(literal('base').then(literal('bar').executes(command)));

        assert.equal(subject.execute('base foo', source), 42);
        assert.equal(subject.execute('base bar', source), 42);
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
        subject.register(literal('foo').executes(command).then(literal('bar')) as any);

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
        subject.register(literal('foo').executes(command).then(literal('bar')).then(literal('baz')) as any);

        try {
            subject.execute('foo unknown', source);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownArgument());
            assert.equal(ex.getCursor(), 4);
            return;
        }

        assert.fail();
    });

    it('testExecuteSubcommand', () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        subject.register(
            literal('foo')
                .then(literal('a'))
                .then(literal('=').executes(subCommand))
                .then(literal('c'))
                .executes(command)
        );

        assert.equal(subject.execute('foo =', source), 100);
        assert.equal(subCommand.verify('anything') === 1, true);
    });

    it('testParseIncompleteLiteral', () => {
        subject.register(literal('foo').then(literal('bar').executes(command)));

        const parse = subject.parse('foo ', source);
        assert.equal(parse.getReader().getRemaining(), ' ');
        assert.equal(parse.getContext().getNodes().length, 1);
    });

    it('testParseIncompleteArgument', () => {
        subject.register(
            literal('foo').then(
                argument('bar', integer()).executes(command) as any // FIXME
            )
        );

        const parse = subject.parse('foo ', source);
        assert.equal(parse.getReader().getRemaining(), ' ');
        assert.equal(parse.getContext().getNodes().length, 1);
    });

    it('testExecuteAmbiguiousParentSubcommand', () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        subject.register(
            literal('test')
                .then(
                    argument('incorrect', integer()).executes(command) as any // FIXME
                )
                .then(
                    argument('right', integer()).then(argument('sub', integer()).executes(subCommand as any)) as any // FIXME
                )
        );

        assert.equal(subject.execute('test 1 2', source), 100);
        assert.equal(subCommand.verify('anything') > 0, true);
        assert.equal(command.verify('anything') === 0, true);
    });

    it('testExecuteAmbiguiousParentSubcommandViaRedirect', () => {
        const subCommand = createMockedCommand();
        subCommand.when('anything', 100);

        const real = subject.register(
            literal('test')
                .then(
                    argument('incorrect', integer()).executes(command) as any // FIXME
                )
                .then(
                    argument('right', integer()).then(argument('sub', integer()).executes(subCommand as any)) as any // FIXME
                )
        );

        subject.register(literal('redirect').redirect(real));

        assert.equal(subject.execute('redirect 1 2', source), 100);
        assert.equal(subCommand.verify('anything') > 0, true);
        assert.equal(command.verify('anything') === 0, true);
    });

    it('testExecuteRedirectedMultipleTimes', () => {
        const concreteNode = subject.register(literal('actual').executes(command));
        const redirectNode = subject.register(literal('redirected').redirect(subject.getRoot()));

        const input = 'redirected redirected actual';

        const parse = subject.parse(input, source);
        assert.equal(parse.getContext().getRange().get(input), 'redirected');
        assert.equal(parse.getContext().getNodes().length, 1);
        assert.equal(parse.getContext().getRootNode(), subject.getRoot());
        expect(parse.getContext().getNodes()[0].getRange()).to.deep.equal(parse.getContext().getRange());
        assert.equal(parse.getContext().getNodes()[0].getNode(), redirectNode);

        const child1 = parse.getContext().getChild();
        expect(child1).to.not.equal(null);
        assert.equal(child1.getRange().get(input), 'redirected');
        assert.equal(child1.getNodes().length, 1);
        assert.equal(child1.getRootNode(), subject.getRoot());
        expect(child1.getNodes()[0].getRange()).to.deep.equal(child1.getRange());
        assert.equal(child1.getNodes()[0].getNode(), redirectNode);

        const child2 = child1.getChild();
        expect(child2).to.not.equal(null);
        assert.equal(child2.getRange().get(input), 'actual');
        assert.equal(child2.getNodes().length, 1);
        assert.equal(child2.getRootNode(), subject.getRoot());
        expect(child2.getNodes()[0].getRange()).to.deep.equal(child2.getRange());
        assert.equal(child2.getNodes()[0].getNode(), concreteNode);

        assert.equal(subject.execute(parse), 42);
        assert.equal(command.verify('anything') > 0, true);
    });

    it('testExecuteRedirected', () => {
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
        expect(parse.getContext().getNodes()[0].getRange()).to.deep.equal(parse.getContext().getRange());
        assert.equal(parse.getContext().getNodes()[0].getNode(), redirectNode);
        assert.equal(parse.getContext().getSource(), source);

        const parent = parse.getContext().getChild();
        expect(parent).to.not.equal(null);
        assert.equal(parent.getRange().get(input), 'actual');
        assert.equal(parent.getNodes().length, 1);
        assert.equal(parse.getContext().getRootNode(), subject.getRoot());
        expect(parent.getNodes()[0].getRange()).to.deep.equal(parent.getRange());
        assert.equal(parent.getNodes()[0].getNode(), concreteNode);
        assert.equal(parent.getSource(), source);
        assert.equal(subject.execute(parse).length, 2);

        let flag1 = 0,
            flag2 = 0;
        command.execHistory.forEach((v) => {
            if (v.source === source1) flag1++;
            if (v.source === source2) flag2++;
        });
        if (flag1 === 0 || flag2 === 0) assert.fail();
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

    it('testExecute_invalidOther', () => {
        const wrongCommand = createMockedCommand();

        subject.register(literal('w').executes(wrongCommand));
        subject.register(literal('world').executes(command));

        assert.equal(subject.execute('world', source), 42);
        assert.equal(wrongCommand.verify('anything') === 0, true);
        assert.equal(command.verify('anything') > 0, true);
    });

    it('parse_noSpaceSeparator', async () => {
        subject.register(
            literal('foo').then(
                argument('bar', integer()).executes(command) as any // FIXME
            )
        );

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
