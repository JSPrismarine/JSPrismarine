import { EngineDebugger, PauseReason } from './debugger/EngineDebugger';
import type { DebuggerListener } from './debugger/EngineDebugger';
import { ScriptError, ScriptOutOfMemoryError, ScriptTerminatedError } from './errors';
import { bindLibrary } from './ffi';
import type { BoundLibrary, NativePointer, NativeSymbols } from './ffi';
import { NativeLibraryError, locateLibrary } from './library';
import { ScriptHandle, TransferBuffer, ValueReader, ValueWriter } from './values';
import type { ScriptValue } from './values';

/** The C interface version this binding speaks, `JSH_ABI_VERSION` in the header. */
export const ABI_VERSION = 3;

/** The `jsh_status` codes an entry returns instead of a handle or a count. */
const Status = { Thrown: -1, Terminated: -2, OutOfMemory: -3, Invalid: -4 } as const;

/** The `jsh_op` requests the engine sends its callback. */
const Op = { Call: 0, LoadModule: 1, Grow: 2, DebugPaused: 3, DebugPoll: 4 } as const;

/** The `jsh_stat` counters, by the field of {@link EngineStats} each fills. */
const Stat = {
    steps: 0,
    callbackSteps: 1,
    tickSteps: 2,
    hostCalls: 3,
    bytesToHost: 4,
    bytesFromHost: 5,
    stackOverflows: 6,
    memoryLimitHits: 7,
    memoryUsed: 8,
    handles: 9
} as const;

/**
 * An engine's counters. A step is one call of QuickJS's interrupt handler, which QuickJS makes once
 * every 10,000 of its polls at backward jumps and calls, so the same script takes the same steps on
 * every machine.
 */
export type EngineStats = { -readonly [Key in keyof typeof Stat]: number };

/** The bytes a new engine's transfer buffer starts with. It grows when a value needs more. */
export const DEFAULT_BUFFER_SIZE = 64 * 1024;

/**
 * The native stack a new engine's scripts may use, in bytes. A host callback runs on the same
 * stack, so this leaves room for Node.js's own frames under QuickJS's.
 */
export const DEFAULT_STACK_SIZE = 256 * 1024;

/** A function scripts call to reach the host. It runs synchronously and must not return a promise. */
export type HostFunction = (...args: ScriptValue[]) => ScriptValue;

/**
 * Returns a module for its normalized name: its source, or an object whose own enumerable
 * properties become its exports. Undefined when there is none.
 * @param name - The normalized module name.
 * @param context - The id of the context that imports it.
 */
export type ModuleLoader = (name: string, context: ScriptContextId) => string | ScriptHandle | undefined;

/** A context's id in its engine. The context an engine is created with is {@link DEFAULT_CONTEXT}. */
export type ScriptContextId = number;

/** The context an engine is created with. */
export const DEFAULT_CONTEXT: ScriptContextId = 0;

/** How {@link ScriptHostLibrary.createEngine} sets up an engine. */
export interface ScriptEngineOptions {
    /** The bytes the engine may allocate; going over stops the script. Unlimited when absent. */
    readonly memoryLimit?: number;
    /** The native stack, in bytes, past which a script gets `InternalError: stack overflow`. */
    readonly stackSize?: number;
    /** The transfer buffer's first size in bytes. */
    readonly bufferSize?: number;
    /** Supplies the source of each module a script imports. */
    readonly loadModule?: ModuleLoader;
}

/** How {@link ScriptEngine.attachDebugger} attaches a debugger. */
export interface DebuggerOptions {
    /**
     * How many lines a running script runs between {@link DebuggerListener.poll} calls, which let a
     * debugger pause a script that never ends. A count of lines, not a time, so a script polls at
     * the same lines every run. No polling when 0.
     */
    readonly pollLines?: number;
}

/** The lines between polls when {@link DebuggerOptions.pollLines} is absent. */
export const DEFAULT_POLL_LINES = 10_000;

/** How many steps one entry from the host, and one tick, may take. Unlimited when absent. */
export interface StepBudget {
    readonly perCallback?: number;
    readonly perTick?: number;
}

/** The script host's native library, bound for this thread. Engines run on the thread that loaded it. */
export class ScriptHostLibrary {
    private readonly bound: BoundLibrary;

    private constructor(bound: BoundLibrary) {
        this.bound = bound;
    }

