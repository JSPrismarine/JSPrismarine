import { describe, expect, it } from 'vitest';

import { RandomSequences } from './randomSequences';

describe('command random sequence state', () => {
    it('restores named, unkeyed, and explicitly reseeded streams from JSON', () => {
        const first = new RandomSequences(() => -99n);
        first.draw(0, 10);
        first.draw(0, 100, 'minecraft:blocks/coal_ore');
        first.reset('minecraft:chests/simple_dungeon', 1234);
        first.draw(0, 9, 'minecraft:chests/simple_dungeon');
        const state = JSON.parse(JSON.stringify(first.saveState()));
        const expected = [
            first.draw(0, 10),
            first.draw(0, 100, 'minecraft:blocks/coal_ore'),
            first.draw(0, 9, 'minecraft:chests/simple_dungeon')
        ];

        const restored = new RandomSequences(() => -99n);
        restored.restoreState(state);

        expect([
            restored.draw(0, 10),
            restored.draw(0, 100, 'minecraft:blocks/coal_ore'),
            restored.draw(0, 9, 'minecraft:chests/simple_dungeon')
        ]).toEqual(expected);
    });

    it('rejects a different default world seed without replacing the cached streams', () => {
        const source = new RandomSequences(() => 1n);
        const restored = new RandomSequences(() => 2n);
        source.draw(0, 100, 'test:sequence');
        restored.draw(0, 100, 'test:sequence');
        const state = source.saveState();
        const before = restored.draw(0, 100, 'test:sequence');

        expect(() => restored.restoreState(state)).toThrow(TypeError);
        expect(restored.draw(0, 100, 'test:sequence')).not.toBe(before);
    });
});
