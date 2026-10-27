import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevToolsRelay } from './DevToolsRelay';

// Decode external CDP JSON at the boundary; individual tests check the fields they consume.
const object = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected a CDP object');
    }
    return value as Record<string, unknown>;
};

const connect = async (url: string) => {
    const socket = new WebSocket(url);
    const pending = new Map<
        number,
        { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
    >();
    const listeners = new Map<string, (params: Record<string, unknown>) => void>();
    let nextId = 0;
    socket.addEventListener('message', ({ data }) => {
        const message = object(JSON.parse(String(data)));
        if (typeof message.id === 'number') {
            const request = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
            else request?.resolve(object(message.result));
        } else if (typeof message.method === 'string') {
            listeners.get(message.method)?.(object(message.params));
        }
    });
    socket.addEventListener('close', () => {
        for (const request of pending.values()) request.reject(new Error('Inspector disconnected'));
        pending.clear();
    });
    await once(socket, 'open');
    return {
        send(method: string, params: Record<string, unknown> = {}) {
            return new Promise<Record<string, unknown>>((resolve, reject) => {
                const id = ++nextId;
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        event(method: string) {
            return new Promise<Record<string, unknown>>((resolve) => {
                listeners.set(method, (params) => {
                    listeners.delete(method);
                    resolve(params);
                });
            });
        },
        close() {
            socket.close();
        }
    };
};

const startInspectorTarget = async (generation: string) => {
    const child = spawn(
        process.execPath,
        [
            '--input-type=module',
            '--eval',
            `
            import * as inspector from 'node:inspector';
            inspector.open(0, '127.0.0.1');
            process.stdout.write(inspector.url() + '\\n');
            globalThis.generation = ${JSON.stringify(generation)};
            setInterval(() => {}, 1000);
        `
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const lines = createInterface({ input: child.stdout! });
    const [endpointUrl] = await once(lines, 'line');
    lines.close();
    return {
        child,
        endpointUrl: String(endpointUrl),
        async stop() {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const exited = once(child, 'exit');
            child.kill('SIGKILL');
            await exited;
        }
    };
};

describe('DevTools relay across watched server restarts', () => {
    it('keeps one CDP connection open and attaches it to the next inspector', async () => {
        const relay = new DevToolsRelay();
        let client: Awaited<ReturnType<typeof connect>> | undefined;
        let first: Awaited<ReturnType<typeof startInspectorTarget>> | undefined;
        let second: Awaited<ReturnType<typeof startInspectorTarget>> | undefined;
        try {
            await relay.start();
            const frontend = new URL(relay.frontendUrl);
            expect(frontend.protocol).toBe('https:');
            expect(frontend.searchParams.get('ws')).toBe(
                new URL(relay.endpointUrl).host + new URL(relay.endpointUrl).pathname
            );
            first = await startInspectorTarget('first');
            relay.setTarget(first.endpointUrl);
            client = await connect(relay.endpointUrl);
            await client.send('Runtime.enable');
            const original = await client.send('Runtime.evaluate', {
                expression: 'globalThis.generation',
                returnByValue: true
            });
            expect(object(original.result).value).toBe('first');

            await first.stop();
            second = await startInspectorTarget('second');
            relay.setTarget(second.endpointUrl);
            const logged = client.event('Runtime.consoleAPICalled');
            const restarted = await client.send('Runtime.evaluate', {
                expression: 'console.log(globalThis.generation); globalThis.generation',
                returnByValue: true
            });
            expect(object(restarted.result).value).toBe('second');
            const event = await logged;
            expect(event.type).toBe('log');
            expect(event.args).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'second' })]));
        } finally {
            client?.close();
            await Promise.all([first?.stop(), second?.stop(), relay.close()]);
        }
    });
});

describe('DevTools over an external Node inspector connection', () => {
    let child: ReturnType<typeof spawn>;
    let client: Awaited<ReturnType<typeof connect>>;
    let frontendUrl: string;

    beforeEach(async () => {
        // A separate process is essential: a same-thread inspector cannot test real pauses.
        child = spawn(
            process.execPath,
            [
                '--import',
                import.meta.resolve('tsx'),
                '--input-type=module',
                '--eval',
                `
            import { openDevTools } from ${JSON.stringify(new URL('./DevTools.ts', import.meta.url).href)};
            import { Logger } from ${JSON.stringify(import.meta.resolve('@jsprismarine/logger'))};
            import { createDevToolsLogTransport } from ${JSON.stringify(new URL('./DevTools.ts', import.meta.url).href)};
            const session = openDevTools();
            process.stdout.write(JSON.stringify({ endpoint: session.endpointUrl, frontend: session.frontendUrl }) + '\\n');
            session.waitForDebugger();
            globalThis.devtoolsReady = true;
            globalThis.devtoolsLogger = new Logger('debug', [createDevToolsLogTransport()]);
            setInterval(() => {}, 1000);
        `
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const lines = createInterface({ input: child.stdout! });
        const [line] = await once(lines, 'line');
        lines.close();
        const urls = object(JSON.parse(line));
        expect(urls.endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//);
        expect(new URL(String(urls.frontend)).searchParams.get('ws')).toBe(String(urls.endpoint).slice(5));
        frontendUrl = String(urls.frontend);
        client = await connect(String(urls.endpoint));
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
    });

    afterEach(async () => {
        client?.close();
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill('SIGKILL');
            await exited;
        }
    });

    const start = async () => {
        await client.send('Runtime.runIfWaitingForDebugger');
        // Command processing and the resumed JavaScript run on separate scheduling paths.
        await expect
            .poll(async () => {
                const response = await client.send('Runtime.evaluate', {
                    expression: 'globalThis.devtoolsReady',
                    returnByValue: true
                });
                return object(response.result).value;
            })
            .toBe(true);
    };

    it('waits for the debugger before continuing initialization', async () => {
        const before = await client.send('Runtime.evaluate', {
            expression: 'typeof globalThis.devtoolsReady',
            returnByValue: true
        });
        expect(object(before.result).value).toBe('undefined');
        await start();
    });

    it('prints a browser-safe frontend URL for the inspector endpoint', async () => {
        const frontend = new URL(frontendUrl);
        expect(frontend.protocol).toBe('https:');
        expect(frontend.searchParams.get('ws')).toMatch(/^127\.0\.0\.1:\d+\//);
    });

    it('forwards console API output through the inspector protocol', async () => {
        await start();
        const logged = client.event('Runtime.consoleAPICalled');
        await client.send('Runtime.evaluate', { expression: 'console.log("devtools-console-probe")' });
        const event = await logged;
        expect(event.type).toBe('log');
        expect(event.args).toEqual(
            expect.arrayContaining([expect.objectContaining({ value: 'devtools-console-probe' })])
        );
    });

    it('forwards JSPrismarine log records to the DevTools Console', async () => {
        await start();
        const logged = client.event('Runtime.consoleAPICalled');
        await client.send('Runtime.evaluate', {
            expression: 'globalThis.devtoolsLogger.info("devtools-logger-probe")'
        });
        const event = await logged;
        expect(event.type).toBe('info');
        expect(event.args).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: expect.stringContaining('devtools-logger-probe') })
            ])
        );
    });

    it.each([undefined, 'value === 7'])(
        'hits line breakpoints with condition %s, inspects locals, and steps',
        async (condition) => {
            await start();
            await client.send('Runtime.evaluate', {
                expression: `
            globalThis.probe = function probe(value) {
                const doubled = value * 2;
                return doubled + 1;
            };
            //# sourceURL=jsprismarine-devtools-probe.js
        `
            });
            const breakpoint = await client.send('Debugger.setBreakpointByUrl', {
                url: 'jsprismarine-devtools-probe.js',
                lineNumber: 3,
                condition
            });
            expect(breakpoint.locations).not.toEqual([]);
            if (condition) {
                const skipped = await client.send('Runtime.evaluate', { expression: 'probe(2)', returnByValue: true });
                expect(object(skipped.result).value).toBe(5);
            }
            const paused = client.event('Debugger.paused');
            const evaluated = client.send('Runtime.evaluate', { expression: 'probe(7)', returnByValue: true });
            const pause = await paused;
            expect(pause.hitBreakpoints).toContain(breakpoint.breakpointId);
            const frames = pause.callFrames;
            if (!Array.isArray(frames)) throw new Error('Missing paused call frames');
            const frame = object(frames[0]);
            const local = await client.send('Debugger.evaluateOnCallFrame', {
                callFrameId: frame.callFrameId,
                expression: 'doubled',
                returnByValue: true
            });
            expect(object(local.result).value).toBe(14);
            const stepped = client.event('Debugger.paused');
            await client.send('Debugger.stepOver');
            await stepped;
            await client.send('Debugger.resume');
            expect(object((await evaluated).result).value).toBe(15);
            await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
            const unpaused = await client.send('Runtime.evaluate', { expression: 'probe(7)', returnByValue: true });
            expect(object(unpaused.result).value).toBe(15);
        }
    );

    it.each(['beforeScriptExecution', 'beforeScriptWithSourceMapExecution'])(
        'hits %s instrumentation breakpoints',
        async (instrumentation) => {
            await start();
            const breakpoint = await client.send('Debugger.setInstrumentationBreakpoint', { instrumentation });
            const paused = client.event('Debugger.paused');
            const map = Buffer.from(
                JSON.stringify({ version: 3, sources: ['probe.ts'], names: [], mappings: 'AAAA' })
            ).toString('base64');
            const evaluated = client.send('Runtime.evaluate', {
                expression: `globalThis.instrumented = 42;\n//# sourceURL=instrumented.js\n//# sourceMappingURL=data:application/json;base64,${map}`
            });
            expect((await paused).reason).toBe('instrumentation');
            await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
            await client.send('Debugger.resume');
            await evaluated;
            const result = await client.send('Runtime.evaluate', { expression: 'instrumented', returnByValue: true });
            expect(object(result.result).value).toBe(42);
        }
    );

    it('pauses on function calls and caught exceptions', async () => {
        await start();
        const fn = await client.send('Runtime.evaluate', {
            expression: 'globalThis.callProbe = () => 42'
        });
        const breakpoint = await client.send('Debugger.setBreakpointOnFunctionCall', {
            objectId: object(fn.result).objectId
        });
        const callPaused = client.event('Debugger.paused');
        const called = client.send('Runtime.evaluate', { expression: 'callProbe()', returnByValue: true });
        expect((await callPaused).hitBreakpoints).toContain(breakpoint.breakpointId);
        await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
        await client.send('Debugger.resume');
        expect(object((await called).result).value).toBe(42);

        await client.send('Debugger.setPauseOnExceptions', { state: 'all' });
        const exceptionPaused = client.event('Debugger.paused');
        const evaluated = client.send('Runtime.evaluate', { expression: 'try { throw new Error("probe"); } catch {}' });
        expect((await exceptionPaused).reason).toBe('exception');
        await client.send('Debugger.setPauseOnExceptions', { state: 'none' });
        await client.send('Debugger.resume');
        await evaluated;
    });

    it('captures CPU profiles and heap allocation samples', async () => {
        await start();
        await client.send('Profiler.enable');
        await client.send('Profiler.start');
        await client.send('HeapProfiler.enable');
        await client.send('HeapProfiler.startSampling', { samplingInterval: 1024 });
        await client.send('Runtime.evaluate', {
            expression: 'globalThis.allocations = Array.from({ length: 10000 }, (_, i) => ({ i, text: String(i) }))'
        });
        const cpu = object((await client.send('Profiler.stop')).profile);
        expect(cpu.nodes).not.toEqual([]);
        expect(object((await client.send('HeapProfiler.stopSampling')).profile).head).toBeDefined();
        const chunk = client.event('HeapProfiler.addHeapSnapshotChunk');
        await client.send('HeapProfiler.takeHeapSnapshot');
        expect((await chunk).chunk).toEqual(expect.any(String));
    });
});
