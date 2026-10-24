import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer';

const kinds = (source: string) => tokenize(source).map((token) => token.kind);
const values = (source: string) => tokenize(source).map((token) => token.value);

describe('tokenize', () => {
    it('reads numbers, including a trailing f suffix', () => {
        expect(tokenize('0.5f')).toEqual([{ kind: 'number', value: '0.5', start: 0 }]);
        expect(tokenize('1.23')).toEqual([{ kind: 'number', value: '1.23', start: 0 }]);
    });

    it('lowercases identifiers outside strings', () => {
        expect(values('Math.Random(1,3)')).toEqual(['math.random', '(', '1', ',', '3', ')']);
    });

    it('preserves case and whitespace inside strings', () => {
        expect(tokenize("'East Wing'")).toEqual([{ kind: 'string', value: 'East Wing', start: 0 }]);
    });

    it('reads multi-character operators', () => {
        expect(values('a<=b&&c||d??e->f==g!=h>=i')).toEqual([
            'a',
            '<=',
            'b',
            '&&',
            'c',
            '||',
            'd',
            '??',
            'e',
            '->',
            'f',
            '==',
            'g',
            '!=',
            'h',
            '>=',
            'i'
        ]);
    });

    it('classifies keywords', () => {
        expect(kinds('return loop for_each break continue this true false')).toEqual([
            'keyword',
            'keyword',
            'keyword',
            'keyword',
            'keyword',
            'keyword',
            'keyword',
            'keyword'
        ]);
    });

    it('reports an unknown character through a diagnostic token', () => {
        expect(() => tokenize('1 # 2')).toThrowError(/unexpected character/i);
    });
});
