import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CommandSource } from '@jsprismarine/commands';
import { afterAll, describe, expect, it } from 'vitest';

import { readBehaviorPackFunctions, withBehaviorPackFunctions } from './behaviorPackFunctions';
import { loadServerFunctions } from './load';
import { FunctionRuntime } from './runtime';

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Writes a behavior pack folder holding the given files. */
const behaviorPack = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-bp-functions-'));
    temporaryDirs.push(root);
    write(root, files);
    return root;
};

const write = (root: string, files: Record<string, string>): void => {
    for (const [path, text] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
    }
};

/** The runtime over the packs' functions, plus the command lines its dispatcher was handed. */
const runtimeOver = (directories: readonly string[]) => {
    const lines: string[] = [];
    const runtime = new FunctionRuntime({
        loaded: loadServerFunctions(
            withBehaviorPackFunctions({ functions: new Map() }, readBehaviorPackFunctions(directories))
        ),
        dispatch: (commandLine) => {
            lines.push(commandLine);
            return { result: 1, forks: 1 };
        },
        report: () => {}
    });
    return { runtime, lines };
};

/** A source whose only live method is the one the runtime calls. */
const source = (): CommandSource => {
    const stack = { withSilent: () => stack } as unknown as CommandSource;
    return stack;
};

describe('behavior pack functions', () => {
    it('runs a function by its path under functions/', () => {
        const pack = behaviorPack({ 'functions/init/ouch.mcfunction': 'say ouch\n' });
        const { runtime, lines } = runtimeOver([pack]);

        expect(runtime.run('minecraft:init/ouch', source()).commands).toBe(1);
        expect(lines).toEqual(['say ouch']);
    });

    it('runs what an edited file says once the files are read again, as /reload does', () => {
        const pack = behaviorPack({ 'functions/greet.mcfunction': 'say before\n' });
        expect(runtimeOver([pack]).runtime.run('minecraft:greet', source()).commands).toBe(1);

        write(pack, { 'functions/greet.mcfunction': 'say after\nsay again\n' });
        const { runtime, lines } = runtimeOver([pack]);

        expect(runtime.run('minecraft:greet', source()).commands).toBe(2);
        expect(lines).toEqual(['say after', 'say again']);
    });

    it('runs the functions every pack’s tick.json lists each tick', () => {
        const first = behaviorPack({
            'functions/one.mcfunction': 'say one\n',
            'functions/tick.json': JSON.stringify({ values: ['one'] })
        });
        const second = behaviorPack({
            'functions/two.mcfunction': 'say two\n',
            'functions/tick.json': JSON.stringify({ values: ['two'] })
        });
        const { runtime, lines } = runtimeOver([first, second]);

        expect(runtime.tick(source())).toBe(2);
        expect(lines).toEqual(['say one', 'say two']);
    });

    it('lets a later pack replace an earlier pack’s function', () => {
        const first = behaviorPack({ 'functions/greet.mcfunction': 'say first\n' });
        const second = behaviorPack({ 'functions/greet.mcfunction': 'say second\n' });
        const { runtime, lines } = runtimeOver([first, second]);

        runtime.run('minecraft:greet', source());

        expect(lines).toEqual(['say second']);
    });

    it('reports a tick.json without a values list and reads the rest', () => {
        const pack = behaviorPack({
            'functions/greet.mcfunction': 'say hi\n',
            'functions/tick.json': '{}'
        });
        const read = readBehaviorPackFunctions([pack]);

        expect(read.tick).toEqual([]);
        expect(read.problems).toHaveLength(1);
        expect([...read.functions.keys()]).toEqual(['minecraft:greet']);
    });
});