    /**
     * Loads the library and checks that it speaks this binding's interface.
     * @param path - The library's file; {@link locateLibrary} finds it when absent.
     * @returns The bound library.
     * @throws {NativeLibraryError} When there is no library, or it speaks another interface.
     */
    public static load(path: string = locateLibrary()): ScriptHostLibrary {
        const bound = bindLibrary(path);
        const version = bound.symbols.jsh_abi_version();
        if (version !== ABI_VERSION) {
            bound.close();
            throw new NativeLibraryError(
                `${path} has interface version ${version}, and this binding speaks ${ABI_VERSION}`
            );
        }
        return new ScriptHostLibrary(bound);
    }

    /**
     * Creates an engine: one QuickJS runtime and context, with the globals BDS lacks removed and
     * `Function` from a string refused.
     * @param options - Its limits and module loader.
     * @returns The engine.
     * @throws {Error} When the engine cannot be created.
     */
    public createEngine(options: ScriptEngineOptions = {}): ScriptEngine {
        return new ScriptEngine(this.bound, options);
    }

    /** Unloads the library. Destroy its engines first. */
    public close(): void {
        this.bound.close();
    }
}

/**
 * One script engine: a QuickJS runtime and context in native memory, its values held by handle.
 * Every method runs synchronously on the thread that created the engine.
 */
export class ScriptEngine {
    private readonly bound: BoundLibrary;
    private readonly native: NativeSymbols;
    private readonly pointer: NativePointer;
    private readonly callback: NativePointer;
    private readonly buffer: TransferBuffer;
    private readonly functions = new Map<number, HostFunction>();
    private readonly loadModule: ModuleLoader | undefined;
    private nextFunctionId = 1;
    private debuggerListener: DebuggerListener | undefined;
    /** How many callbacks from the engine are running. */
    private active = 0;
    private destroyed = false;

    /** Use {@link ScriptHostLibrary.createEngine}. */
    public constructor(bound: BoundLibrary, options: ScriptEngineOptions) {
        this.bound = bound;
        this.native = bound.symbols;
        this.loadModule = options.loadModule;
        // The engine is created after the buffer, so the first growth can only come later.
        let engine: NativePointer = 0n;
        this.buffer = new TransferBuffer(options.bufferSize ?? DEFAULT_BUFFER_SIZE, (memory) =>
            this.native.jsh_engine_set_buffer(engine, bound.pointerOf(memory), memory.byteLength)
        );
        this.callback = bound.registerHostCallback((op, id, length) => this.onHost(op, id, length));
        engine = this.native.jsh_engine_create(
            this.callback,
            bound.pointerOf(this.buffer.memory),
            this.buffer.capacity,
            options.memoryLimit ?? 0,
            options.stackSize ?? DEFAULT_STACK_SIZE
        );
        if (engine === 0n) {
            bound.unregisterHostCallback(this.callback);
            throw new Error('The script engine could not be created');
        }
        this.pointer = engine;
    }

    /**
     * Runs a classic script.
     * @param source - The script's text.
     * @param name - The file name its stack traces show.
     * @returns Its completion value. A handle in it belongs to the caller, who frees it.
     * @throws {ScriptError} When the script throws, runs out of steps or goes over the memory limit.
     */
    public evaluate(source: string, name = '<eval>'): ScriptValue {
        const text = Buffer.from(`${source}\0`, 'utf8');
        return this.take(this.check(this.native.jsh_eval_script(this.live(), name, text, text.length - 1)));
    }

    /**
     * Runs a module, loading each module it imports through the engine's module loader.
     * @param name - The module's name, which relative imports resolve against.
     * @param source - The module's text.
     * @returns A handle to the module's namespace, which the caller frees.
     * @throws {ScriptError} When the module or one it imports throws, or does not load.
     */
    public evaluateModule(name: string, source: string): ScriptHandle {
        const text = Buffer.from(`${source}\0`, 'utf8');
        return new ScriptHandle(this.check(this.native.jsh_eval_module(this.live(), name, text, text.length - 1)));
    }

    /**
     * Runs pending promise jobs until none is left, in the order they were queued.
     * @param context - Runs only this context's jobs, leaving the others queued. Every context's when absent.
     * @returns How many jobs ran.
     * @throws {ScriptError} When a job throws; the jobs after it stay pending.
     */
    public runJobs(context?: ScriptContextId): number {
        return this.check(this.native.jsh_run_jobs(this.live(), context ?? -1));
    }

    /**
     * Creates another context in the engine: a global object of its own, with the same limits as
     * the first. The current context stays as it was.
     * @returns The new context's id.
     * @throws {ScriptOutOfMemoryError} When the engine cannot make it.
     */
    public createContext(): ScriptContextId {
        return this.check(this.native.jsh_context_create(this.live()));
    }

