import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { webcrypto } from 'node:crypto';

/**
 * A host on which asynchronous work finishes late, for a harness that steps a server by hand.
 *
 * A stepped harness runs the next tick only once everything it counts has settled. Work it does
 * not count, such as a signature a login handler awaits, a file read or a `setImmediate` chain,
 * finishes before that tick on a quiet machine and after it on a loaded one, so the run depends
 * on the host. This host makes the slow case happen every time: each completion that workspace
 * code started is held for {@link HELD_TURNS} turns of the event loop before it is delivered,
 * which is longer than a harness needs to see its counted work settle. A harness that counts
 * the work waits through the hold. A harness that does not runs a tick while the completion is
 * still held, and {@link SlowHost.held} names it.
 *
 * Work that an unref'd timer starts is background work, as the timer is: it is held the same way,
 * but {@link SlowHost.held} leaves it out. A RakNet socket's ticker is such a timer, and a socket
 * another test file left open keeps ticking in the shared worker, so counting what it starts
 * would make a step depend on when that ticker last fired.
 *
 * Install it with the first import of a test file. Modules that keep a reference to an
 * asynchronous function when they load, as `promisify(deflateRaw)` does, keep the patched one
 * only if they load after it. While inactive every patched function passes straight through.
 */

/** Turns of the event loop a held completion waits. A harness declares quiet after two. */
const HELD_TURNS = 16;

/** One completion being held, or one timer that has not fired. */
export interface HeldWork {
    readonly api: string;
    /** Where workspace code started it. */
    readonly origin: string;
}

const require = createRequire(import.meta.url);
const originalSetImmediate = globalThis.setImmediate;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalClearImmediate = globalThis.clearImmediate;

/** Resolves on the next turn of the event loop, a turn the slow host never delays. */
export const nextTurn = (): Promise<void> => new Promise((resolve) => originalSetImmediate(resolve));

let active = false;
/** Held work a harness waits for. */
const holding = new Set<HeldWork>();
/** Held work an unref'd timer started, which nothing waits for. */
const holdingInBackground = new Set<HeldWork>();
/**
 * Set in the asynchronous context of an unref'd timer's callback. An async context rather than a
 * flag, so it follows the work the callback starts: a read it awaits completes after the callback
 * has returned, and the code after that `await` is still the timer's work (#3711).
 */
const backgroundWork = new AsyncLocalStorage<true>();

/** Whether the running code continues an unref'd timer. */
const inBackground = (): boolean => backgroundWork.getStore() === true;

/** Runs `callback` as background work when `background` is set, and as its caller's otherwise. */
const runAs = (background: boolean, callback: () => void): void => {
    if (background && !inBackground()) backgroundWork.run(true, callback);
    else callback();
};
const timers = new Map<NodeJS.Timeout, HeldWork>();
/** How to cancel each held immediate, by the handle `setImmediate` returned for it. */
const immediates = new Map<NodeJS.Immediate, () => void>();
let heldCount = 0;

/**
 * The frame that started the work, if workspace code started it; undefined for work started by
 * Node, Vitest or a dependency on their own, which the host leaves alone.
 */
const workspaceOrigin = (): string | undefined => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 40;
    const stack = new Error('origin').stack ?? '';
    Error.stackTraceLimit = limit;
    const frames = stack.split('\n').slice(1);
    const own = frames.filter((frame) => frame.includes('/packages/') && !frame.includes('/node_modules/'));
    const outside = own.filter((frame) => !frame.includes('slowHost.test.helper'));
    if (outside.length === 0) return undefined;
    return outside
        .slice(0, 4)
        .map((frame) => frame.trim())
        .join(' <- ');
};

/**
 * Delivers `deliver` after the hold, counting it as held meanwhile.
 * @param background - Whether background work started it, read when it started: by the time it
 *   completes, the code that started it has returned.
 * @returns Cancels the delivery, as `clearImmediate` does an immediate that has not run.
 */
const hold = (api: string, origin: string, background: boolean, deliver: () => void): (() => void) => {
    const work: HeldWork = { api, origin };
    const set = background ? holdingInBackground : holding;
    set.add(work);
    let turns = 0;
    let canceled = false;
    const turn = (): void => {
        if (canceled) return;
        if (++turns < HELD_TURNS) {
            originalSetImmediate(turn);
            return;
        }
        set.delete(work);
        // Counted on delivery, so a held immediate that was cleared does not count as one held.
        heldCount++;
        runAs(background, deliver);
    };
    originalSetImmediate(turn);
    return () => {
        canceled = true;
        set.delete(work);
    };
};

type AnyFunction = (...args: unknown[]) => unknown;

const isFunction = (value: unknown): value is AnyFunction => typeof value === 'function';

/** Wraps a Node callback API so the callback is held; a call without a callback passes through. */
const holdCallback = (api: string, original: AnyFunction): AnyFunction =>
    function (this: unknown, ...args: unknown[]): unknown {
        const callback = args.at(-1);
        const origin = active && isFunction(callback) ? workspaceOrigin() : undefined;
        if (origin === undefined || !isFunction(callback)) return original.apply(this, args);
        const background = inBackground();
        args[args.length - 1] = (...results: unknown[]) =>
            hold(api, origin, background, () => void callback(...results));
        return original.apply(this, args);
    };

/** Wraps a promise API so its settlement is held. */
const holdPromise = (api: string, original: AnyFunction): AnyFunction =>
    function (this: unknown, ...args: unknown[]): unknown {
        const origin = active ? workspaceOrigin() : undefined;
        const result = original.apply(this, args);
        if (origin === undefined || !(result instanceof Promise)) return result;
        const background = inBackground();
        return new Promise((resolve, reject) => {
            result.then(
                (value: unknown) => hold(api, origin, background, () => resolve(value)),
                (error: unknown) => hold(api, origin, background, () => reject(error))
            );
        });
    };

