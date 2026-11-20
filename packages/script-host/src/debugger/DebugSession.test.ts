import { DebuggerConnectionError } from '@jsprismarine/errors/script-host';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { isRecord } from '../isRecord';
import type { ScriptEngine, ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable } from '../testing/library.test-utils';
import { ScriptDebugSession } from './DebugSession';
import type { DebuggerChannel, DebugSessionOptions } from './DebugSession';
import { DEBUGGER_PROTOCOL_VERSION, DIAGNOSTICS_TABS } from './protocol';
import type { DebuggerEvent, HostMessage } from './protocol';

/** One turn of the fake extension: it runs when the session waits with nothing left to read. */
type Turn = (extension: FakeExtension) => void;

/**
 * Plays the VS Code extension over a channel, with no socket and no clock. When the session waits
 * for a message and none is queued, the next scripted turn queues more; with no turns left the
 * connection closes. Each turn can read every answer the session sent before it.
 */
class FakeExtension implements DebuggerChannel {
    public readonly sent: HostMessage[] = [];
    private readonly turns: Turn[];
    private readonly inbox: unknown[] = [];
    /** Messages the extension sent while a script ran, which arrive at the next poll. */
    public readonly whileRunning: unknown[] = [];
    private seq = 100;
    /** Set once the extension has gone away. Messages queued before then still arrive. */
    public closed = false;

    public constructor(turns: Turn[]) {
        this.turns = turns;
    }

    public send(message: HostMessage): void {
        this.sent.push(message);
    }

    public receive(): unknown {
        while (this.inbox.length === 0) {
            const turn = this.turns.shift();
            if (turn === undefined) {
                this.closed = true;
                return undefined;
            }
            turn(this);
        }
        return this.inbox.shift();
    }

    public poll(): unknown {
        return this.whileRunning.shift() ?? this.inbox.shift();
    }

    /** Goes away between the session's reads, as a closed socket does. */
    public disconnect(): void {
        this.closed = true;
    }

    /** Queues a message for the session. */
    public queue(message: unknown): void {
        this.inbox.push(message);
    }

    /** Queues a forwarded request, as `Session.makeRequestPayload` builds one, and returns its seq. */
    public request(command: string, args: Record<string, unknown> = {}): number {
        const request_seq = this.seq++;
        this.queue({ type: 'request', request: { request_seq, command, args } });
        return request_seq;
    }

    /** The response to a request, by its seq. */
    public response(seq: number): Extract<HostMessage, { type: 'response' }> {
        const found = this.sent.find(
            (message): message is Extract<HostMessage, { type: 'response' }> =>
                message.type === 'response' && message.request_seq === seq
        );
        if (found === undefined) throw new Error(`No response to request ${seq}`);
        return found;
    }

    /** The body of a response, which a test reads as the extension's handlers do. */
    public body(seq: number): unknown {
        return this.response(seq).body;
    }

    /** The events the session sent, in order. */
    public events(): DebuggerEvent[] {
        return this.sent.flatMap((message) => (message.type === 'event' ? [message.event] : []));
    }
}

const plugin = { name: 'Debug Pack', module_uuid: '4f2b6b3a-0000-4000-8000-000000000001' };

/** The extension's answer to the protocol event, as `onConnectionComplete` sends it. */
const accept =
    (fields: Record<string, unknown> = {}): Turn =>
    (extension) =>
        extension.queue({
            type: 'protocol',
            version: DEBUGGER_PROTOCOL_VERSION,
            target_module_uuid: plugin.module_uuid,
            ...fields
        });

/** The configuration VS Code sends after the extension's InitializedEvent, ending with `resume`. */
const configure =
    (breakpoints: Record<string, number[]>, stopOnException = false): Turn =>
    (extension) => {
        for (const [path, lines] of Object.entries(breakpoints))
            extension.request('setBreakpoints', { path, breakpoints: lines });
        extension.queue({ type: 'stopOnException', stopOnException });
        extension.queue({ type: 'resume' });
    };

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null);

const program = [
    'function add(a, b) {', // 1
    '    const sum = a + b;', // 2
    '    return sum;', // 3
    '}', // 4
    'const list = [10, 20];', // 5
    'const total = add(list[0], list[1]);', // 6
    'total;' // 7
].join('\n');

