import { describe, expect, it } from 'vitest';

import { compileMacroLine, substituteMacro } from './macro';

/** Compiles a macro line that the test knows is well formed. */
const compile = (command: string) => {
    const result = compileMacroLine(command);
    if (!result.ok) throw new Error(`the test fixture did not compile: ${result.message}`);
    return result.template;
};

/** Substitutes into a macro line that the test knows will succeed. */
const expand = (command: string, args: Readonly<Record<string, unknown>>) => {
    const result = substituteMacro(compile(command), args);
    if (!result.ok) throw new Error(`the test fixture did not expand: ${result.message}`);
    return result.command;
};

describe('compileMacroLine', () => {
    it('lists each variable once, in first-use order', () => {
        const template = compile('say $(greeting) $(name), $(greeting)');

        expect(template.variables).toEqual(['greeting', 'name']);
    });

    it('rejects a line with no substitution', () => {
        expect(compileMacroLine('say hello')).toEqual({
            ok: false,
            message: 'no variables in macro'
        });
    });

    it('rejects an unterminated substitution', () => {
        expect(compileMacroLine('say $(name').ok).toBe(false);
    });

    it('rejects a variable name outside letters, digits and underscore', () => {
        const result = compileMacroLine('say $(na-me)');

        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.message).toContain("invalid macro variable name 'na-me'");
    });

    it('rejects an empty variable name', () => {
        expect(compileMacroLine('say $()').ok).toBe(false);
    });
});

describe('substituteMacro', () => {
    it('replaces every occurrence of a variable', () => {
        expect(expand('say $(name) and $(name)', { name: 'Steve' })).toBe('say Steve and Steve');
    });

    it('inserts a string without quoting or escaping it, as the Java server does', () => {
        expect(expand('say $(text)', { text: 'a "quoted" \\ value' })).toBe('say a "quoted" \\ value');
    });

    it('treats a $ that is not followed by ( as literal text', () => {
        expect(expand('say $5 and $(name) and $', { name: 'Steve' })).toBe('say $5 and Steve and $');
    });

    it('inserts numbers without a type suffix', () => {
        expect(expand('say $(a) $(b) $(c)', { a: 1, b: -2.5, c: 1234567890123 })).toBe('say 1 -2.5 1234567890123');
    });

    it('inserts a boolean as the NBT byte it would be', () => {
        expect(expand('say $(flag)', { flag: true })).toBe('say 1');
    });

    it('renders a nested compound and list as SNBT', () => {
        expect(expand('say $(data)', { data: { id: 'stone', count: 2, tags: ['a', 'b'], flag: false } })).toBe(
            'say {id:"stone",count:2,tags:["a","b"],flag:0b}'
        );
    });

    it('reports the missing variable when the compound does not carry it', () => {
        const result = substituteMacro(compile('say $(name) $(other)'), { name: 'Steve' });

        expect(result).toEqual({
            ok: false,
            message: "the macro arguments have no entry for 'other'"
        });
    });

    it('ignores compound entries the macro does not use', () => {
        expect(expand('say $(name)', { name: 'Steve', unused: 'ignored' })).toBe('say Steve');
    });
});
