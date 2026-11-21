import { describe, expect, it } from 'vitest';

import { readMacroArguments } from './snbt';

describe('readMacroArguments', () => {
    it('reads the JSON spelling, and an unquoted key, a bare word and single quotes', () => {
        expect(readMacroArguments('{"name":"Steve","count":3}')).toEqual({ name: 'Steve', count: '3' });
        expect(readMacroArguments("{name:'Steve', block:'minecraft:stone', tool:diamond_pickaxe}")).toEqual({
            name: 'Steve',
            block: 'minecraft:stone',
            tool: 'diamond_pickaxe'
        });
    });

    it('substitutes a number without its type suffix, and a decimal as Java prints it', () => {
        expect(readMacroArguments('{a:1b,b:2s,c:3L,d:4.5f,e:-6.25d,f:1.0d,g:0.1f,h:true}')).toEqual({
            a: '1',
            b: '2',
            c: '3',
            d: '4.5',
            e: '-6.25',
            f: '1',
            g: '.100000001490116',
            h: '1'
        });
    });

    it('prints a decimal as Java’s DecimalFormat does, with at most 15 fraction digits', () => {
        const third = (1 / 3).toString();
        expect(
            readMacroArguments(
                `{a:1.0d,b:1.5d,c:0.5d,d:-0.5d,e:${third}d,f:1e20d,g:1e-20d,h:-1e-20d,i:-0.0d,j:5e-16d,k:1.52587890625e-5d,l:1e999d}`
            )
        ).toEqual({
            a: '1',
            b: '1.5',
            c: '.5',
            d: '-.5',
            e: '.333333333333333',
            f: '100000000000000000000',
            g: '0',
            h: '-0',
            i: '-0',
            j: '.000000000000001',
            k: '.000015258789062',
            l: '∞'
        });
    });

    it('substitutes a compound, a list or an array as its SNBT', () => {
        expect(readMacroArguments('{at:{x:1,y:2b},tags:[a,"b c"],ids:[I;1,2]}')).toEqual({
            at: '{x: 1, y: 2b}',
            tags: '["a", "b c"]',
            ids: '[I; 1, 2]'
        });
    });

    it('reads what `/function … with` passes, which is a compound printed as SNBT', () => {
        expect(readMacroArguments('{line: "a\\nb", n: 1.5d}')).toEqual({ line: 'a\nb', n: '1.5' });
    });

    it('reads a stored compound printed back with its non-finite numbers, and typed text as Java does', () => {
        expect(readMacroArguments('{n: -Infinityf, p: Infinityd}', true)).toEqual({ n: '-∞', p: '∞' });
        // Typed by a player, `Infinityd` is a string and `-Infinityf` does not read at all.
        expect(readMacroArguments('{p: Infinityd}')).toEqual({ p: 'Infinityd' });
        expect(readMacroArguments('{n: -Infinityf}')).toBeUndefined();
    });

    it('answers undefined instead of throwing for text that is not one compound', () => {
        expect(readMacroArguments('{block:minecraft:stone}')).toBeUndefined();
        expect(readMacroArguments('{a:1')).toBeUndefined();
        expect(readMacroArguments('{a:1} trailing')).toBeUndefined();
        expect(readMacroArguments('[1,2]')).toBeUndefined();
        expect(readMacroArguments('not a compound')).toBeUndefined();
    });
});
