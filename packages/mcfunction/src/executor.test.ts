import { describe, expect, it } from 'vitest';

import { compileFunction } from './compile';
import type { CompiledFunction } from './compile';
import { FunctionExecutor } from './executor';
import type { CommandContext, CommandOutcome } from './runner';
import { RecordingCommandRunner } from './runner';
import { FunctionTagRegistry, TICK_FUNCTION_TAG } from './tags';

/** The command source these tests pass through the runtime. */
interface TestSource {
    name: string;
}

const source: TestSource = { name: 'console' };

/** Compiles a set of function files into a lookup the executor can read. */
const lookupOf = (files: Record<string, string>) => {
    const functions = new Map<string, CompiledFunction>();
    for (const [id, text] of Object.entries(files)) {
        const compiled = compileFunction(id, text);
        if (!compiled.function) throw new Error(`the test fixture ${id} did not compile`);
        functions.set(id, compiled.function);
    }
    return { get: (id: string) => functions.get(id) };
};

/** Builds an executor over the given files, with an optional response from the runner. */
const executorOf = (
    files: Record<string, string>,
    options: {
        tags?: FunctionTagRegistry;
        limits?: { maxCommandSequenceLength?: number; maxCommandForks?: number };
        respond?: (commandLine: string, context: CommandContext<TestSource>) => CommandOutcome;
    } = {}
) => {
    const runner = new RecordingCommandRunner<TestSource>(options.respond);
    const executor = new FunctionExecutor<TestSource>({
        functions: lookupOf(files),
        runner,
        tags: options.tags,
        limits: options.limits
    });
    return { executor, runner };
};

describe('FunctionExecutor.run', () => {
    it('hands every line to the runner in file order, with its source and location', () => {
        const { executor, runner } = executorOf({ 'pack:greet': 'say hello\nsay goodbye\n' });
        const report = executor.run('pack:greet', { source });

        expect(runner.commandLines).toEqual(['say hello', 'say goodbye']);
        expect(runner.recorded[0]?.context).toEqual({ source, functionId: 'pack:greet', line: 1 });
        expect(report.commands).toBe(2);
        expect(report.diagnostics).toEqual([]);
    });

    it('runs a nested call where it appears, before the rest of the caller', () => {
        const { executor, runner } = executorOf({
            'pack:outer': 'say before\nfunction pack:inner\nsay after\n',
            'pack:inner': 'say inner one\nsay inner two\n'
        });
        executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say before', 'say inner one', 'say inner two', 'say after']);
    });

    it('never hands a function line to the runner', () => {
        const { executor, runner } = executorOf({ 'pack:outer': 'function pack:inner\n', 'pack:inner': 'say hi' });
        executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say hi']);
    });

    it('substitutes macro arguments given on the call line', () => {
        const { executor, runner } = executorOf({
            'pack:outer': 'function pack:greet {"name":"Steve"}\n',
            'pack:greet': '$say hello $(name)\n'
        });
        executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say hello Steve']);
    });

    it('skips a macro call with no arguments and reports it', () => {
        const { executor, runner } = executorOf({
            'pack:outer': 'function pack:greet\nsay after\n',
            'pack:greet': '$say hello $(name)\n'
        });
        const report = executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say after']);
        expect(report.diagnostics[0]).toMatchObject({
            code: 'macro.missing-arguments',
            functionId: 'pack:greet'
        });
    });

    it('reports a call to a function nobody registered and keeps going', () => {
        const { executor, runner } = executorOf({ 'pack:outer': 'function pack:absent\nsay after\n' });
        const report = executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say after']);
        expect(report.diagnostics[0]).toMatchObject({ code: 'call.unknown-function', line: 1 });
    });

    it('reports a command that throws and keeps going', () => {
        const { executor, runner } = executorOf(
            { 'pack:outer': 'say boom\nsay after\n' },
            {
                respond: (commandLine) => {
                    if (commandLine === 'say boom') throw new Error('no such command');
                    return {};
                }
            }
        );
        const report = executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['say boom', 'say after']);
        expect(report.diagnostics[0]).toMatchObject({ code: 'command.failed', message: 'no such command' });
    });
});

