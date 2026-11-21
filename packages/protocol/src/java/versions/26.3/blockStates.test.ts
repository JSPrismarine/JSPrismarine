import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BLOCK_STATES } from './blockStates';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const report = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java-reports/26.3/generated/reports/blocks.json');

describe('BLOCK_STATES', () => {
    it('numbers states with the first property slowest, in the order Java multiplies them', () => {
        // A chest's states run facing, then type, then waterlogged, though the report lists type first.
        expect(BLOCK_STATES.idOf('minecraft:chest', { type: 'single', facing: 'north', waterlogged: 'true' })).toBe(
            BLOCK_STATES.idOf('minecraft:chest', { type: 'left', facing: 'north', waterlogged: 'true' })! - 2
        );
        expect(BLOCK_STATES.idOf('minecraft:air')).toBe(0);
        expect(BLOCK_STATES.idOf('minecraft:stone')).toBe(1);
    });

    it('turns an id back into its block and property values', () => {
        const properties = { facing: 'east', half: 'top', shape: 'outer_left', waterlogged: 'false' };
        const id = BLOCK_STATES.idOf('minecraft:oak_stairs', properties)!;

        expect(BLOCK_STATES.stateOf(id)).toEqual({ name: 'minecraft:oak_stairs', properties });
        expect(BLOCK_STATES.stateOf(0)).toEqual({ name: 'minecraft:air', properties: {} });
        expect(BLOCK_STATES.stateOf(BLOCK_STATES.size)).toBeUndefined();
    });

    it('names no id for a value or a block the release lacks', () => {
        expect(
            BLOCK_STATES.idOf('minecraft:chest', { type: 'triple', facing: 'north', waterlogged: 'true' })
        ).toBeUndefined();
        expect(BLOCK_STATES.idOf('minecraft:chest')).toBeUndefined();
        expect(BLOCK_STATES.idOf('minecraft:not_a_block')).toBeUndefined();
    });

    // The data generator's report, when ensure:worldgen has cached it: every state it lists.
    it.runIf(existsSync(report))('gives every state the id the data generator reports', () => {
        // Extracted game data: parsed, never executed.
        const blocks: Record<string, { states: { id: number; properties?: Record<string, string> }[] }> = JSON.parse(
            readFileSync(report, 'utf8')
        );
        const unread = Object.entries(blocks).flatMap(([name, { states }]) =>
            states
                .filter((state) => BLOCK_STATES.stateOf(state.id)?.name !== name)
                .map((state) => `${name} ${state.id}`)
        );
        expect(unread).toEqual([]);
        const wrong = Object.entries(blocks).flatMap(([name, { states }]) =>
            states
                .filter((state) => BLOCK_STATES.idOf(name, state.properties) !== state.id)
                .map((state) => `${name} ${state.id}`)
        );

        expect(wrong).toEqual([]);
    });
});
