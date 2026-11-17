import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptEngine, ScriptHostLibrary } from '../ScriptEngine';
import { ScriptError, ScriptTerminatedError } from '../errors';
import { loadLibrary, scriptHostAvailable } from '../testing/library.test.helper';
import { ScriptHandle } from '../values';
import type { ScriptValue } from '../values';
import type { DebugFrame, EngineDebugger, PauseOutcome, PauseReason, ResumeMode } from './EngineDebugger';

/** What a test does at one stop: it reads the stopped script, then says how it goes on. */
type StopAction = (stop: {
    reason: PauseReason;
    debugger: EngineDebugger;
    frames: DebugFrame[];
}) => ResumeMode | 'terminate';

/**
 * A debugger client that answers each stop with the next scripted action and records where the
 * script stopped. It runs on the engine's thread, as a real client does, and reads no clock.
 */
class ScriptedClient {
    public readonly stops: { reason: PauseReason; line: number; file: string; depth: number }[] = [];
    public polls = 0;
    public onPoll: (() => void) | undefined;
    private readonly actions: StopAction[];
    public engineDebugger!: EngineDebugger;

    public constructor(actions: StopAction[]) {
        this.actions = actions;
    }

    public paused(reason: PauseReason): PauseOutcome {
        const frames = this.engineDebugger.frames();
        const top = frames[0];
        this.stops.push({ reason, line: top?.line ?? 0, file: top?.file ?? '', depth: frames.length });
        const action = this.actions.shift() ?? (() => 'continue');
        const mode = action({ reason, debugger: this.engineDebugger, frames });
        if (mode === 'terminate') return 'terminate';
        if (this.engineDebugger.isAttached) this.engineDebugger.resume(mode);
        return 'resume';
    }

    public poll(): void {
        this.polls++;
        this.onPoll?.();
    }
}

const program = [
    'function add(a, b) {', // 1
    '    const sum = a + b;', // 2
    '    return sum;', // 3
    '}', // 4
    'function main() {', // 5
    '    let total = 0;', // 6
    '    total = add(total, 2);', // 7
    '    total = add(total, 3);', // 8
    '    return total;', // 9
    '}', // 10
    'main();' // 11
].join('\n');