    /**
     * Makes a context current, so evaluations, the global object and new host functions are its.
     * While a script calls the host, the calling script's context is current.
     * @returns The context that was current before.
     * @throws {RangeError} When the engine has no such context.
     */
    public useContext(context: ScriptContextId): ScriptContextId {
        return this.check(this.native.jsh_context_select(this.live(), context));
    }

    /**
     * Runs a function with a context current, and makes the one before current again after it.
     * @returns What the function returned.
     */
    public inContext<Result>(context: ScriptContextId, run: () => Result): Result {
        const previous = this.useContext(context);
        try {
            return run();
        } finally {
            this.useContext(previous);
        }
    }

    /**
     * Calls a script function.
     * @param fn - The function.
     * @param thisValue - Its `this`, or undefined.
     * @param args - Its arguments.
     * @returns What it returned. A handle in it belongs to the caller, who frees it.
     * @throws {ScriptError} When the function throws, runs out of steps or goes over the memory limit.
     */
    public call(fn: ScriptHandle, thisValue: ScriptHandle | undefined, ...args: ScriptValue[]): ScriptValue {
        const writer = new ValueWriter(this.buffer).list(args);
        return this.take(this.check(this.native.jsh_call(this.live(), fn.id, thisValue?.id ?? 0, writer.length)));
    }

    /** Returns a handle to the global object, which the caller frees. */
    public global(): ScriptHandle {
        return new ScriptHandle(this.check(this.native.jsh_global(this.live())));
    }

    /**
     * Reads a property, running a getter if it has one.
     * @returns The value. A handle in it belongs to the caller, who frees it.
     */
    public get(object: ScriptHandle, key: string): ScriptValue {
        return this.take(this.check(this.native.jsh_get(this.live(), object.id, key)));
    }

    /** Writes a property, running a setter if it has one. */
    public set(object: ScriptHandle, key: string, value: ScriptValue): void {
        const handle = value instanceof ScriptHandle ? value : this.make(value);
        try {
            this.check(this.native.jsh_set(this.live(), object.id, key, handle.id));
        } finally {
            if (handle !== value) this.free(handle);
        }
    }

    /**
     * Makes a script function that calls `fn` synchronously. Every call crosses into the host
     * once. A handle among its arguments lasts until `fn` returns; {@link duplicate} keeps one.
     * @param name - The function's `name`.
     * @param fn - What runs. An error it throws reaches the script with the same name and message.
     * @returns A handle to the function, which the caller frees.
     */
    public hostFunction(name: string, fn: HostFunction): ScriptHandle {
        const id = this.nextFunctionId++;
        this.functions.set(id, fn);
        return new ScriptHandle(this.check(this.native.jsh_host_function(this.live(), id, name, fn.length)));
    }

    /** Makes a host function and sets it on the global object under its name. */
    public defineGlobalFunction(name: string, fn: HostFunction): void {
        const global = this.global();
        const handle = this.hostFunction(name, fn);
        try {
            this.set(global, name, handle);
        } finally {
            this.free(handle);
            this.free(global);
        }
    }

    /** Returns a second handle to the same value, which outlives the first. */
    public duplicate(handle: ScriptHandle): ScriptHandle {
        return new ScriptHandle(this.check(this.native.jsh_dup(this.live(), handle.id)));
    }

    /** Releases a handle. The value lives on while the script still refers to it. */
    public free(handle: ScriptHandle): void {
        this.native.jsh_free(this.live(), handle.id);
    }

    /** Sets the step budget; the step past it stops the script with an uncatchable error. */
    public setBudget(budget: StepBudget): void {
        this.native.jsh_engine_set_budget(this.live(), budget.perCallback ?? 0, budget.perTick ?? 0);
    }

    /** Starts a tick, so the per-tick budget counts from 0 again. */
    public beginTick(): void {
        this.native.jsh_engine_begin_tick(this.live());
    }

    /**
     * Attaches a debugger. Functions the engine enters from now on report their lines; those
     * already running do not, so attach between calls into the engine. A replay never attaches one.
     * @param listener - Handles each stop and poll, on this thread.
     * @returns The debugger, which detaches with {@link EngineDebugger.detach}.
     * @throws {Error} When a debugger is already attached.
     */
    public attachDebugger(listener: DebuggerListener, options: DebuggerOptions = {}): EngineDebugger {
        if (this.debuggerListener !== undefined) throw new Error('A debugger is already attached to this engine');
        this.check(this.native.jsh_debug_attach(this.live(), options.pollLines ?? DEFAULT_POLL_LINES));
        this.debuggerListener = listener;
        return new EngineDebugger({
            native: this.native,
            buffer: this.buffer,
            pointer: () => this.live(),
            check: (result) => this.check(result),
            take: (handle) => this.take(handle),
            detached: () => {
                this.debuggerListener = undefined;
            }
        });
    }

