/**
 * The `globals` scenario: what the JavaScript engine gives a script, before any module the host
 * adds. It records the global object's names, the own keys of every built-in it can reach and of
 * that built-in's prototype, and what the engine throws for the features BDS's QuickJS refuses.
 *
 * The pack imports nothing, so the same file runs in a bare JSPrismarine script engine with no
 * world. Without `@minecraft/server` it cannot read `system.currentTick`, so every observation
 * carries tick 0, the tick a version 2 pack's top level runs in.
 *
 * `packages/parity/src/scripting/record.ts` defines the line format.
 */

const PACK = 'engine';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** An object's own keys, sorted, with a symbol key written as `[Symbol.iterator]`. */
const keysOf = (object) =>
    Reflect.ownKeys(object)
        .map((key) => (typeof key === 'symbol' ? `[${key.description}]` : key))
        .sort();

/** Logs the own keys of a built-in, and of its `prototype` when it has one. */
const members = (name, object) => {
    const prototype = Object.hasOwn(object, 'prototype') ? object.prototype : undefined;
    const isObject = typeof prototype === 'object' || typeof prototype === 'function';
    record(`members ${name}`, {
        value:
            isObject && prototype !== null
                ? { own: keysOf(object), prototype: keysOf(prototype) }
                : { own: keysOf(object) }
    });
};

// The host adds these two; the scenarios of the host's own API compare them.
const HOST_GLOBALS = new Set(['console', 'print']);

const globals = keysOf(globalThis);
record('globalThis', { value: globals });

for (const name of globals) {
    if (name === 'globalThis' || HOST_GLOBALS.has(name)) continue;
    const value = globalThis[name];
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') members(name, value);
}

// Built-ins no global names, reached through the objects that hold them.
const GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;
const iteratorOf = (iterable) => Object.getPrototypeOf(iterable[Symbol.iterator]());
const intrinsics = [
    ['%TypedArray%', Object.getPrototypeOf(Int8Array)],
    ['%GeneratorFunction%', GeneratorFunction],
    ['%AsyncFunction%', AsyncFunction],
    ['%AsyncGeneratorFunction%', AsyncGeneratorFunction],
    ['%GeneratorPrototype%', GeneratorFunction.prototype.prototype],
    ['%AsyncGeneratorPrototype%', AsyncGeneratorFunction.prototype.prototype],
    ['%IteratorPrototype%', Object.getPrototypeOf(iteratorOf([]))],
    ['%AsyncIteratorPrototype%', Object.getPrototypeOf(AsyncGeneratorFunction.prototype.prototype)],
    ['%ArrayIteratorPrototype%', iteratorOf([])],
    ['%MapIteratorPrototype%', iteratorOf(new Map())],
    ['%SetIteratorPrototype%', iteratorOf(new Set())],
    ['%StringIteratorPrototype%', iteratorOf('')],
    ['%RegExpStringIteratorPrototype%', Object.getPrototypeOf('a'.matchAll(/a/g))]
];
for (const [name, object] of intrinsics) members(name, object);

// Two members BDS's QuickJS has that later releases dropped.
attempt('Object.__getClass', () => {
    const subjects = [[], {}, () => {}, new Proxy(() => {}, {}), new Proxy({}, {}), new Map(), /a/, Math, 1, 'a', null];
    return [Object.__getClass.length, ...subjects.map((subject) => Object.__getClass(subject))];
});
attempt('String.prototype.__quote', () => [
    String.prototype.__quote.length,
    'a"b\\c\n\t\u0001é\ud800'.__quote(),
    String.prototype.__quote.call(12)
]);
attempt('String.prototype.__quote on undefined', () => String.prototype.__quote.call(undefined));

attempt('eval', () => eval('1'));
attempt('new Function from a string', () => new Function('return 2')());
attempt('Function from a string', () => Function('return 2')());
attempt('new Function with no arguments', () => typeof new Function());
attempt('new GeneratorFunction from a string', () => typeof new GeneratorFunction('yield 1'));
attempt('new AsyncFunction from a string', () => typeof new AsyncFunction('return 1'));
attempt('new AsyncGeneratorFunction from a string', () => typeof new AsyncGeneratorFunction('yield 1'));

attempt('new RegExp with the v flag', () => String(new RegExp('[\\p{L}--[a-z]]', 'v')));
attempt('new RegExp with the d flag', () => new RegExp('a', 'd').exec('ba').indices[0]);
attempt('new RegExp with a modifier group', () => new RegExp('(?i:a)b').test('Ab'));
attempt('new RegExp with a duplicate group name', () => String(new RegExp('(?<x>a)|(?<x>b)')));

// BDS's watchdog treats even a caught overflow as critical and stops the server at the end of the
// tick, after the end line, so the capture reports a nonzero exit status.
attempt('stack overflow', () => {
    const recurse = (depth) => recurse(depth + 1) + 1;
    return recurse(0);
});

// Syntax the parser may refuse, each in a module of its own, since a refused file never runs.
const SYNTAX = ['./syntax/regexpV.js', './syntax/using.js'];
const probeSyntax = async () => {
    for (const file of SYNTAX) {
        try {
            const module = await import(file);
            record(`import ${file}`, { value: module.default });
        } catch (error) {
            record(`import ${file}`, { error: String(error) });
        }
    }
    console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
};
probeSyntax();