describe('FunctionExecutor limits', () => {
    it('stops at maxCommandSequenceLength and reports why', () => {
        const { executor, runner } = executorOf(
            { 'pack:loop': 'say one\nfunction pack:loop\n' },
            { limits: { maxCommandSequenceLength: 20 } }
        );
        const report = executor.run('pack:loop', { source });

        expect(report.stopped).toBe('max-command-sequence-length');
        expect(report.operations).toBe(21);
        expect(runner.commandLines.length).toBeLessThan(20);
        expect(report.diagnostics.at(-1)).toMatchObject({ code: 'limit.command-sequence-length' });
    });

    it('stops at maxCommandForks once the contexts a command reports add up', () => {
        const { executor, runner } = executorOf(
            { 'pack:wide': 'execute as @e run say hi\nexecute as @e run say hi\nsay after\n' },
            { limits: { maxCommandForks: 7 }, respond: () => ({ forks: 5 }) }
        );
        const report = executor.run('pack:wide', { source });

        expect(report.stopped).toBe('max-command-forks');
        expect(report.forks).toBe(10);
        expect(runner.commandLines).toEqual(['execute as @e run say hi', 'execute as @e run say hi']);
        expect(report.diagnostics.at(-1)).toMatchObject({ code: 'limit.command-forks', line: 2 });
    });

    it('charges one operation per command line and one per invocation', () => {
        const { executor } = executorOf({
            'pack:outer': 'say one\nfunction pack:inner\n',
            'pack:inner': 'say two\n'
        });
        const report = executor.run('pack:outer', { source });

        // The entry invocation, two lines of pack:outer, the pack:inner
        // invocation and the one line of pack:inner.
        expect(report.operations).toBe(5);
        expect(report.invocations).toBe(2);
    });
});

describe('FunctionExecutor stack depth', () => {
    /** Builds a chain of functions where each one calls the next and then runs a command. */
    const chain = (length: number): Record<string, string> => {
        const files: Record<string, string> = {};
        for (let index = 0; index < length; index += 1) {
            files[`pack:step${index}`] =
                index === length - 1 ? 'say last\n' : `function pack:step${index + 1}\nsay back${index}\n`;
        }
        return files;
    };

    it('runs 20000 nested calls without overflowing the JavaScript stack', () => {
        const depth = 20_000;
        const { executor, runner } = executorOf(chain(depth), {
            limits: { maxCommandSequenceLength: 1_000_000 }
        });
        const report = executor.run('pack:step0', { source });

        expect(report.stopped).toBeUndefined();
        expect(report.maxDepth).toBe(depth);
        expect(runner.commandLines[0]).toBe('say last');
        expect(runner.commandLines.at(-1)).toBe('say back0');
    });

    it('keeps a tail-recursive function at depth one until the limit stops it', () => {
        const { executor } = executorOf(
            { 'pack:loop': 'say tick\nfunction pack:loop\n' },
            { limits: { maxCommandSequenceLength: 30_000 } }
        );
        const report = executor.run('pack:loop', { source });

        expect(report.stopped).toBe('max-command-sequence-length');
        expect(report.maxDepth).toBe(1);
    });
});

describe('FunctionExecutor tags', () => {
    it('runs every function of the tick tag, in tag order', () => {
        const tags = new FunctionTagRegistry();
        tags.add(TICK_FUNCTION_TAG, { values: ['pack:first', 'pack:second'] });
        const { executor, runner } = executorOf(
            { 'pack:first': 'say first\n', 'pack:second': 'say second\n' },
            { tags }
        );
        const report = executor.runTick({ source });

        expect(runner.commandLines).toEqual(['say first', 'say second']);
        expect(report.invocations).toBe(2);
    });

    it('runs the load tag once, separately from the tick tag', () => {
        const tags = new FunctionTagRegistry();
        tags.add('minecraft:load', { values: ['pack:setup'] });
        tags.add(TICK_FUNCTION_TAG, { values: ['pack:loop'] });
        const { executor, runner } = executorOf({ 'pack:setup': 'say setup\n', 'pack:loop': 'say loop\n' }, { tags });

        executor.runLoad({ source });
        expect(runner.commandLines).toEqual(['say setup']);

        runner.clear();
        executor.runTick({ source });
        expect(runner.commandLines).toEqual(['say loop']);
    });

    it('does nothing and reports nothing when no pack declares the tick tag', () => {
        const { executor, runner } = executorOf({}, { tags: new FunctionTagRegistry() });
        const report = executor.runTick({ source });

        expect(runner.commandLines).toEqual([]);
        expect(report.diagnostics).toEqual([]);
    });

    it('follows a tag referenced from a function line, including a tag of tags', () => {
        const tags = new FunctionTagRegistry();
        tags.add('pack:group', { values: ['#pack:inner', 'pack:third'] });
        tags.add('pack:inner', { values: ['pack:first', 'pack:second'] });
        const { executor, runner } = executorOf(
            {
                'pack:entry': 'function #pack:group\nsay after\n',
                'pack:first': 'say first\n',
                'pack:second': 'say second\n',
                'pack:third': 'say third\n'
            },
            { tags }
        );
        executor.run('pack:entry', { source });

        expect(runner.commandLines).toEqual(['say first', 'say second', 'say third', 'say after']);
    });

    it('reports a tag reference no pack declared', () => {
        const { executor } = executorOf(
            { 'pack:entry': 'function #pack:absent\n' },
            { tags: new FunctionTagRegistry() }
        );
        const report = executor.run('pack:entry', { source });

        expect(report.diagnostics[0]).toMatchObject({ code: 'call.unknown-tag', line: 1 });
    });
});