describe.skipIf(!scriptHostAvailable())('the engine debugger', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const engines: ScriptEngine[] = [];
    const create = (): ScriptEngine => {
        const engine = library.createEngine();
        engines.push(engine);
        return engine;
    };
    afterEach(() => {
        for (const engine of engines.splice(0)) engine.destroy();
    });

    const attach = (engine: ScriptEngine, actions: StopAction[], pollLines = 0): ScriptedClient => {
        const client = new ScriptedClient(actions);
        client.engineDebugger = engine.attachDebugger(client, { pollLines });
        return client;
    };

    describe('breakpoints', () => {
        it('stops at a breakpoint line with the stack that reached it', () => {
            const engine = create();
            let frames: DebugFrame[] = [];
            const client = attach(engine, [
                (stop) => {
                    frames = stop.frames;
                    return 'continue';
                }
            ]);
            expect(client.engineDebugger.setBreakpoints('main.js', [2])).toBe(1);

            expect(engine.evaluate(program, 'main.js')).toBe(5);

            expect(client.stops.map(({ reason, line }) => [reason, line])).toEqual([
                ['breakpoint', 2],
                ['breakpoint', 2]
            ]);
            expect(frames.map(({ name, file, line }) => [name, file, line])).toEqual([
                ['add', 'main.js', 2],
                ['main', 'main.js', 7],
                ['<eval>', 'main.js', 11]
            ]);
        });

        it('stops on every pass through a loop, and in another file only by its name', () => {
            const engine = create();
            const client = attach(engine, []);
            client.engineDebugger.setBreakpoints('loop.js', [3]);
            client.engineDebugger.setBreakpoints('other.js', [1]);

            engine.evaluate('let n = 0;\nfor (let i = 0; i < 3; i++) {\n    n += i;\n}\nn;', 'loop.js');

            expect(client.stops.map(({ line }) => line)).toEqual([3, 3, 3]);
        });

        it('stops once on a breakpoint line however many instructions it has', () => {
            const engine = create();
            const client = attach(engine, []);
            client.engineDebugger.setBreakpoints('line.js', [2]);

            engine.evaluate('function f() { return 1; }\nconst x = f() + f() + [1, 2, 3].length;\nx;', 'line.js');

            expect(client.stops.map(({ line }) => line)).toEqual([2]);
        });

        it('forgets a file’s breakpoints when they are set to none', () => {
            const engine = create();
            const client = attach(engine, []);
            client.engineDebugger.setBreakpoints('main.js', [2, 3]);
            client.engineDebugger.setBreakpoints('main.js', []);

            engine.evaluate(program, 'main.js');

            expect(client.stops).toEqual([]);
        });

        it('stops in a module, by the module’s name', () => {
            const engine = library.createEngine({
                loadModule: (name) =>
                    name === 'lib.js' ? 'export const twice = (n) => {\n    return n * 2;\n};' : undefined
            });
            engines.push(engine);
            const client = attach(engine, []);
            client.engineDebugger.setBreakpoints('lib.js', [2]);

            const namespace = engine.evaluateModule(
                'main.js',
                "import { twice } from 'lib.js';\nexport const four = twice(2);"
            );

            expect(engine.get(namespace, 'four')).toBe(4);
            engine.free(namespace);
            expect(client.stops.map(({ file, line }) => [file, line])).toEqual([['lib.js', 2]]);
        });
    });

    describe('stepping', () => {
        it('steps over a call to the next line of the same function', () => {
            const engine = create();
            const client = attach(engine, [() => 'stepOver', () => 'stepOver', () => 'stepOver']);
            client.engineDebugger.setBreakpoints('main.js', [6]);

            engine.evaluate(program, 'main.js');

            expect(client.stops.map(({ reason, line }) => [reason, line])).toEqual([
                ['breakpoint', 6],
                ['step', 7],
                ['step', 8],
                ['step', 9]
            ]);
        });

        it('steps into a call, and out of it to the line that made it', () => {
            const engine = create();
            const client = attach(engine, [() => 'stepIn', () => 'stepIn', () => 'stepOut', () => 'stepOver']);
            client.engineDebugger.setBreakpoints('main.js', [7]);

            engine.evaluate(program, 'main.js');

            expect(client.stops.map(({ reason, line, depth }) => [reason, line, depth])).toEqual([
                ['breakpoint', 7, 2],
                ['step', 2, 3],
                ['step', 3, 3],
                ['step', 7, 2],
                ['step', 8, 2]
            ]);
        });

        it('steps over the end of a function into its caller', () => {
            const engine = create();
            const client = attach(engine, [() => 'stepOver', () => 'stepOver']);
            client.engineDebugger.setBreakpoints('main.js', [3]);

            engine.evaluate(program, 'main.js');

            expect(client.stops.slice(0, 3).map(({ line, depth }) => [line, depth])).toEqual([
                [3, 3],
                [7, 2],
                [8, 2]
            ]);
        });
    });

    describe('scopes', () => {
        const valuesOf = (debug: EngineDebugger, handle: ScriptHandle): Record<string, ScriptValue> =>
            Object.fromEntries(debug.properties(handle).properties.map(({ name, value }) => [name, value]));

        it('reads a frame’s locals, the variables it closes over and the global object', () => {
            const engine = create();
            let locals: Record<string, ScriptValue> = {};
            let closure: Record<string, ScriptValue> = {};
            let outerLocals: Record<string, ScriptValue> = {};
            let globalHasMarker = false;
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    const local = debug.scope(0, 'local');
                    const closed = debug.scope(0, 'closure');
                    const outer = debug.scope(1, 'local');
                    const global = debug.scope(0, 'global');
                    locals = valuesOf(debug, local);
                    closure = valuesOf(debug, closed);
                    outerLocals = valuesOf(debug, outer);
                    globalHasMarker = debug.properties(global).properties.some(({ name }) => name === 'marker');
                    for (const handle of [local, closed, outer, global]) engine.free(handle);
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('scope.js', [5]);

            engine.evaluate(
                [
                    'globalThis.marker = 1;',
                    'function outer(seed) {',
                    '    const factor = 10;',
                    '    function inner(x) {',
                    '        const scaled = x * factor;',
                    '        let later;',
                    '        return scaled + seed;',
                    '    }',
                    '    return inner(seed + 1);',
                    '}',
                    'outer(4);'
                ].join('\n'),
                'scope.js'
            );

            expect(locals).toEqual({ x: 5 });
            expect(closure).toMatchObject({ factor: 10, seed: 4 });
            expect(outerLocals).toMatchObject({ seed: 4, factor: 10 });
            expect(outerLocals.inner).toBeInstanceOf(ScriptHandle);
            expect(globalHasMarker).toBe(true);
        });

        it('describes objects, arrays, functions and errors without running their code', () => {
            const engine = create();
            const described: Record<string, unknown> = {};
            let accessorRead = false;
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    const scope = debug.scope(0, 'local');
                    for (const { name, value } of debug.properties(scope).properties) {
                        if (value instanceof ScriptHandle) {
                            described[name] = debug.describe(value);
                            if (name === 'object') {
                                const own = debug.properties(value).properties;
                                accessorRead = own.some((property) => property.name === 'loud' && !property.accessor);
                                described.objectKeys = own.map((property) => [property.name, property.accessor]);
                            }
                            engine.free(value);
                        }
                    }
                    engine.free(scope);
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('values.js', [8]);

            engine.evaluate(
                [
                    'class Point { constructor() { this.x = 1; } }',
                    'function f() {',
                    '    const object = { a: 1, get loud() { throw new Error("read"); } };',
                    '    const list = [1, 2, 3];',
                    '    const point = new Point();',
                    '    const error = new TypeError("bad");',
                    '    const fn = function named() {};',
                    '    return [object, list, point, error, fn];',
                    '}',
                    'f();'
                ].join('\n'),
                'values.js'
            );

            expect(described).toMatchObject({
                object: { kind: 'object', name: 'Object' },
                list: { kind: 'array', name: 'Array', detail: 3 },
                point: { kind: 'object', name: 'Point' },
                error: { kind: 'error', name: 'TypeError', detail: 'bad' },
                fn: { kind: 'function', name: 'named' },
                objectKeys: [
                    ['a', false],
                    ['loud', true]
                ]
            });
            expect(accessorRead).toBe(false);
        });

        it('pages through an array’s elements', () => {
            const engine = create();
            let page: unknown;
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    const list = debug.evaluate(0, 'list');
                    if (list instanceof ScriptHandle) {
                        page = debug.properties(list, 2, 3);
                        engine.free(list);
                    }
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('page.js', [2]);

            engine.evaluate('const list = [0, 1, 2, 3, 4, 5, 6];\nlist.length;', 'page.js');

            expect(page).toEqual({
                total: 8,
                properties: [
                    { name: '2', accessor: false, value: 2 },
                    { name: '3', accessor: false, value: 3 },
                    { name: '4', accessor: false, value: 4 }
                ]
            });
        });
    });

    describe('evaluation', () => {
        it('reads and writes a stopped frame’s variables, captured or not', () => {
            const engine = create();
            const results: ScriptValue[] = [];
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    results.push(debug.evaluate(0, 'a + b + bonus'));
                    results.push(debug.evaluate(0, 'a = 100; bonus = 1000; a'));
                    results.push(debug.evaluate(1, 'base'));
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('eval.js', [4]);

            const result = engine.evaluate(
                [
                    'function run(base) {',
                    '    let bonus = 5;',
                    '    function add(a, b) {',
                    '        return a + b + bonus;',
                    '    }',
                    '    return add(base, 2);',
                    '}',
                    'run(1);'
                ].join('\n'),
                'eval.js'
            );

            expect(results).toEqual([8, 100, 1]);
            expect(result).toBe(1102);
        });

        it('keeps a copy of an uncaptured variable in a closure the evaluation makes', () => {
            const engine = create();
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    debug.evaluate(0, 'globalThis.peek = () => local');
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('closure.js', [3]);

            engine.evaluate(
                'function f() {\n    let local = 1;\n    local = 2;\n    local = 3;\n}\nf();',
                'closure.js'
            );

            expect(engine.evaluate('peek()')).toBe(1);
        });

        it('reports what an evaluation throws, and the script goes on', () => {
            const engine = create();
            const errors: unknown[] = [];
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    for (const source of ['missing.name', 'throw new RangeError("no")', '(']) {
                        try {
                            debug.evaluate(0, source);
                        } catch (error) {
                            errors.push(error instanceof ScriptError ? [error.scriptName, error.scriptMessage] : error);
                        }
                    }
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('throws.js', [2]);

            expect(engine.evaluate('let x = 1;\nx + 1;', 'throws.js')).toBe(2);
            expect(errors).toEqual([
                ['ReferenceError', "'missing' is not defined"],
                ['RangeError', 'no'],
                ['SyntaxError', "unexpected token in expression: ''"]
            ]);
        });

        it('stops an evaluation that never ends, and leaves the script’s step counts as they were', () => {
            const work = 'let n = 0;\nfor (let i = 0; i < 200000; i++) { n += i; }\nn;';
            const plain = create();
            plain.evaluate(work, 'work.js');
            const expected = plain.stats().callbackSteps;

            const engine = create();
            let caught: unknown;
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    try {
                        debug.evaluate(0, 'while (true) {}');
                    } catch (error) {
                        caught = error;
                    }
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('work.js', [1]);

            expect(engine.evaluate(work, 'work.js')).toBe(plain.evaluate('n'));
            expect(caught).toBeInstanceOf(ScriptTerminatedError);
            expect(client.stops).toHaveLength(1);
            expect(engine.stats().callbackSteps).toBe(expected);
        });

        it('evaluates at the global level with frame -1, with no script running', () => {
            const engine = create();
            const client = attach(engine, []);
            engine.evaluate('globalThis.answer = 42;');

            expect(client.engineDebugger.evaluate(-1, 'answer')).toBe(42);
            expect(client.engineDebugger.frames()).toEqual([]);
        });
    });

    describe('exceptions', () => {
        it('stops on a thrown value only while asked to, caught or not, and the throw goes on', () => {
            const engine = create();
            const seen: ScriptValue[] = [];
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    const exception = debug.exception();
                    seen.push(exception instanceof ScriptHandle ? debug.describe(exception).detail : exception);
                    if (exception instanceof ScriptHandle) engine.free(exception);
                    return 'continue';
                },
                ({ debugger: debug }) => {
                    seen.push(debug.exception());
                    return 'continue';
                }
            ]);
            const source =
                'function f() {\n    try { throw new Error("caught"); } catch (e) {}\n    throw "uncaught";\n}\nf();';

            expect(() => engine.evaluate(source, 'exc.js')).toThrow(ScriptError);
            expect(client.stops).toEqual([]);

            client.engineDebugger.setStopOnException(true);
            let caught: unknown;
            try {
                engine.evaluate(source, 'exc.js');
            } catch (error) {
                caught = error;
            }

            expect(client.stops.map(({ reason, line }) => [reason, line])).toEqual([
                ['exception', 2],
                ['exception', 3]
            ]);
            expect(seen).toEqual(['caught', 'uncaught']);
            expect(caught).toMatchObject({ scriptMessage: 'uncaught' });
            expect(client.engineDebugger.exception()).toBeUndefined();
        });

        it('never stops on the uncatchable error that ends a script out of steps', () => {
            const engine = create();
            const client = attach(engine, []);
            client.engineDebugger.setStopOnException(true);
            engine.setBudget({ perCallback: 2 });

            expect(() => engine.evaluate('while (true) {}')).toThrow(ScriptTerminatedError);
            expect(client.stops).toEqual([]);
        });
    });

    describe('pausing and detaching', () => {
        it('pauses a script that never ends at a poll, and terminates it', () => {
            const engine = create();
            const client = attach(engine, [() => 'terminate'], 1000);
            client.onPoll = () => {
                if (client.polls === 3) client.engineDebugger.pause();
            };

            expect(() => engine.evaluate('let i = 0;\nwhile (true) {\n    i++;\n}', 'spin.js')).toThrow(
                ScriptTerminatedError
            );
            expect(client.polls).toBe(3);
            expect(client.stops.map(({ reason }) => reason)).toEqual(['pause']);
            expect(engine.evaluate('1 + 1')).toBe(2);
        });

        it('pauses the next script at its first line when asked between calls', () => {
            const engine = create();
            const client = attach(engine, []);
            client.engineDebugger.pause();

            engine.evaluate('\nconst a = 1;\na;', 'next.js');

            expect(client.stops.map(({ reason, line }) => [reason, line])).toEqual([['pause', 2]]);
        });

        it('detaches while stopped, and the script runs on with nothing watching', () => {
            const engine = create();
            const client = attach(engine, [
                ({ debugger: debug }) => {
                    debug.detach();
                    return 'continue';
                }
            ]);
            client.engineDebugger.setBreakpoints('main.js', [2]);

            expect(engine.evaluate(program, 'main.js')).toBe(5);
            expect(client.stops).toHaveLength(1);
            expect(client.engineDebugger.isAttached).toBe(false);
            expect(() => engine.attachDebugger(client)).not.toThrow();
        });

        it('takes the same steps with a debugger attached as without one', () => {
            const work = 'let n = 0;\nfor (let i = 0; i < 300000; i++) { n += i % 7; }\nn;';
            const plain = create();
            plain.evaluate(work, 'steps.js');
            const watched = create();
            const client = attach(watched, [() => 'stepOver', () => 'continue'], 50);
            client.engineDebugger.setBreakpoints('steps.js', [1]);
            watched.evaluate(work, 'steps.js');

            expect(client.stops.length).toBeGreaterThan(0);
            expect(client.polls).toBeGreaterThan(0);
            expect(watched.stats().callbackSteps).toBe(plain.stats().callbackSteps);
            expect(watched.stats().steps).toBe(plain.stats().steps);
        });
    });
});
