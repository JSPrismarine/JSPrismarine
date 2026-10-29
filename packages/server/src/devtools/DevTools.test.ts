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
            globalThis.generation = ${JSON.stringify(generation)};
            inspector.open(0, '127.0.0.1');
            process.stdout.write(inspector.url() + '\\n');
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
    let outputLines: ReturnType<typeof createInterface>;

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
            import { createInterface } from 'node:readline';
            const session = openDevTools();
            process.stdout.write(JSON.stringify({ endpoint: session.endpointUrl, frontend: session.frontendUrl }) + '\\n');
            createInterface({ input: process.stdin }).on('line', (url) => {
                void import(url).then(
                    () => process.stdout.write('probe-complete\\n'),
                    (error) => process.stdout.write('probe-error:' + String(error) + '\\n')
                );
            });
            session.waitForDebugger();
            globalThis.devtoolsReady = true;
            globalThis.devtoolsLogger = new Logger('debug', [createDevToolsLogTransport()]);
            setInterval(() => {}, 1000);
        `
            ],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        );
        outputLines = createInterface({ input: child.stdout! });
        const [line] = await once(outputLines, 'line');
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
        outputLines?.close();
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
            .poll(
                async () => {
                    const response = await client.send('Runtime.evaluate', {
                        expression: 'globalThis.devtoolsReady',
                        returnByValue: true
                    });
                    return object(response.result).value;
                },
                { timeout: 5000 }
            )
            .toBe(true);
    };

    const importModule = (source: string) => {
        const finished = once(outputLines, 'line').then(([line]) => line);
        const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
        child.stdin!.write(`${url}\n`);
        return finished;
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
            const probeSource = `