describe('the debugger protocol handshake', () => {
    const handshake = (turns: Turn[], options: Partial<DebugSessionOptions> = {}) => {
        const extension = new FakeExtension(turns);
        const session = new ScriptDebugSession(extension, { plugins: [plugin], ...options });
        return { extension, session };
    };

    it('offers protocol 11 and the plugins, and returns the picked target', () => {
        const { extension, session } = handshake([accept({ target_module_uuid: plugin.module_uuid.toUpperCase() })]);

        expect(session.handshake()).toBe(plugin.module_uuid);
        expect(extension.sent[0]).toEqual({
            type: 'event',
            event: { type: 'ProtocolEvent', version: 11, plugins: [plugin] }
        });
    });

    it('asks for a passcode when one is set, and refuses a wrong one with BDS’s message', () => {
        const right = handshake([accept({ passcode: 'hunter2' })], { passcode: 'hunter2' });
        expect(right.session.handshake()).toBe(plugin.module_uuid);
        expect(right.extension.events()[0]).toMatchObject({ require_passcode: true });

        const wrong = handshake([accept({ passcode: 'guess' })], { passcode: 'hunter2' });
        expect(() => wrong.session.handshake()).toThrow(/^Debugger connection failed, passcode mismatch\.$/);
    });

    it('refuses another protocol version and a target that is not a plugin, with BDS’s messages', () => {
        expect(() => handshake([accept({ version: 10 })]).session.handshake()).toThrow(
            'Debugger connection failed, protocol version mismatch.'
        );
        expect(() => handshake([accept({ target_module_uuid: 'nope' })]).session.handshake()).toThrow(
            'Debugger connection failed, no plugin found with targetModuleUUID [nope] (see launch.json).'
        );
    });

    it('fails when the extension leaves before it answers', () => {
        expect(() => handshake([]).session.handshake()).toThrow(DebuggerConnectionError);
    });

    it('offers the protocol without waiting, and the handshake that follows does not offer it again', () => {
        const { extension, session } = handshake([accept()]);

        session.offer();
        session.offer();
        expect(extension.events().map((event) => event.type)).toEqual(['ProtocolEvent']);
        expect(session.handshake()).toBe(plugin.module_uuid);
        expect(extension.events().map((event) => event.type)).toEqual(['ProtocolEvent', 'SchemaEvent']);
    });

    it('describes BDS’s diagnostics tabs once the handshake passes, and ends a refused one quietly', () => {
        const { extension, session } = handshake([accept({ passcode: 'wrong' })], { passcode: 'right' });

        expect(() => session.handshake()).toThrow(DebuggerConnectionError);
        session.detach();
        // A refused session closes with no schema and no `terminated`.
        expect(extension.events().map((event) => event.type)).toEqual(['ProtocolEvent']);

        const passed = handshake([accept()]);
        passed.session.handshake();
        expect(passed.extension.events()[1]).toEqual({ type: 'SchemaEvent', descriptors: DIAGNOSTICS_TABS });
        expect(DIAGNOSTICS_TABS.map((tab) => tab.stat_group_id)).toEqual([
            'client_frame_timings',
            'client_memory',
            'scripting_engine'
        ]);
    });
});