    /** Reads the engine's counters. */
    public stats(): EngineStats {
        const pointer = this.live();
        const read = (stat: number): number => this.native.jsh_engine_stat(pointer, stat);
        return {
            steps: read(Stat.steps),
            callbackSteps: read(Stat.callbackSteps),
            tickSteps: read(Stat.tickSteps),
            hostCalls: read(Stat.hostCalls),
            bytesToHost: read(Stat.bytesToHost),
            bytesFromHost: read(Stat.bytesFromHost),
            stackOverflows: read(Stat.stackOverflows),
            memoryLimitHits: read(Stat.memoryLimitHits),
            memoryUsed: read(Stat.memoryUsed),
            handles: read(Stat.handles)
        };
    }

    /**
     * Frees the engine, its handles and its callback.
     * @throws {Error} When called from inside one of the engine's host functions.
     */
    public destroy(): void {
        if (this.destroyed) return;
        if (this.active > 0) throw new Error('A script engine cannot be destroyed while it calls the host');
        this.destroyed = true;
        this.native.jsh_engine_destroy(this.pointer);
        this.bound.unregisterHostCallback(this.callback);
        this.functions.clear();
    }

    private live(): NativePointer {
        if (this.destroyed) throw new Error('The script engine has been destroyed');
        return this.pointer;
    }

    /** Turns a negative status into the error the engine described. */
    private check(result: number): number {
        if (result >= 0) return result;
        if (result === Status.Invalid) throw new RangeError('The engine rejected a handle or a value');
        const reader = new ValueReader(this.buffer.bytes, this.buffer.capacity);
        const details = { scriptName: reader.string(), scriptMessage: reader.string(), scriptStack: reader.string() };
        if (result === Status.Terminated) throw new ScriptTerminatedError(details);
        if (result === Status.OutOfMemory) throw new ScriptOutOfMemoryError(details);
        throw new ScriptError(details);
    }

    /** Reads a result handle's value, freeing the handle unless the value is an object. */
    private take(handle: number): ScriptValue {
        const length = this.check(this.native.jsh_encode(this.pointer, handle));
        const value = new ValueReader(this.buffer.bytes, length).value();
        if (!(value instanceof ScriptHandle)) this.native.jsh_free(this.pointer, handle);
        return value;
    }

    /** Makes a handle for a value from its bytes. */
    private make(value: ScriptValue): ScriptHandle {
        const writer = new ValueWriter(this.buffer).value(value);
        return new ScriptHandle(this.check(this.native.jsh_decode(this.pointer, writer.length)));
    }

    /** The engine's one callback. It never throws: `node:ffi` callbacks must not. */
    private onHost(op: number, id: number, length: number): number {
        this.active++;
        try {
            if (op === Op.Grow) {
                this.buffer.reserve(length);
                return 0;
            }
            if (op === Op.Call) return this.dispatch(id, length);
            if (op === Op.LoadModule) return this.load(id, length);
            if (op === Op.DebugPaused) return this.paused(id);
            if (op === Op.DebugPoll) {
                this.debuggerListener?.poll();
                return 0;
            }
            throw new RangeError(`The engine sent an unknown request ${op}`);
        } catch (error) {
            return this.describe(error);
        } finally {
            this.active--;
        }
    }

    private dispatch(id: number, length: number): number {
        // The arguments leave the buffer first: the function may run script, which reuses it.
        const args = new ValueReader(this.buffer.bytes, length).list();
        const fn = this.functions.get(id);
        if (fn === undefined) throw new ReferenceError(`No host function has id ${id}`);
        const result = fn(...args);
        return new ValueWriter(this.buffer).value(result).length;
    }

    private paused(code: number): number {
        const reason = PauseReason[code];
        if (reason === undefined) throw new RangeError(`The engine stopped for an unknown reason ${code}`);
        return this.debuggerListener?.paused(reason) === 'terminate' ? -1 : 0;
    }

    private load(context: ScriptContextId, length: number): number {
        const name = this.buffer.bytes.toString('utf8', 0, length);
        const module = this.loadModule?.(name, context);
        if (module === undefined) throw new ReferenceError(`Could not find module '${name}'`);
        return new ValueWriter(this.buffer).value(module).length;
    }

    /** Writes an error's name and message for the engine to throw, and returns the status for it. */
    private describe(error: unknown): number {
        try {
            const name = error instanceof Error ? error.name : 'Error';
            const message = error instanceof Error ? error.message : String(error);
            new ValueWriter(this.buffer).string(name).string(message);
            return -1;
        } catch {
            return -2;
        }
    }
}
