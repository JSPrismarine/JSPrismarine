import { describe, expect, it } from 'vitest';

import { SnbtSyntaxError, parseSnbtCompound, readMacroArguments } from './snbt';

describe('parseSnbtCompound', () => {
    it('reads the JSON spelling unchanged', () => {
        expect(parseSnbtCompound('{"name":"Steve","count":3,"ok":true}')).toEqual({
            name: 'Steve',
            count: 3,
            ok: true
        });
    });

    it('reads unquoted keys, bare values and single quotes, which is what an author writes', () => {
        expect(parseSnbtCompound("{name:'Steve', block:'minecraft:stone', count:3}")).toEqual({
            name: 'Steve',
            block: 'minecraft:stone',
            count: 3
        });
    });

    it('refuses a namespaced id left unquoted, as SNBT does: a colon is not a bare character', () => {
        expect(() => parseSnbtCompound('{block:minecraft:stone}')).toThrow(SnbtSyntaxError);
    });

    it('drops a number its type suffix, which is the 1.20.2 macro fix', () => {
        expect(parseSnbtCompound('{a:1b,b:2s,c:3L,d:4.5f,e:-6.25d}')).toEqual({
            a: 1,
            b: 2,
            c: 3,
            d: 4.5,
            e: -6.25
        });
    });

    it('keeps a word that is not a number as the string it spells', () => {
        expect(parseSnbtCompound('{tool:diamond_pickaxe, sign:+, dot:.}')).toEqual({
            tool: 'diamond_pickaxe',
            sign: '+',
            dot: '.'
        });
    });

    it('reads nested compounds and lists', () => {
        expect(parseSnbtCompound('{at:{x:1,y:2},tags:[a,"b",3]}')).toEqual({
            at: { x: 1, y: 2 },
            tags: ['a', 'b', 3]
        });
    });

    it('reads the empty compound and the empty list', () => {
        expect(parseSnbtCompound('{}')).toEqual({});
        expect(parseSnbtCompound('{values:[]}')).toEqual({ values: [] });
    });

    it('reports where it stopped rather than guessing', () => {
        expect(() => parseSnbtCompound('{a:1')).toThrow(SnbtSyntaxError);
        expect(() => parseSnbtCompound('{a:1} trailing')).toThrow(/text after the compound/);
        expect(() => parseSnbtCompound('[1,2]')).toThrow(SnbtSyntaxError);
    });
});

describe('readMacroArguments', () => {
    it('answers undefined instead of throwing, which is the executor seam', () => {
        expect(readMacroArguments('{a:1}')).toEqual({ a: 1 });
        expect(readMacroArguments('not a compound')).toBeUndefined();
    });
});
