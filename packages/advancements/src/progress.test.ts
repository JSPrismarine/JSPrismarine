import { describe, expect, it } from 'vitest';

import { parseAdvancement } from './model';
import type { ParsedAdvancement } from './model';
import { PlayerAdvancements, requirementsMet } from './progress';

const advancement = (criteria: readonly string[], requirements?: readonly (readonly string[])[]): ParsedAdvancement => {
    const { value } = parseAdvancement('minecraft:a', {
        criteria: Object.fromEntries(criteria.map((name) => [name, { trigger: 'minecraft:tick' }])),
        requirements
    });
    if (!value) throw new Error('the fixture did not parse');
    return value;
};

describe('evaluating requirements', () => {
    it('completes a single criterion through the default one-group form', () => {
        expect(requirementsMet([['only']], (name) => name === 'only')).toBe(true);
        expect(requirementsMet([['only']], () => false)).toBe(false);
    });

    it('reads a group as an or', () => {
        const requirements = [['a', 'b']];

        expect(requirementsMet(requirements, (name) => name === 'b')).toBe(true);
    });

    it('reads the groups as an and', () => {
        const requirements = [['a', 'b'], ['c']];

        expect(requirementsMet(requirements, (name) => name === 'b')).toBe(false);
        expect(requirementsMet(requirements, (name) => name === 'b' || name === 'c')).toBe(true);
    });

    it('is satisfied by an empty matrix, which is what a file with no criteria would produce', () => {
        expect(requirementsMet([], () => false)).toBe(true);
    });
});

describe('a player progress store', () => {
    it('reports a criterion granted once and ignores the second grant', () => {
        const progress = new PlayerAdvancements();

        expect(progress.grant('minecraft:a', 'one', '2026-01-01T00:00:00.000Z')).toBe(true);
        expect(progress.grant('minecraft:a', 'one', '2026-01-02T00:00:00.000Z')).toBe(false);
        expect(progress.hasCriterion('minecraft:a', 'one')).toBe(true);
    });

    it('completes an advancement only once every group is satisfied', () => {
        const target = advancement(['one', 'two', 'three'], [['one', 'two'], ['three']]);
        const progress = new PlayerAdvancements();
        progress.grant('minecraft:a', 'one');

        expect(progress.isDone(target)).toBe(false);
        expect(progress.progressOf(target)).toMatchObject({ done: false, completed: 1, total: 2 });

        progress.grant('minecraft:a', 'three');

        expect(progress.isDone(target)).toBe(true);
        expect(progress.progressOf(target)).toMatchObject({ done: true, completed: 2, total: 2 });
    });

    it('revokes one criterion and takes completion back with it', () => {
        const target = advancement(['one']);
        const progress = new PlayerAdvancements();
        progress.grant('minecraft:a', 'one');

        expect(progress.revokeCriterion('minecraft:a', 'one')).toBe(true);
        expect(progress.revokeCriterion('minecraft:a', 'one')).toBe(false);
        expect(progress.isDone(target)).toBe(false);
    });

    it('revokes a whole advancement', () => {
        const target = advancement(['one', 'two']);
        const progress = new PlayerAdvancements();
        progress.grant('minecraft:a', 'one');
        progress.grant('minecraft:a', 'two');

        expect(progress.revoke('minecraft:a')).toBe(true);
        expect(progress.revoke('minecraft:a')).toBe(false);
        expect(progress.progressOf(target).criteria.size).toBe(0);
    });

    it('round-trips through its JSON form', () => {
        const target = advancement(['one', 'two']);
        const progress = new PlayerAdvancements();
        progress.grant('minecraft:a', 'one', '2026-01-01T00:00:00.000Z');
        progress.grant('minecraft:a', 'two', '2026-01-02T03:04:05.000Z');

        const json = progress.toJSON((id) => (id === target.id ? target : undefined));

        expect(json).toEqual({
            'minecraft:a': {
                criteria: { one: '2026-01-01T00:00:00.000Z', two: '2026-01-02T03:04:05.000Z' },
                done: true
            }
        });

        const restored = PlayerAdvancements.fromJSON(json);

        expect(restored.toJSON((id) => (id === target.id ? target : undefined))).toEqual(json);
        expect(restored.isDone(target)).toBe(true);
    });

    it('re-derives completion from the current requirements rather than the stored flag', () => {
        const restored = PlayerAdvancements.fromJSON({
            'minecraft:a': { criteria: { one: '2026-01-01T00:00:00.000Z' }, done: true }
        });

        expect(restored.isDone(advancement(['one', 'two']))).toBe(false);
        expect(restored.isDone(advancement(['one', 'two'], [['one', 'two']]))).toBe(true);
    });

    it('records the current instant when the caller gives none', () => {
        const before = Date.now();
        const progress = new PlayerAdvancements();
        progress.grant('minecraft:a', 'one');

        const obtained = progress.progressOf(advancement(['one'])).criteria.get('one');

        expect(obtained).toBeDefined();
        expect(Date.parse(obtained!)).toBeGreaterThanOrEqual(before);
    });
});
