import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptEngine } from './ScriptEngine';
import { absentGlobals, splitAbsentPath } from './absentGlobals';
import { loadLibrary, scriptHostAvailable } from './testing/library.test-utils';

describe('splitAbsentPath', () => {
    it.each([
        ['eval', { owner: [], key: 'eval', symbol: false }],
        ['Set.prototype.union', { owner: ['Set', 'prototype'], key: 'union', symbol: false }],
        [
            'Iterator.prototype[Symbol.toStringTag]',
            { owner: ['Iterator', 'prototype'], key: 'toStringTag', symbol: true }
        ]
    ])('splits %s', (path, expected) => {
        expect(splitAbsentPath(path)).toEqual(expected);
    });
});

// The `scripting.engine` parity row compares every global and member with BDS's; these tests
// check the mechanisms behind it.
describe.skipIf(!scriptHostAvailable())('a script context, compared with BDS', () => {
    // Loading runs in a hook, which a skipped suite never runs, so a missing library skips the file.
    let engine: ScriptEngine;
    beforeAll(() => {
        engine = loadLibrary().createEngine();
    });
    afterAll(() => engine.destroy());

    it.each(absentGlobals().map((entry) => entry.path))('has no %s', (path) => {
        const { owner, key, symbol } = splitAbsentPath(path);
        // The path reaches the script as JSON data and is walked there, so no part of it becomes code.
        // The holder itself may be gone, as `Iterator` is, and then so is the member.
        const probe = `(() => {
            const owner = ${JSON.stringify(owner)};
            const key = ${JSON.stringify(key)};
            try {
                let holder = globalThis;
                for (const name of owner) holder = holder[name];
                return Object.hasOwn(holder, ${symbol ? 'Symbol[key]' : 'key'});
            } catch {
                return false;
            }
        })()`;

        expect(engine.evaluate(probe)).toBe(false);
    });

    it('hides the iterator helpers from built-in iterators too', () => {
        expect(engine.evaluate('typeof [1, 2][Symbol.iterator]().map')).toBe('undefined');
    });

    it('fails `eval` as BDS does', () => {
        expect(engine.evaluate('try { eval("1"); } catch (error) { error.name + ": " + error.message }')).toBe(
            "ReferenceError: 'eval' is not defined"
        );
    });

    it.each([
        ['new Function', 'new Function("return 2")'],
        ['Function', 'Function("return 2")'],
        ['the generator function constructor', 'Object.getPrototypeOf(function* () {}).constructor("yield 1")'],
        ['the async function constructor', 'Object.getPrototypeOf(async function () {}).constructor("return 1")']
    ])('refuses to compile a string with %s, as BDS does', (_label, source) => {
        expect(engine.evaluate(`try { ${source}; 'compiled' } catch (error) { error.message }`)).toBe(
            'Function from string is not supported'
        );
    });

    it('still compiles functions written in the source', () => {
        expect(engine.evaluate('(function () { return 2; })() + (() => 3)()')).toBe(5);
    });

    it.each([
        ['the v flag', "new RegExp('[a]', 'v')", 'SyntaxError: invalid regular expression flags'],
        ['the v flag in a literal', '/[a]/v', 'SyntaxError: invalid regular expression flags'],
        ['a modifier group', "new RegExp('(?i:a)b')", 'SyntaxError: invalid group'],
        ['a group name used twice', "new RegExp('(?<x>a)|(?<x>b)')", 'SyntaxError: duplicate group name']
    ])('refuses %s in a regular expression, as BDS does', (_label, source, message) => {
        expect(() => engine.evaluate(source)).toThrow(message);
    });

    it('still compiles the regular expression syntax BDS has', () => {
        expect(engine.evaluate("new RegExp('(?<x>a)b', 'dgimsuy').exec('ab').indices[0].join()")).toBe('0,2');
    });

    it('has the Object.__getClass and String.prototype.__quote that BDS has', () => {
        expect(engine.evaluate('[Object.__getClass([]), Object.__getClass(1), \'a"\'.__quote()].join(" ")')).toBe(
            'Array  "a\\""'
        );
    });
});