describe.skipIf(!scriptHostAvailable())('a debugger session', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const engines: ScriptEngine[] = [];
    afterEach(() => {
        for (const engine of engines.splice(0)) engine.destroy();
    });

    const start = (turns: Turn[], options: Partial<DebugSessionOptions> = {}) => {
        const engine = library.createEngine();
        engines.push(engine);
        const extension = new FakeExtension(turns);
        const session = new ScriptDebugSession(extension, { plugins: [plugin], ...options });
        session.handshake();
        session.attach(engine);
        return { engine, extension, session };
    };

    it('verifies breakpoints, reports a stop, and answers stackTrace, scopes, variables and evaluate', () => {
        let breakpointsSeq = 0;
        let traceSeq = 0;
        let scopesSeq = 0;
        let localsSeq = 0;
        let listSeq = 0;
        let evaluateSeq = 0;
        const { engine, extension } = start([
            accept(),
            (ext) => {
                breakpointsSeq = ext.request('setBreakpoints', { path: 'main.js', breakpoints: [2] });
                ext.queue({ type: 'resume' });
            },
            (ext) => {
                traceSeq = ext.request('stackTrace', { threadId: 1 });
                scopesSeq = ext.request('scopes', { frameId: 0 });
                evaluateSeq = ext.request('evaluate', { expression: '[a, b, a * b]', frameId: 0, context: 'repl' });
            },
            (ext) => {
                const scopes = ext.body(scopesSeq);
                const local = isRecordArray(scopes) ? scopes[0]?.reference : undefined;
                localsSeq = ext.request('variables', { variablesReference: local });
                const evaluated = ext.body(evaluateSeq);
                const reference =
                    typeof evaluated === 'object' && evaluated !== null && 'variablesReference' in evaluated
                        ? evaluated.variablesReference
                        : undefined;
                listSeq = ext.request('variables', {
                    variablesReference: reference,
                    filter: 'indexed',
                    start: 1,
                    count: 2
                });
                ext.request('continue', { threadId: 1 });
            }
        ]);

        expect(engine.evaluate(program, 'main.js')).toBe(30);

        expect(extension.body(breakpointsSeq)).toEqual({ breakpoints: [{ verified: true }] });
        expect(extension.events()).toContainEqual({ type: 'ThreadEvent', reason: 'new', thread: 1 });
        expect(extension.events()).toContainEqual({ type: 'StoppedEvent', reason: 'breakpoint', thread: 1 });
        expect(extension.body(traceSeq)).toEqual([
            { id: 0, name: 'add', filename: 'main.js', line: 2, column: 17 },
            { id: 1, name: '<eval>', filename: 'main.js', line: 6, column: 18 }
        ]);
        expect(extension.body(scopesSeq)).toEqual([
            { name: 'Local', reference: 1, expensive: false },
            { name: 'Closure', reference: 2, expensive: false },
            { name: 'Global', reference: 3, expensive: true }
        ]);
        expect(extension.body(localsSeq)).toEqual([
            { name: 'a', value: '10', type: 'number', variablesReference: 0 },
            { name: 'b', value: '20', type: 'number', variablesReference: 0 }
        ]);
        expect(extension.body(evaluateSeq)).toEqual({
            result: 'Array(3)',
            type: 'Array',
            variablesReference: expect.any(Number),
            indexedVariables: 3
        });
        expect(extension.body(listSeq)).toEqual([
            { name: '1', value: '20', type: 'number', variablesReference: 0 },
            { name: '2', value: '200', type: 'number', variablesReference: 0 }
        ]);
        expect(engine.stats().handles).toBe(0);
    });

    it('reads a scope afresh for each variables request, so it shows what an evaluation wrote', () => {
        const seqs: number[] = [];
        const { engine, extension } = start([
            accept(),
            configure({ 'scope.js': [3] }),
            (ext) => {
                ext.request('scopes', { frameId: 0 });
                seqs.push(ext.request('variables', { variablesReference: 1 }));
                ext.request('evaluate', { expression: 'x = 2', frameId: 0 });
                seqs.push(ext.request('variables', { variablesReference: 1 }));
                ext.request('continue', { threadId: 1 });
            }
        ]);

        expect(engine.evaluate('function f() {\n    let x = 1;\n    return x;\n}\nf();', 'scope.js')).toBe(2);
        expect(seqs.map((seq) => extension.body(seq))).toEqual([
            [{ name: 'x', value: '1', type: 'number', variablesReference: 0 }],
            [{ name: 'x', value: '2', type: 'number', variablesReference: 0 }]
        ]);
        expect(engine.stats().handles).toBe(0);
    });

    it('pages a sparse array’s indices and its named properties apart, by name', () => {
        const seqs: number[] = [];
        let evaluateSeq = 0;
        const { engine, extension } = start([
            accept(),
            configure({ 'sparse.js': [4] }),
            (ext) => {
                evaluateSeq = ext.request('evaluate', { expression: 'list', frameId: 0 });
            },
            (ext) => {
                const evaluated = ext.body(evaluateSeq);
                const reference =
                    typeof evaluated === 'object' && evaluated !== null && 'variablesReference' in evaluated
                        ? evaluated.variablesReference
                        : undefined;
                seqs.push(
                    ext.request('variables', { variablesReference: reference, filter: 'indexed', start: 0, count: 50 })
                );
                seqs.push(ext.request('variables', { variablesReference: reference, filter: 'named' }));
                seqs.push(
                    ext.request('variables', { variablesReference: reference, filter: 'named', start: 1, count: 1 })
                );
                seqs.push(ext.request('variables', { variablesReference: reference, start: 1, count: 1 }));
                ext.request('continue', { threadId: 1 });
            }
        ]);

        engine.evaluate("const list = [];\nlist[100] = 'x';\nlist.label = 'y';\nlist.length;", 'sparse.js');

        expect(seqs.map((seq) => extension.body(seq))).toEqual([
            [{ name: '100', value: '"x"', type: 'string', variablesReference: 0 }],
            [
                { name: 'length', value: '101', type: 'number', variablesReference: 0 },
                { name: 'label', value: '"y"', type: 'string', variablesReference: 0 }
            ],
            [{ name: 'label', value: '"y"', type: 'string', variablesReference: 0 }],
            // Without a filter, the page counts every name: the index, then length, then label.
            [{ name: 'length', value: '101', type: 'number', variablesReference: 0 }]
        ]);
        expect(engine.stats().handles).toBe(0);
    });

    it('steps with next, stepIn and stepOut, reporting each stop as a step', () => {
        const lines: unknown[] = [];
        const trace = (ext: FakeExtension, then: string): void => {
            const seq = ext.request('stackTrace', { threadId: 1 });
            ext.request(then, { threadId: 1 });
            lines.push(seq);
        };
        const { engine, extension } = start([
            accept(),
            configure({ 'main.js': [5] }),
            (ext) => trace(ext, 'next'),
            (ext) => trace(ext, 'stepIn'),
            (ext) => trace(ext, 'stepOut'),
            (ext) => trace(ext, 'continue')
        ]);

        engine.evaluate(program, 'main.js');

        const tops = lines.map((seq) => {
            const frames = typeof seq === 'number' ? extension.body(seq) : undefined;
            return isRecordArray(frames) ? [frames[0]?.name, frames[0]?.line] : undefined;
        });
        expect(tops).toEqual([
            ['<eval>', 5],
            ['<eval>', 6],
            ['add', 2],
            ['<eval>', 6]
        ]);
        expect(
            extension
                .events()
                .filter((event) => event.type === 'StoppedEvent')
                .map((event) => (event.type === 'StoppedEvent' ? event.reason : ''))
        ).toEqual(['breakpoint', 'step', 'step', 'step']);
    });

    it('stops on a thrown value when asked, and shows it as <exception> in the innermost frame', () => {
        let localsSeq = 0;
        const { engine, extension } = start([
            accept(),
            configure({}, true),
            (ext) => {
                localsSeq = ext.request('variables', { variablesReference: 1 });
                ext.request('scopes', { frameId: 0 });
            },
            (ext) => {
                localsSeq = ext.request('variables', { variablesReference: 1 });
                ext.request('continue', { threadId: 1 });
            }
        ]);

        expect(engine.evaluate('try {\n    throw new RangeError("far");\n} catch (e) {}\n"done";', 'throw.js')).toBe(
            'done'
        );

        expect(extension.events()).toContainEqual({ type: 'StoppedEvent', reason: 'exception', thread: 1 });
        expect(extension.body(localsSeq)).toContainEqual({
            name: '<exception>',
            value: 'RangeError: far',
            type: 'RangeError',
            variablesReference: expect.any(Number)
        });
    });

    it('pauses a running script on a pause request that arrives at a poll', () => {
        let evaluateSeq = 0;
        const { engine, extension } = start(
            [
                accept(),
                configure({}),
                (ext) => {
                    evaluateSeq = ext.request('evaluate', { expression: 'i > 0', frameId: 0 });
                    ext.request('continue', { threadId: 1 });
                }
            ],
            { pollLines: 100 }
        );
        const pauseSeq = 999;
        extension.whileRunning.push({
            type: 'request',
            request: { request_seq: pauseSeq, command: 'pause', args: {} }
        });

        expect(engine.evaluate('let i = 0;\nwhile (i < 1000) {\n    i++;\n}\ni;', 'loop.js')).toBe(1000);

        expect(extension.response(pauseSeq)).toEqual({ type: 'response', request_seq: pauseSeq, body: undefined });
        expect(extension.events()).toContainEqual({ type: 'StoppedEvent', reason: 'pause', thread: 1 });
        expect(extension.body(evaluateSeq)).toEqual({
            result: 'true',
            type: 'boolean',
            variablesReference: 0
        });
    });

    it('lets the script run on when the extension goes away while it is stopped', () => {
        const { engine, session } = start([accept(), configure({ 'main.js': [2] })]);

        expect(engine.evaluate(program, 'main.js')).toBe(30);
        expect(session.closed).toBe(true);
    });

    /** Whether the engine stops nowhere and takes a new debugger, as one with none attached does. */
    const expectDetached = (engine: ScriptEngine, extension: FakeExtension): void => {
        expect(engine.evaluate(program, 'main.js')).toBe(30);
        expect(extension.events().filter((event) => event.type === 'StoppedEvent')).toEqual([]);
        const replacement = engine.attachDebugger({ paused: () => 'resume', poll: () => undefined });
        replacement.detach();
    };

    it('detaches when the extension goes away during its configuration', () => {
        const { engine, extension, session } = start([
            accept(),
            (ext) => ext.request('setBreakpoints', { path: 'main.js', breakpoints: [2] })
        ]);

        expect(session.closed).toBe(true);
        expectDetached(engine, extension);
    });

    it('detaches at the next poll when the extension goes away between stops', () => {
        const { engine, extension, session } = start([accept(), configure({ 'main.js': [2] })]);
        extension.disconnect();
        session.poll();

        expect(session.closed).toBe(true);
        expectDetached(engine, extension);
    });

    it('refuses requests that need a stopped script while none is, and debugger requests it does not know', () => {
        const { extension, session } = start([accept(), configure({})]);
        extension.queue({ type: 'request', request: { request_seq: 1, command: 'stackTrace', args: {} } });
        extension.queue({ type: 'debugger-request', request_seq: 2, request: 'get-stats', args: {} });
        session.poll();

        expect(extension.response(1)).toEqual({ type: 'response', request_seq: 1, error: 'No script is stopped' });
        expect(extension.sent).toContainEqual({
            type: 'debuggee-response',
            event: {
                type: 'debuggee-response',
                request_seq: 2,
                success: false,
                response_message: "JSPrismarine does not support the debugger request 'get-stats'."
            }
        });
    });

    it('hands commands to the host in both the flat shape and the nested one before protocol 8', () => {
        const commands: string[][] = [];
        const { extension, session } = start([accept(), configure({})], {
            runCommand: (command, dimension) => commands.push([command, dimension])
        });
        extension.queue({ type: 'minecraftCommand', command: 'time set day', dimension_type: 'overworld' });
        extension.queue({ type: 'minecraftCommand', command: { command: 'say hi', dimension_type: 'nether' } });
        session.poll();

        expect(commands).toEqual([
            ['time set day', 'overworld'],
            ['say hi', 'nether']
        ]);
    });

    it('takes breakpoints in the message form of the protocols before 6', () => {
        const { engine, extension } = start([
            accept(),
            (ext) => {
                ext.queue({ type: 'breakpoints', breakpoints: { path: 'main.js', breakpoints: [{ line: 3 }] } });
                ext.queue({ type: 'resume' });
            },
            (ext) => ext.request('continue', { threadId: 1 })
        ]);

        engine.evaluate(program, 'main.js');

        expect(extension.events()).toContainEqual({ type: 'StoppedEvent', reason: 'breakpoint', thread: 1 });
    });

    it('attaches to the context it is given, and stops only in that pack', () => {
        const engine = library.createEngine();
        engines.push(engine);
        const second = engine.createContext();
        const extension = new FakeExtension([accept(), configure({ 'main.js': [2] }), () => undefined]);
        const session = new ScriptDebugSession(extension, { plugins: [plugin] });
        session.handshake();
        session.attach(engine, second);

        expect(engine.evaluate(program, 'main.js')).toBe(30);
        expect(extension.events().filter((event) => event.type === 'StoppedEvent')).toEqual([]);

        expect(engine.inContext(second, () => engine.evaluate(program, 'main.js'))).toBe(30);
        expect(extension.events().filter((event) => event.type === 'StoppedEvent')).toEqual([
            { type: 'StoppedEvent', reason: 'breakpoint', thread: 1 }
        ]);
    });

    it('tells the extension the session terminated when it detaches, as BDS does, and stops stopping', () => {
        const { engine, extension, session } = start([accept(), configure({ 'main.js': [2] })]);
        session.detach();
        session.detach();

        expect(engine.evaluate(program, 'main.js')).toBe(30);
        expect(extension.events().filter((event) => event.type === 'terminated')).toEqual([{ type: 'terminated' }]);
        expect(extension.events().at(-1)).toEqual({ type: 'terminated' });
        expect(extension.events().filter((event) => event.type === 'StoppedEvent')).toEqual([]);
    });

    it('keeps the session across a new engine, as BDS does around /reload, with the same breakpoints', () => {
        const { engine, extension, session } = start([
            accept(),
            configure({ 'main.js': [2] }, true),
            (ext) => ext.request('continue', { threadId: 1 })
        ]);
        session.detachEngine();
        expect(engine.evaluate(program, 'main.js')).toBe(30);

        const reloaded = library.createEngine();
        engines.push(reloaded);
        // No turn is left for a second configuration: the attach does not wait for one.
        session.attach(reloaded);
        expect(session.closed).toBe(false);
        expect(reloaded.evaluate(program, 'main.js')).toBe(30);

        expect(
            extension
                .events()
                .filter((event) => event.type === 'ThreadEvent' || event.type === 'StoppedEvent')
                .map((event) => ('reason' in event ? event.reason : ''))
        ).toEqual(['new', 'exited', 'new', 'breakpoint']);
        expect(engine.stats().handles).toBe(0);
    });

    it('streams statistics only while it is attached to an engine', () => {
        const { extension, session } = start([accept(), configure({})]);
        const entities = [{ name: 'entities', should_aggregate: false, values: [3] }];
        session.stats(7, entities);
        session.detachEngine();
        session.stats(8, entities);
        session.detach();
        session.stats(9, entities);

        expect(extension.events().filter((event) => event.type === 'StatEvent2')).toEqual([
            { type: 'StatEvent2', tick: 7, stats: entities }
        ]);
    });

    it('profiles the stacks it finds at each poll, and sends them as a .cpuprofile when asked', () => {
        let now = 1_000;
        const { engine, extension, session } = start([accept(), configure({})], {
            pollLines: 100,
            profilerClock: () => (now += 10),
            toDebuggerPath: (file) => `pack/${file}`
        });
        // A stop with no profile running sends nothing.
        extension.queue({ type: 'stopProfiler', captures_path: '/captures' });
        extension.queue({ type: 'startProfiler', target_module_uuid: plugin.module_uuid });
        session.poll();
        const loop = ['function spin() {', '    let i = 0;', '    while (i < 1000) i++;', '}', 'spin();'].join('\n');
        engine.evaluate(loop, 'spin.js');
        extension.queue({ type: 'stopProfiler', captures_path: '/captures', target_module_uuid: plugin.module_uuid });
        extension.queue({ type: 'stopProfiler', captures_path: '/captures' });
        session.poll();

        const captures = extension.events().filter((event) => event.type === 'ProfilerCapture');
        expect(captures).toHaveLength(1);
        const [capture] = captures;
        if (capture?.type !== 'ProfilerCapture') throw new Error('no capture');
        expect(capture.capture_base_path).toBe('/captures');
        const profile: unknown = JSON.parse(Buffer.from(capture.capture_data, 'base64').toString('utf8'));
        expect(profile).toMatchObject({ startTime: 1_010, $vscode: { rootPath: '.', locations: [] } });
        if (!isRecord(profile) || !Array.isArray(profile.samples) || !Array.isArray(profile.nodes)) {
            throw new Error('not a profile');
        }
        // The loop runs about 2,000 lines, so the polls every 100 lines found it about 20 times.
        expect(profile.samples.length).toBeGreaterThanOrEqual(10);
        expect(profile.timeDeltas).toEqual(profile.samples.map(() => 10));
        expect(profile.endTime).toBe(1_010 + 10 * (profile.samples.length + 1));
        const names = profile.nodes.flatMap((node) =>
            isRecord(node) && isRecord(node.callFrame) ? [node.callFrame.functionName] : []
        );
        expect(names.slice(0, 1)).toEqual(['(root)']);
        expect(names).toContain('spin');
        const spin = profile.nodes.find(
            (node) => isRecord(node) && isRecord(node.callFrame) && node.callFrame.functionName === 'spin'
        );
        expect(spin).toMatchObject({ hitCount: profile.samples.length, callFrame: { url: 'pack/spin.js' } });
    });
});