globalThis.probe = function probe(value) {
    const doubled = value * 2;
    return doubled + 1;
};
//# sourceURL=jsprismarine-devtools-probe.js
`;
            expect(await importModule(probeSource)).toBe('probe-complete');
            const breakpoint = await client.send('Debugger.setBreakpointByUrl', {
                url: 'jsprismarine-devtools-probe.js',
                lineNumber: 3,
                condition
            });
            expect(breakpoint.locations).not.toEqual([]);
            if (condition) {
                const skippedPaused = client.event('Debugger.paused');
                const skippedEvaluation = importModule('globalThis.probeResult = globalThis.probe(2);');
                const skippedOutcome = await Promise.race([
                    skippedPaused.then((params) => ({ type: 'paused' as const, params })),
                    skippedEvaluation.then((result) => ({ type: 'evaluated' as const, result }))
                ]);
                if (skippedOutcome.type !== 'evaluated') {
                    throw new Error('Conditional breakpoint paused for a value that did not match');
                }
                expect(skippedOutcome.result).toBe('probe-complete');
                const skipped = await client.send('Runtime.evaluate', {
                    expression: 'probeResult',
                    returnByValue: true
                });
                expect(object(skipped.result).value).toBe(5);
            }
            const paused = client.event('Debugger.paused');
            const evaluated = importModule('globalThis.probeResult = globalThis.probe(7);');
            const outcome = await Promise.race([
                paused.then((params) => ({ type: 'paused' as const, params })),
                evaluated.then((result) => ({ type: 'evaluated' as const, result }))
            ]);
            if (outcome.type !== 'paused')
                throw new Error('Conditional line breakpoint did not pause on a matching value');
            const pause = outcome.params;
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
            const stepOutcome = await Promise.race([
                stepped.then((params) => ({ type: 'paused' as const, params })),
                evaluated.then((result) => ({ type: 'evaluated' as const, result }))
            ]);
            if (stepOutcome.type !== 'paused')
                throw new Error('Debugger step-over completed without pausing on the next line');
            await client.send('Debugger.resume');
            expect(await evaluated).toBe('probe-complete');
            await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
            expect(
                await importModule('globalThis.probeResult = globalThis.probe(7); globalThis.probeAfterRemoval = true;')
            ).toBe('probe-complete');
            const unpaused = await client.send('Runtime.evaluate', { expression: 'probeResult', returnByValue: true });
            expect(object(unpaused.result).value).toBe(15);
            const afterRemoval = await client.send('Runtime.evaluate', {
                expression: 'probeAfterRemoval',
                returnByValue: true
            });
            expect(object(afterRemoval.result).value).toBe(true);
        }
    );

    it.each(['beforeScriptExecution', 'beforeScriptWithSourceMapExecution'])(
        'hits %s instrumentation breakpoints',
        async (instrumentation) => {
            await start();
            const map = Buffer.from(
                JSON.stringify({ version: 3, sources: ['probe.ts'], names: [], mappings: 'AAAA' })
            ).toString('base64');
            const source = [
                'globalThis.instrumented = 42;',
                '//# sourceURL=instrumented.js',
                ...(instrumentation === 'beforeScriptWithSourceMapExecution'
                    ? [`//# sourceMappingURL=data:application/json;base64,${map}`]
                    : [])
            ].join('\n');
            const paused = client.event('Debugger.paused');
            const breakpoint = await client.send('Debugger.setInstrumentationBreakpoint', { instrumentation });
            const probeFinished = importModule(source);
            const outcome = await Promise.race([
                paused.then((params) => ({ type: 'paused' as const, params })),
                probeFinished.then((line) => ({ type: 'finished' as const, line }))
            ]);
            if (outcome.type !== 'paused')
                throw new Error(`Probe completed without an instrumentation pause: ${outcome.line}`);
            expect(outcome.params.reason).toBe('instrumentation');
            await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
            await client.send('Debugger.resume');
            expect(await probeFinished).toBe('probe-complete');
            const result = await client.send('Runtime.evaluate', { expression: 'instrumented', returnByValue: true });
            expect(object(result.result).value).toBe(42);
        }
    );

    it('pauses on function calls and caught exceptions', async () => {
        await start();
        expect(await importModule('globalThis.callProbe = () => 42;')).toBe('probe-complete');
        const fn = await client.send('Runtime.evaluate', { expression: 'callProbe' });
        const breakpoint = await client.send('Debugger.setBreakpointOnFunctionCall', {
            objectId: object(fn.result).objectId
        });
        const callPaused = client.event('Debugger.paused');
        const called = importModule('globalThis.callResult = globalThis.callProbe();');
        const callOutcome = await Promise.race([
            callPaused.then((params) => ({ type: 'paused' as const, params })),
            called.then((result) => ({ type: 'evaluated' as const, result }))
        ]);
        if (callOutcome.type !== 'paused')
            throw new Error('Function call breakpoint did not pause before the call completed');
        expect(callOutcome.params.hitBreakpoints).toContain(breakpoint.breakpointId);
        await client.send('Debugger.removeBreakpoint', { breakpointId: breakpoint.breakpointId });
        await client.send('Debugger.resume');
        expect(await called).toBe('probe-complete');
        const callResult = await client.send('Runtime.evaluate', { expression: 'callResult', returnByValue: true });
        expect(object(callResult.result).value).toBe(42);

        await client.send('Debugger.setPauseOnExceptions', { state: 'all' });
        const exceptionPaused = client.event('Debugger.paused');
        const evaluated = importModule('try { throw new Error("probe"); } catch {}');
        const exceptionOutcome = await Promise.race([
            exceptionPaused.then((params) => ({ type: 'paused' as const, params })),
            evaluated.then((result) => ({ type: 'evaluated' as const, result }))
        ]);
        if (exceptionOutcome.type !== 'paused') throw new Error('Debugger did not pause on the caught exception');
        expect(exceptionOutcome.params.reason).toBe('exception');
        await client.send('Debugger.setPauseOnExceptions', { state: 'none' });
        await client.send('Debugger.resume');
        expect(await evaluated).toBe('probe-complete');
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
