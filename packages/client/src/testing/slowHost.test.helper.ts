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
const holding = new Set<HeldWork>();
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
 * @returns Cancels the delivery, as `clearImmediate` does an immediate that has not run.
 */
const hold = (api: string, origin: string, deliver: () => void): (() => void) => {
    const work: HeldWork = { api, origin };
    holding.add(work);
    heldCount++;
    let turns = 0;
    let canceled = false;
    const turn = (): void => {
        if (canceled) return;
        if (++turns < HELD_TURNS) {
            originalSetImmediate(turn);
            return;
        }
        holding.delete(work);
        deliver();
    };
    originalSetImmediate(turn);
    return () => {
        canceled = true;
        holding.delete(work);
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
        args[args.length - 1] = (...results: unknown[]) => hold(api, origin, () => void callback(...results));
        return original.apply(this, args);
    };

/** Wraps a promise API so its settlement is held. */
const holdPromise = (api: string, original: AnyFunction): AnyFunction =>
    function (this: unknown, ...args: unknown[]): unknown {
        const origin = active ? workspaceOrigin() : undefined;
        const result = original.apply(this, args);
        if (origin === undefined || !(result instanceof Promise)) return result;
        return new Promise((resolve, reject) => {
            result.then(
                (value: unknown) => hold(api, origin, () => resolve(value)),
                (error: unknown) => hold(api, origin, () => reject(error))
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
            const cancel = hold('setImmediate', origin, () => {
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
                callback(...args);
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
     * keeps the process alive. A stepped harness reads it before each tick: anything listed is
     * work the tick would run ahead of.
     */
    held(): readonly HeldWork[] {
        const pendingTimers = [...timers].filter(([timer]) => timer.hasRef()).map(([, work]) => work);
        return [...holding, ...pendingTimers];
    },
    /** How many completions the host has held since it loaded. */
    get heldCount(): number {
        return heldCount;
    }
};
