import { describe, expect, it } from 'vitest';

import { MACRO_CACHE_ENTRIES, compileFunction } from './compile';

/** Compiles a function the test knows is well formed. */
const compile = (id: string, source: string) => {
    const result = compileFunction(id, source);
    if (!result.function) throw new Error(`the test fixture did not compile: ${result.diagnostics[0]?.message}`);
    return result.function;
};

describe('compileFunction', () => {
    it('compiles a plain function and reports no diagnostics', () => {
        const result = compileFunction('test:plain', '# greet\nsay hello\nsay goodbye\n');

        expect(result.diagnostics).toEqual([]);
        expect(result.function?.macro).toBe(false);
        expect(result.function?.length).toBe(2);
    });

    it('marks a function that has one macro line and lists its variables', () => {
        const compiled = compile('test:macro', 'say ready\n$say hello $(name)\n');

        expect(compiled.macro).toBe(true);
        expect(compiled.variables).toEqual(['name']);
    });

    it('does not register a function whose macro line is malformed', () => {
        const result = compileFunction('test:broken', '$say $(na-me)\n');

        expect(result.function).toBeUndefined();
        expect(result.diagnostics[0]).toMatchObject({
            code: 'macro.invalid',
            functionId: 'test:broken',
            line: 1
        });
    });

    it('does not register a function with a parse error, and attributes it to the function', () => {
        const result = compileFunction('test:slash', 'say fine\n/say bad\n');

        expect(result.function).toBeUndefined();
        expect(result.diagnostics[0]).toMatchObject({ code: 'line.leading-slash', functionId: 'test:slash', line: 2 });
    });
});

describe('CompiledFunction.instantiate', () => {
    it('returns the same commands for every call of a plain function', () => {
        const compiled = compile('test:plain', 'say hello\n');
        const first = compiled.instantiate();
        const second = compiled.instantiate({ unused: 1 });

        expect(first).toEqual({ ok: true, commands: [{ command: 'say hello', line: 1 }] });
        expect(second).toEqual(first);
    });

    it('substitutes macro lines and leaves plain lines alone', () => {
        const compiled = compile('test:macro', 'say ready\n$say hello $(name)\n');

        expect(compiled.instantiate({ name: 'Steve' })).toEqual({
            ok: true,
            commands: [
                { command: 'say ready', line: 1 },
                { command: 'say hello Steve', line: 2 }
            ]
        });
    });

    it('reports a macro call made without arguments', () => {
        const compiled = compile('test:macro', '$say hello $(name)\n');

        expect(compiled.instantiate()).toEqual({
            ok: false,
            message: 'test:macro is a macro function and was called without arguments'
        });
    });

    it('reports the first missing variable', () => {
        const compiled = compile('test:macro', '$say $(name) $(other)\n');

        expect(compiled.instantiate({ name: 'Steve' })).toEqual({
            ok: false,
            message: "the macro arguments have no entry for 'other'"
        });
    });

    it('reuses the cached commands for a repeated argument set', () => {
        const compiled = compile('test:macro', '$say hello $(name)\n');
        const first = compiled.instantiate({ name: 'Steve' });
        const second = compiled.instantiate({ name: 'Steve' });

        expect(first.ok && second.ok && first.commands === second.commands).toBe(true);
        expect(compiled.cachedArgumentSets).toBe(1);
    });

    it('keys the cache on the referenced values only, so extra entries do not split it', () => {
        const compiled = compile('test:macro', '$say hello $(name)\n');
        compiled.instantiate({ name: 'Steve', extra: 1 });
        compiled.instantiate({ name: 'Steve', extra: 2 });

        expect(compiled.cachedArgumentSets).toBe(1);
    });

    it('holds at most the documented number of argument sets', () => {
        const compiled = compile('test:macro', '$say hello $(name)\n');
        for (let index = 0; index < MACRO_CACHE_ENTRIES + 4; index += 1) {
            compiled.instantiate({ name: `player${index}` });
        }

        expect(compiled.cachedArgumentSets).toBe(MACRO_CACHE_ENTRIES);
    });
});