/** Replaces each named function of `target` with `wrap` of it. */
const patch = (
    target: Record<string, unknown>,
    prefix: string,
    names: readonly string[],
    wrap: (api: string, original: AnyFunction) => AnyFunction
): void => {
    for (const name of names) {
        const original = target[name];
        if (isFunction(original)) target[name] = wrap(`${prefix}.${name}`, original);
    }
};

const FS_CALLBACKS = [
    'access',
    'appendFile',
    'close',
    'copyFile',
    'fstat',
    'fsync',
    'ftruncate',
    'lstat',
    'mkdir',
    'mkdtemp',
    'open',
    'read',
    'readFile',
    'readdir',
    'realpath',
    'rename',
    'rm',
    'stat',
    'truncate',
    'unlink',
    'write',
    'writeFile'
] as const;

const ZLIB_CALLBACKS = [
    'brotliCompress',
    'brotliDecompress',
    'deflate',
    'deflateRaw',
    'gunzip',
    'gzip',
    'inflate',
    'inflateRaw',
    'unzip'
] as const;

const CRYPTO_CALLBACKS = [
    'checkPrime',
    'generateKey',
    'generateKeyPair',
    'generatePrime',
    'hkdf',
    'pbkdf2',
    'randomBytes',
    'randomFill',
    'randomInt',
    'scrypt',
    'sign',
    'verify'
] as const;

const SUBTLE_METHODS = [
    'decrypt',
    'deriveBits',
    'deriveKey',
    'digest',
    'encrypt',
    'exportKey',
    'generateKey',
    'importKey',
    'sign',
    'unwrapKey',
    'verify',
    'wrapKey'
] as const;

// Builtin modules are plain objects whose exports are writable. The ESM views of them are synced
// below, so a named import sees the patched function too.
const fs: Record<string, unknown> = require('node:fs');
const fsPromises: Record<string, unknown> = require('node:fs/promises');
const zlib: Record<string, unknown> = require('node:zlib');
const crypto: Record<string, unknown> = require('node:crypto');
const timersPromises: Record<string, unknown> = require('node:timers/promises');
const subtle: Record<string, unknown> = Object.getPrototypeOf(webcrypto.subtle);

patch(fs, 'fs', FS_CALLBACKS, holdCallback);
patch(fsPromises, 'fs/promises', FS_CALLBACKS, holdPromise);
patch(zlib, 'zlib', ZLIB_CALLBACKS, holdCallback);
patch(crypto, 'crypto', CRYPTO_CALLBACKS, holdCallback);
patch(subtle, 'crypto.subtle', SUBTLE_METHODS, holdPromise);
patch(timersPromises, 'timers/promises', ['setImmediate'], holdPromise);

// `Reflect.set`, because the globals' declared types are overloads (and the DOM's, where it is
// loaded) that one replacement function cannot spell; each keeps the Node calling convention.
Reflect.set(
    globalThis,
    'setImmediate',
    Object.assign(
        (callback: (...args: unknown[]) => void, ...args: unknown[]): NodeJS.Immediate => {
            const origin = active ? workspaceOrigin() : undefined;
            if (origin === undefined) return originalSetImmediate(callback, ...args);
            // Counted as held from the call, so a harness that does not wait for it cannot miss it.
            const cancel = hold('setImmediate', origin, inBackground(), () => {
                immediates.delete(handle);
                callback(...args);
            });
            // A handle of its own that never runs, for `clearImmediate` to name the held work by.
            const handle = originalSetImmediate(() => {});
            originalClearImmediate(handle);
            immediates.set(handle, cancel);
            return handle;
        },
        { __promisify__: originalSetImmediate.__promisify__ }
    )
);
Reflect.set(globalThis, 'clearImmediate', (immediate?: NodeJS.Immediate): void => {
    if (immediate !== undefined) {
        immediates.get(immediate)?.();
        immediates.delete(immediate);
    }
    originalClearImmediate(immediate);
});
Reflect.set(
    globalThis,
    'setTimeout',
    Object.assign(
        (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): NodeJS.Timeout => {
            const origin = active ? workspaceOrigin() : undefined;
            if (origin === undefined) return originalSetTimeout(callback, delay, ...args);
            const timer = originalSetTimeout(() => {
                timers.delete(timer);
                // Read when it fires, since a caller unrefs a timer after setting it.
                runAs(!timer.hasRef(), () => callback(...args));
            }, delay);
            timers.set(timer, { api: `setTimeout(${delay ?? 0})`, origin });
            return timer;
        },
        { __promisify__: originalSetTimeout.__promisify__ }
    )
);
Reflect.set(globalThis, 'clearTimeout', (timer?: NodeJS.Timeout): void => {
    if (timer !== undefined) timers.delete(timer);
    originalClearTimeout(timer);
});
syncBuiltinESMExports();

/** The slow host's controls. */
export const SlowHost = {
    /** Holds completions from here until {@link SlowHost.stop}. */
    start(): void {
        active = true;
    },
    stop(): void {
        active = false;
        timers.clear();
    },
    /**
     * Every completion still held and every timer workspace code set that has not fired and
     * keeps the process alive. Work an unref'd timer started is left out, as the timer is. A
     * stepped harness reads it before each tick: anything listed is work the tick would run
     * ahead of.
     */
    held(): readonly HeldWork[] {
        const pendingTimers = [...timers].filter(([timer]) => timer.hasRef()).map(([, work]) => work);
        return [...holding, ...pendingTimers];
    },
    /** How many held completions the host has delivered since it loaded. */
    get heldCount(): number {
        return heldCount;
    }
};
