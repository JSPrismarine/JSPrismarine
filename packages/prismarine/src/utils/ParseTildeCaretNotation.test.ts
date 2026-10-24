import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world';
import { Position } from '../world/Position';
import ParseTildeCaretNotation from './ParseTildeCaretNotation';

type Axis = 'x' | 'y' | 'z';

/** An entity standing at (10, 64, -3). */
const source = () =>
    stub<Entity>({
        getPosition: () => new Position(10, 64, -3, stub<World>({ getName: () => 'test' }))
    });

describe('utils', () => {
    describe('ParseTildeCaretNotation', () => {
        it('returns an absolute coordinate as is', () => {
            expect(ParseTildeCaretNotation({ input: '7.5', type: 'x', source: source() })).toBe(7.5);
        });

        it.each<[Axis, number]>([
            ['x', 10],
            ['y', 64],
            ['z', -3]
        ])('resolves a bare "~" to the entity position on %s', (type, expected) => {
            expect(ParseTildeCaretNotation({ input: '~', type, source: source() })).toBe(expected);
        });

        it.each<[Axis, number]>([
            ['x', 15],
            ['y', 69],
            ['z', 2]
        ])('adds a positive offset on %s', (type, expected) => {
            expect(ParseTildeCaretNotation({ input: '~5', type, source: source() })).toBe(expected);
        });

        it.each<[Axis, number]>([
            ['x', 8],
            ['y', 62],
            ['z', -5]
        ])('adds a negative offset on %s', (type, expected) => {
            expect(ParseTildeCaretNotation({ input: '~-2', type, source: source() })).toBe(expected);
        });
    });
});
