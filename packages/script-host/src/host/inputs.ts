/**
 * What a script could otherwise read from the host machine, made an input
 * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)): `Math.random`
 * draws from a generator seeded from the world's seed, and `Date` reads the clock value the
 * world admitted for the tick, so a replay of a scripted session runs the same scripts the same
 * way.
 */

/** The four 32-bit words of a xoshiro128** state. */
export type RandomState = readonly [number, number, number, number];

const MASK_64 = (1n << 64n) - 1n;

/** One step of splitmix64, which spreads a seed over a state of any size. */
const splitmix64 = (state: bigint): [bigint, bigint] => {
    const next = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let z = next;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return [next, z ^ (z >> 31n)];
};

/**
 * The generator state of one context: the world's seed and the context's place in the runtime,
 * so two packs draw different numbers and the same world draws the same ones every run.
 * @param seed - The world's seed.
 * @param index - The pack's place among the runtime's packs.
 */
export const randomState = (seed: bigint, index: number): RandomState => {
    let state = (BigInt.asUintN(64, seed) ^ (BigInt(index) * 0xd1b54a32d192ed03n)) & MASK_64;
    const words: number[] = [];
    while (words.length < 4) {
        const [next, value] = splitmix64(state);
        state = next;
        words.push(Number(value & 0xffffffffn), Number((value >> 32n) & 0xffffffffn));
    }
    // xoshiro's state must not be all zero; splitmix64 never gives four zero words in a row.
    return [words[0] ?? 1, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0];
};

/**
 * Replaces `Math.random` and `Date` in the context it runs in, and returns the function that
 * sets the clock `Date` reads. It runs inside a script engine, never in Node.js, so it must not
 * refer to anything outside its own body.
 *
 * `Date` keeps its prototype, its static members and its own keys, so `instanceof Date`,
 * `Date.UTC` and the engine's own `globals` record see what they see without it. Only a call
 * that reads the current time changes: `Date()`, `new Date()` and `Date.now()`.
 */
export function installInputs(s0: number, s1: number, s2: number, s3: number): (now: number) => void {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    let a = s0 >>> 0;
    let b = s1 >>> 0;
    let c = s2 >>> 0;
    let d = s3 >>> 0;
    const rotate = (value: number, bits: number): number => ((value << bits) | (value >>> (32 - bits))) >>> 0;
    // xoshiro128**, with 53 bits of each pair of draws making one double in [0, 1), as V8 does.
    const next = (): number => {
        const result = Math.imul(rotate(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
        const t = (b << 9) >>> 0;
        c = (c ^ a) >>> 0;
        d = (d ^ b) >>> 0;
        b = (b ^ c) >>> 0;
        a = (a ^ d) >>> 0;
        c = (c ^ t) >>> 0;
        d = rotate(d, 11);
        return result;
    };
    const random = {
        random(): number {
            return ((next() >>> 5) * 67108864 + (next() >>> 6)) / 9007199254740992;
        }
    }.random;
    Object.defineProperty(Math, 'random', { value: random, writable: true, configurable: true });

    let now = 0;
    const RealDate = Date;
    const DateInput = function Date(this: unknown, ...args: unknown[]): unknown {
        if (new.target === undefined) return new RealDate(now).toString();
        // `new Date()` with arguments makes the same date it always does.
        return args.length === 0 ? new RealDate(now) : Reflect.construct(RealDate, args, new.target);
    };
    Object.defineProperty(DateInput, 'length', { value: RealDate.length });
    Object.defineProperty(DateInput, 'prototype', { value: RealDate.prototype, writable: false });
    for (const key of Reflect.ownKeys(RealDate)) {
        if (key === 'length' || key === 'name' || key === 'prototype') continue;
        const descriptor = Object.getOwnPropertyDescriptor(RealDate, key);
        if (descriptor !== undefined) Object.defineProperty(DateInput, key, descriptor);
    }
    Object.defineProperty(DateInput, 'now', {
        value: {
            now(): number {
                return now;
            }
        }.now,
        writable: true,
        configurable: true
    });
    Object.defineProperty(RealDate.prototype, 'constructor', { value: DateInput, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'Date', { value: DateInput, writable: true, configurable: true });

    return (value: number): void => {
        now = value;
    };
}

/** The source text that evaluates, inside an engine, to {@link installInputs}. */
export const installInputsSource = (): string => `(${installInputs.toString()})`;
