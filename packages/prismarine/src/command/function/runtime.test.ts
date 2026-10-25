/**
 * The function runtime over a real datapack.
 *
 * Written on disk and read through `@jsprismarine/packs` rather than built in
 * memory, because the thing worth testing is that the whole path holds: a
 * `.mcfunction` the loader routes, the tag merge, the compile, and the lines
 * reaching a dispatcher. The dispatcher itself is recorded here;
 * `commandStartup.test.ts` runs the same path against a booted server.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CommandSource } from '@jsprismarine/commands';
import type { Diagnostic } from '@jsprismarine/mcfunction';
import { load } from '@jsprismarine/packs';
import { afterAll, describe, expect, it } from 'vitest';

import { buildContentTags } from '../../content/tags';
import type { FunctionContent } from './load';
import { loadServerFunctions } from './load';
import { FunctionRuntime } from './runtime';

const MCMETA = JSON.stringify({ pack: { description: 'functions', min_format: 121, max_format: 121 } });

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Writes a datapack folder and loads its function half through the real loader. */
const datapack = (files: Record<string, string>): FunctionContent => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-functions-'));
    temporaryDirs.push(root);

    for (const [path, text] of Object.entries({ 'pack.mcmeta': MCMETA, ...files })) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }

    const { definitions } = load([{ kind: 'datapack', path: root }]);
    return { functions: definitions.functions, tags: buildContentTags(definitions.tags) };
};

/** The runtime, plus the command lines its dispatcher was handed. */
const runtimeOver = (content: FunctionContent, forksPerLine = 1) => {
    const lines: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const runtime = new FunctionRuntime({
        loaded: loadServerFunctions(content),
        dispatch: (commandLine) => {
            lines.push(commandLine);
            return { result: 1, forks: forksPerLine };
        },
        report: (diagnostic) => diagnostics.push(diagnostic)
    });
    return { runtime, lines, diagnostics };
};

/** A source whose only live method is the one the runtime calls. */
const source = (): CommandSource => {
    const stack = { withSilent: () => stack } as unknown as CommandSource;
    return stack;
};

