import { ScriptError, ScriptOutOfMemoryError, ScriptTerminatedError } from '@jsprismarine/errors/script-host';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptEngine, ScriptEngineOptions, ScriptHostLibrary } from './ScriptEngine';
import { loadLibrary, scriptHostAvailable } from './testing/library.test-utils';
import { ScriptHandle } from './values';

describe.skipIf(!scriptHostAvailable())('a script engine', () => {
    // Loading runs in a hook, which a skipped suite never runs, so a missing library skips the file.
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const engines: ScriptEngine[] = [];
    const create = (options?: ScriptEngineOptions): ScriptEngine => {
        const engine = library.createEngine(options);
        engines.push(engine);
        return engine;
    };
    afterEach(() => {
        for (const engine of engines.splice(0)) engine.destroy();
    });

    describe('evaluation', () => {
        it('returns a script’s completion value', () => {
            const engine = create();

            expect(engine.evaluate('1 + 2')).toBe(3);
            expect(engine.evaluate('"h" + "é"')).toBe('hé');
            expect(engine.evaluate('[1, 2].length === 2')).toBe(true);
            expect(engine.evaluate('undefined')).toBeUndefined();
            expect(engine.evaluate('null')).toBeNull();
        });

        it('returns an object as a handle the host reads through', () => {
            const engine = create();
            const object = engine.evaluate('({ answer: 42 })');

            expect(object).toBeInstanceOf(ScriptHandle);
            if (!(object instanceof ScriptHandle)) return;
            expect(engine.get(object, 'answer')).toBe(42);
            engine.free(object);
        });

        it('keeps state between evaluations in one engine', () => {
            const engine = create();
            engine.evaluate('globalThis.count = 1');
            engine.evaluate('count += 1');

            expect(engine.evaluate('count')).toBe(2);
        });

        it('reports an uncaught error with its name, message and stack', () => {
            const engine = create();

            let caught: unknown;
            try {
                engine.evaluate('function fail() { throw new RangeError("too far"); }\nfail();', 'pack/main.js');
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(ScriptError);
            expect(caught).toMatchObject({ scriptName: 'RangeError', scriptMessage: 'too far' });
            expect(caught instanceof ScriptError ? caught.scriptStack : '').toContain('pack/main.js');
        });

        it('stops a thrown value whose toString never returns, and still reports the throw', () => {
            const engine = create();

            expect(() => engine.evaluate('throw { toString() { for (;;) {} } };')).toThrow(ScriptError);
            expect(engine.evaluate('1 + 1')).toBe(2);
        });

        it('keeps the description whole when a getter on the error calls the host', () => {
            const engine = create();
            let calls = 0;
            engine.defineGlobalFunction('host', () => {
                calls++;
                return undefined;
            });

            expect(() =>
                engine.evaluate(
                    'const error = new TypeError("first"); Object.defineProperty(error, "message", { get() { host(); return "late"; } }); throw error;'
                )
            ).toThrow(expect.objectContaining({ scriptName: 'TypeError', scriptMessage: '' }));
            expect(calls).toBe(0);
        });

        it('runs a module and loads what it imports through the loader', () => {
            const requested: string[] = [];
            const engine = create({
                loadModule: (name) => {
                    requested.push(name);
                    return name === 'lib/math.js' ? 'export const double = (n) => n * 2;' : undefined;
                }
            });
            const namespace = engine.evaluateModule(
                'lib/main.js',
                'import { double } from "./math.js"; export const result = double(21);'
            );

            expect(engine.get(namespace, 'result')).toBe(42);
            expect(requested).toEqual(['lib/math.js']);
            engine.free(namespace);
        });

        it('rejects an import the loader does not know', () => {
            const engine = create({ loadModule: () => undefined });

            expect(() => engine.evaluateModule('main.js', 'import "@minecraft/unknown";')).toThrow(
                /Could not find module '@minecraft\/unknown'/
            );
        });

        it('runs promise jobs only when the host asks', () => {
            const engine = create();
            engine.evaluate(
                'globalThis.order = []; Promise.resolve().then(() => order.push("job")); order.push("sync");'
            );

            expect(engine.evaluate('order.join()')).toBe('sync');
            expect(engine.runJobs()).toBe(1);
            expect(engine.evaluate('order.join()')).toBe('sync,job');
        });

        it('reports a promise job that ran out of steps as terminated', () => {
            const engine = create();
            engine.setBudget({ perCallback: 5 });
            engine.evaluate('Promise.resolve().then(() => { while (true) {} });');

            expect(() => engine.runJobs()).toThrow(
                expect.objectContaining({ scriptName: 'InternalError', scriptMessage: 'interrupted' })
            );
            expect(() => engine.runJobs()).not.toThrow();
        });
    });

    describe('contexts', () => {
        it('gives each context a global object of its own', () => {
            const engine = create();
            const second = engine.createContext();
            engine.evaluate('globalThis.owner = "first"; Array.prototype.marked = true');

            expect(engine.inContext(second, () => engine.evaluate('typeof owner + " " + typeof [].marked'))).toBe(
                'undefined undefined'
            );
            expect(engine.evaluate('owner')).toBe('first');
        });

        it('runs the host function a script calls in that script’s context', () => {
            const engine = create();
            const second = engine.createContext();
            engine.inContext(second, () => {
                engine.evaluate('globalThis.owner = "second"');
                engine.defineGlobalFunction('ownerOfCaller', () => engine.evaluate('owner'));
            });
            engine.evaluate('globalThis.owner = "first"');

            expect(engine.inContext(second, () => engine.evaluate('ownerOfCaller()'))).toBe('second');
        });

        it('throws a host error in the realm of the script that called, whichever context is current', () => {
            const engine = create();
            const second = engine.createContext();
            const probe = engine.inContext(second, () => {
                engine.defineGlobalFunction('fail', () => {
                    throw new TypeError('refused');
                });
                return engine.evaluate(
                    '() => { try { fail(); } catch (error) { return [error instanceof TypeError, error.message].join(); } }'
                );
            });
            if (!(probe instanceof ScriptHandle)) throw new Error('the probe is a function');

            expect(engine.call(probe, undefined)).toBe('true,refused');
            engine.free(probe);
        });

        it("runs one context's promise jobs and leaves the others queued in their order", () => {
            const engine = create();
            const second = engine.createContext();
            engine.evaluate('globalThis.log = []');
            const log = engine.global();
            engine.evaluate('Promise.resolve().then(() => log.push("first 1"))');
            engine.inContext(second, () => {
                engine.set(engine.global(), 'log', engine.get(log, 'log'));
                engine.evaluate('Promise.resolve().then(() => log.push("second"))');
            });
            engine.evaluate('Promise.resolve().then(() => log.push("first 2"))');

            expect(engine.runJobs(second)).toBe(1);
            expect(engine.evaluate('log.join()')).toBe('second');
            expect(engine.runJobs()).toBe(2);
            expect(engine.evaluate('log.join()')).toBe('second,first 1,first 2');
            engine.free(log);
        });

        it('loads a module from an object the host gives, telling the loader which context imports it', () => {
            const contexts: number[] = [];
            let exports: ScriptHandle | undefined;
            const engine = create({
                loadModule: (name, context) => {
                    contexts.push(context);
                    return name === 'host:values' ? exports : undefined;
                }
            });
            const second = engine.createContext();
            engine.inContext(second, () => {
                const made = engine.evaluate('({ answer: 42, name: "values" })');
                if (made instanceof ScriptHandle) exports = made;
                engine.free(
                    engine.evaluateModule(
                        'main.js',
                        'import { answer, name } from "host:values"; globalThis.read = answer + name;'
                    )
                );
            });

            expect(contexts).toEqual([second]);
            expect(engine.inContext(second, () => engine.evaluate('read'))).toBe('42values');
            if (exports !== undefined) engine.free(exports);
        });
    });

    describe('host calls', () => {
        it('returns a host function’s value to the script, one host call per call', () => {
            const engine = create();
            const seen: unknown[][] = [];
            engine.defineGlobalFunction('add', (a, b) => {
                seen.push([a, b]);
                return Number(a) + Number(b);
            });

            expect(engine.evaluate('add(1, 2) + add(10, 20)')).toBe(33);
            expect(seen).toEqual([
                [1, 2],
                [10, 20]
            ]);
            expect(engine.stats().hostCalls).toBe(2);
        });

        it('copies only the bytes of the arguments and the result', () => {
            const engine = create();
            engine.defineGlobalFunction('echo', (text) => text);
            engine.evaluate('echo("abcd")');

            // A count of one, a string tag, a four-byte length and four bytes; the result is the string alone.
            expect(engine.stats()).toMatchObject({ bytesToHost: 4 + 1 + 4 + 4, bytesFromHost: 1 + 4 + 4 });
        });

        it('passes an object as a handle that lasts for the call', () => {
            const engine = create();
            let kept: ScriptHandle | undefined;
            engine.defineGlobalFunction('keep', (object) => {
                if (object instanceof ScriptHandle) kept = engine.duplicate(object);
                return undefined;
            });
            const before = engine.stats().handles;
            engine.evaluate('keep({ name: "zombie" })');

            expect(kept).toBeDefined();
            if (kept === undefined) return;
            expect(engine.get(kept, 'name')).toBe('zombie');
            expect(engine.stats().handles).toBe(before + 1);
            engine.free(kept);
            expect(engine.stats().handles).toBe(before);
        });

        it('frees a handle a host function released once the script has its result', () => {
            const engine = create();
            engine.defineGlobalFunction('pair', (callback) => {
                const made = engine.evaluate('[1, 2]');
                if (!(made instanceof ScriptHandle)) throw new TypeError('An array literal evaluated to a primitive');
                // A nested call into the script must not free the handle before it is returned.
                if (callback instanceof ScriptHandle) {
                    const inner = engine.call(callback, undefined);
                    if (inner instanceof ScriptHandle) engine.free(inner);
                }
                return engine.release(made);
            });
            const before = engine.stats().handles;

            expect(
                engine.evaluate('let sum = 0; for (let i = 0; i < 100; i++) sum += pair(() => pair())[1]; sum')
            ).toBe(200);
            expect(engine.stats().handles).toBe(before);
        });

        it('lets a host function call back into the script it serves', () => {
            const engine = create();
            engine.defineGlobalFunction('twice', (callback) => {
                if (!(callback instanceof ScriptHandle)) throw new TypeError('twice needs a function');
                const once = engine.call(callback, undefined, 1);
                return engine.call(callback, undefined, Number(once));
            });

            expect(engine.evaluate('twice((n) => n + 10)')).toBe(21);
            expect(engine.stats().hostCalls).toBe(1);
        });

        it('throws a host function’s error into the script with its class and message', () => {
            const engine = create();
            engine.defineGlobalFunction('fail', () => {
                throw new RangeError('out of range');
            });

            expect(
                engine.evaluate(
                    'try { fail(); } catch (error) { (error instanceof RangeError) + " " + error.name + ": " + error.message }'
                )
            ).toBe('true RangeError: out of range');
        });

        it('grows the transfer buffer for a value larger than it', () => {
            const engine = create({ bufferSize: 64 });
            engine.defineGlobalFunction('length', (text) => String(text).length);

            expect(engine.evaluate('length("x".repeat(10000))')).toBe(10000);
            expect(engine.evaluate('"y".repeat(5000)')).toBe('y'.repeat(5000));
        });
    });

    describe('the step budget', () => {
        const spin = (budget: number): number => {
            const engine = create();
            engine.setBudget({ perCallback: budget });
            expect(() => engine.evaluate('let i = 0; while (true) { i++; }')).toThrow(ScriptTerminatedError);
            return engine.stats().callbackSteps;
        };

        it('stops `while (true)` at the step past the budget on every run', () => {
            expect([spin(50), spin(50), spin(50)]).toEqual([51, 51, 51]);
        });

        it('stops a loop that catches, because the termination is uncatchable', () => {
            const engine = create();
            engine.setBudget({ perCallback: 5 });

            expect(() => engine.evaluate('try { while (true) {} } catch { globalThis.caught = true; }')).toThrow(
                /InternalError: interrupted/
            );
            expect(engine.stats().callbackSteps).toBe(6);
            expect(engine.evaluate('globalThis.caught')).toBeUndefined();
        });

        it('counts the same steps for the same work, whatever ran before', () => {
            const loop = 'let n = 0; for (let i = 0; i < 2000000; i++) n += i;';
            const fresh = create();
            fresh.evaluate(loop);
            const used = fresh.stats().callbackSteps;

            const busy = create();
            busy.evaluate('for (let i = 0; i < 12345; i++) {}');
            busy.evaluate(loop);

            expect(used).toBeGreaterThan(0);
            expect(busy.stats().callbackSteps).toBe(used);
        });

        it('charges every callback in a tick to the tick’s budget', () => {
            const loop = 'for (let i = 0; i < 1000000; i++) {}';
            const probe = create();
            probe.evaluate(loop);
            const perLoop = probe.stats().callbackSteps;

            const engine = create();
            engine.setBudget({ perTick: perLoop + perLoop / 2 });
            engine.beginTick();
            engine.evaluate(loop);
            expect(() => engine.evaluate(loop)).toThrow(ScriptTerminatedError);

            engine.beginTick();
            expect(() => engine.evaluate(loop)).not.toThrow();
        });

        it('stops a script whose host call ran out of budget in a nested entry', () => {
            const engine = create();
            engine.setBudget({ perCallback: 20 });
            engine.defineGlobalFunction('run', (callback) => {
                if (callback instanceof ScriptHandle) {
                    try {
                        engine.call(callback, undefined);
                    } catch {
                        // The termination still stops the script that called the host.
                    }
                }
                return undefined;
            });

            expect(() =>
                engine.evaluate('try { run(() => { while (true) {} }); globalThis.after = true; } catch {}')
            ).toThrow(ScriptTerminatedError);
            expect(engine.evaluate('globalThis.after')).toBeUndefined();
        });

        it('leaves the engine usable after a termination', () => {
            const engine = create();
            engine.setBudget({ perCallback: 3 });
            expect(() => engine.evaluate('while (true) {}')).toThrow(ScriptTerminatedError);

            expect(engine.evaluate('6 * 7')).toBe(42);
        });
    });

    describe('limits', () => {
        it('stops a script that allocates past the memory limit and counts the refusal', () => {
            const engine = create({ memoryLimit: 4 * 1024 * 1024 });

            // The block scope lets the arrays go once the script stops. A top-level `const` would
            // stay a global binding and hold them, so the next script would run out of memory too.
            expect(() =>
                engine.evaluate('{ const chunks = []; while (true) chunks.push(new Array(1024).fill(0)); }')
            ).toThrow(ScriptOutOfMemoryError);
            expect(engine.stats().memoryLimitHits).toBeGreaterThan(0);
            expect(engine.evaluate('1 + 1')).toBe(2);
        });

        it('survives running out of memory while it writes the stack of the error it throws', () => {
            // Each limit fails a different allocation. Across these, one is the string for the
            // stack of the out-of-memory error, whose failure freed that error before
            // quickjs-backtrace-oom.patch, and the stack was then written to freed memory.
            const source = `function down(n) { return n > 0 ? down(n - 1) : grow(); }
                function grow() { const chunks = []; while (true) chunks.push(new Array(16).fill(0)); }
                let stack;
                try { down(40); } catch (error) { stack = error.stack; }
                typeof stack === 'string' ? 'a string' : String(stack)`;
            const outcomes = new Set<unknown>();
            for (let memoryLimit = 256 * 1024; memoryLimit < 260 * 1024; memoryLimit += 8) {
                const engine = library.createEngine({ memoryLimit });
                try {
                    outcomes.add(engine.evaluate(source));
                } catch (error) {
                    if (!(error instanceof ScriptOutOfMemoryError)) throw error;
                    outcomes.add('out of memory');
                } finally {
                    engine.destroy();
                }
            }

            for (const outcome of outcomes) expect(['a string', 'null', 'out of memory']).toContain(outcome);
        });

        it('counts a stack overflow even when the script catches it', () => {
            const engine = create();

            expect(
                engine.evaluate(
                    'function down() { down(); } try { down(); } catch (error) { error.name + ": " + error.message }'
                )
            ).toBe('InternalError: stack overflow');
            expect(engine.stats().stackOverflows).toBe(1);
        });

        it('reports an uncaught stack overflow as a script error', () => {
            const engine = create();

            expect(() => engine.evaluate('function down() { down(); } down();')).toThrow(
                /InternalError: stack overflow/
            );
            expect(engine.stats().stackOverflows).toBe(1);
        });

        it('reaches the same depth on every run with the same stack size', () => {
            const depth = (): unknown => {
                const engine = create({ stackSize: 128 * 1024 });
                return engine.evaluate('let n = 0; function down() { n++; down(); } try { down(); } catch {} n');
            };

            expect(depth()).toBe(depth());
        });
    });

    it('frees every handle with the engine', () => {
        const engine = library.createEngine();
        engine.evaluate('({})');
        engine.global();
        engine.destroy();

        expect(() => engine.evaluate('1')).toThrow(/destroyed/);
    });
});