describe('FunctionExecutor and /return', () => {
    /** Reads `return <value>`, `return fail` and nothing else, as the real dispatcher would. */
    const respondToReturn = (commandLine: string): CommandOutcome => {
        if (commandLine === 'return fail') return { returned: {} };
        if (!commandLine.startsWith('return ')) return {};
        return { returned: { value: Number(commandLine.slice('return '.length)) } };
    };

    it('reports no value for a function that runs to its last line', () => {
        const { executor } = executorOf({ 'pack:plain': 'say one\nsay two\n' }, { respond: respondToReturn });
        const report = executor.run('pack:plain', { source });

        expect(report.returnValues).toEqual([]);
        expect(report.commands).toBe(2);
    });

    it('drops the rest of the function and reports the value', () => {
        const { executor, runner } = executorOf(
            { 'pack:early': 'say before\nreturn 7\nsay after\n' },
            { respond: respondToReturn }
        );
        const report = executor.run('pack:early', { source });

        expect(runner.commandLines).toEqual(['say before', 'return 7']);
        expect(report.returnValues).toEqual([7]);
    });

    it('reports a zero return, which is a value and not the absence of one', () => {
        const { executor } = executorOf({ 'pack:zero': 'return 0\n' }, { respond: respondToReturn });

        expect(executor.run('pack:zero', { source }).returnValues).toEqual([0]);
    });

    it('ends the function without a value when the return produced none', () => {
        const { executor, runner } = executorOf(
            { 'pack:failing': 'return fail\nsay after\n' },
            { respond: respondToReturn }
        );
        const report = executor.run('pack:failing', { source });

        expect(runner.commandLines).toEqual(['return fail']);
        expect(report.returnValues).toEqual([]);
    });

    it('returns from the function the line is in, not from its caller', () => {
        const { executor, runner } = executorOf(
            { 'pack:outer': 'function pack:inner\nsay after\n', 'pack:inner': 'return 3\nsay skipped\n' },
            { respond: respondToReturn }
        );
        const report = executor.run('pack:outer', { source });

        expect(runner.commandLines).toEqual(['return 3', 'say after']);
        expect(report.returnValues).toEqual([]);
    });

    it('collects one value per tag member that returned', () => {
        const tags = new FunctionTagRegistry();
        tags.add('pack:group', { values: ['pack:quiet', 'pack:loud'] });
        const { executor } = executorOf(
            { 'pack:quiet': 'return 0\n', 'pack:loud': 'say hi\nreturn 5\n' },
            { tags, respond: respondToReturn }
        );
        const report = executor.run('#pack:group', { source });

        expect(report.returnValues).toEqual([0, 5]);
    });

    it('lets a tail call return on the caller it replaced', () => {
        // The last line of `pack:outer` is the call, so `pack:tail` runs in
        // the frame `pack:outer` gave up rather than on top of it.
        const { executor } = executorOf(
            { 'pack:outer': 'function pack:tail\n', 'pack:tail': 'return 9\n' },
            { respond: respondToReturn }
        );

        expect(executor.run('pack:outer', { source }).returnValues).toEqual([9]);
    });
});