describe('the function runtime over a datapack', () => {
    it('runs the lines of a function the loader routed', () => {
        const { runtime, lines } = runtimeOver(
            datapack({
                'data/fixture/function/greet.mcfunction': '# a comment\nsay hello\n\nsay again\n'
            })
        );

        expect(runtime.run('fixture:greet', source())).toBe(2);
        expect(lines).toEqual(['say hello', 'say again']);
    });

    it('substitutes a macro line from the compound the call carries', () => {
        const { runtime, lines } = runtimeOver(
            datapack({
                'data/fixture/function/place.mcfunction': '$setblock $(x) 70 $(z) minecraft:stone\n'
            })
        );

        expect(runtime.run('fixture:place', source(), '{x:4,z:-7}')).toBe(1);
        expect(lines).toEqual(['setblock 4 70 -7 minecraft:stone']);
    });

    it('skips a macro call whose compound is missing an entry, and says which', () => {
        const { runtime, lines, diagnostics } = runtimeOver(
            datapack({ 'data/fixture/function/place.mcfunction': '$say $(who)\n' })
        );

        expect(runtime.run('fixture:place', source(), '{other:1}')).toBe(0);
        expect(lines).toEqual([]);
        expect(diagnostics.map((entry) => entry.message)).toContainEqual(expect.stringContaining("no entry for 'who'"));
    });

    it('runs every member of a function tag, in order, once each', () => {
        const { runtime, lines } = runtimeOver(
            datapack({
                'data/fixture/function/first.mcfunction': 'say first\n',
                'data/fixture/function/second.mcfunction': 'say second\n',
                'data/fixture/tags/function/all.json': JSON.stringify({
                    values: ['fixture:first', 'fixture:second', 'fixture:first']
                })
            })
        );

        expect(runtime.run('#fixture:all', source())).toBe(2);
        expect(lines).toEqual(['say first', 'say second']);
    });

    it('merges a tag across two packs, which is what lets both add to minecraft:tick', () => {
        const first = mkdtempSync(join(tmpdir(), 'jsp-functions-a-'));
        const second = mkdtempSync(join(tmpdir(), 'jsp-functions-b-'));
        temporaryDirs.push(first, second);

        const write = (root: string, files: Record<string, string>) => {
            for (const [path, text] of Object.entries({ 'pack.mcmeta': MCMETA, ...files })) {
                const absolute = join(root, ...path.split('/'));
                mkdirSync(dirname(absolute), { recursive: true });
                writeFileSync(absolute, text);
            }
        };
        write(first, {
            'data/a/function/one.mcfunction': 'say one\n',
            'data/minecraft/tags/function/tick.json': JSON.stringify({ values: ['a:one'] })
        });
        write(second, {
            'data/b/function/two.mcfunction': 'say two\n',
            'data/minecraft/tags/function/tick.json': JSON.stringify({ values: ['b:two'] })
        });

        const { definitions } = load([
            { kind: 'datapack', path: first },
            { kind: 'datapack', path: second }
        ]);
        const { runtime, lines } = runtimeOver({
            functions: definitions.functions,
            tags: buildContentTags(definitions.tags)
        });

        expect(runtime.tick(source())).toBe(2);
        expect(lines).toEqual(['say one', 'say two']);
    });

    it('leaves a file that does not compile out and reports it', () => {
        const { runtime, diagnostics } = runtimeOver(
            datapack({
                'data/fixture/function/bad.mcfunction': '/say a leading slash is not mcfunction\n',
                'data/fixture/function/good.mcfunction': 'say fine\n'
            })
        );

        expect(runtime.ids()).toEqual(['fixture:good']);
        expect(diagnostics.map((entry) => entry.code)).toContain('line.leading-slash');
    });

    it('reports a function nobody declared rather than failing silently', () => {
        const { runtime, diagnostics } = runtimeOver(datapack({}));

        expect(runtime.run('fixture:nothing', source())).toBe(0);
        expect(diagnostics.map((entry) => entry.message)).toContainEqual(
            expect.stringContaining('fixture:nothing does not exist')
        );
    });

    it('runs a schedule on the tick it comes due, once', () => {
        const { runtime, lines } = runtimeOver(datapack({ 'data/fixture/function/later.mcfunction': 'say later\n' }));

        expect(runtime.queue('fixture:later', 2, 'replace')).toBe(true);
        expect(runtime.tick(source())).toBe(0);
        expect(runtime.tick(source())).toBe(1);
        expect(runtime.tick(source())).toBe(0);
        expect(lines).toEqual(['say later']);
    });

    it('keeps one pending call per name under replace and several under append', () => {
        const { runtime } = runtimeOver(datapack({ 'data/fixture/function/later.mcfunction': 'say later\n' }));

        runtime.queue('fixture:later', 5, 'replace');
        runtime.queue('fixture:later', 9, 'replace');
        expect(runtime.queued).toBe(1);

        runtime.queue('fixture:later', 9, 'append');
        expect(runtime.queued).toBe(2);
        expect(runtime.clearQueue('fixture:later')).toBe(2);
        expect(runtime.queued).toBe(0);
    });

    it('stops a run that reaches the operation limit instead of looping forever', () => {
        const content = datapack({ 'data/fixture/function/loop.mcfunction': 'say round\nfunction fixture:loop\n' });
        const lines: string[] = [];
        const diagnostics: Diagnostic[] = [];
        const runtime = new FunctionRuntime({
            loaded: loadServerFunctions(content),
            dispatch: (commandLine) => {
                lines.push(commandLine);
                return { result: 1 };
            },
            report: (diagnostic) => diagnostics.push(diagnostic),
            limits: { maxCommandSequenceLength: 50 }
        });

        runtime.run('fixture:loop', source());

        expect(lines.length).toBeLessThan(50);
        expect(diagnostics.map((entry) => entry.code)).toContain('limit.command-sequence-length');
    });

    it('stops a run whose forks exceed the fork limit', () => {
        const content = datapack({ 'data/fixture/function/spread.mcfunction': 'execute as @e run say hi\n' });
        const { runtime, diagnostics } = (() => {
            const found: Diagnostic[] = [];
            return {
                runtime: new FunctionRuntime({
                    loaded: loadServerFunctions(content),
                    dispatch: () => ({ result: 1, forks: 20 }),
                    report: (diagnostic) => found.push(diagnostic),
                    limits: { maxCommandForks: 4 }
                }),
                diagnostics: found
            };
        })();

        runtime.run('fixture:spread', source());

        expect(diagnostics.map((entry) => entry.code)).toContain('limit.command-forks');
    });
});
