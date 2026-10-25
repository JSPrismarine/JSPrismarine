import { describe, expect, it } from 'vitest';

import {
    DEFAULT_TELEPORT_DIAMETER,
    parseConsumeEffect,
    parseConsumeEffects,
    runConsumeEffects
} from './consumeEffects';
import { createTestWorld, testSource } from './testing';

const source = testSource();

describe('parseConsumeEffect', () => {
    it('defaults a mob effect instance the way the Java codec does', () => {
        expect(parseConsumeEffect({ type: 'minecraft:apply_effects', effects: [{ id: 'minecraft:speed' }] })).toEqual({
            kind: 'apply-effects',
            probability: 1,
            effects: [{ id: 'minecraft:speed', durationTicks: 1, amplifier: 0, showIcon: true }]
        });
    });

    it('reads a lone effect object as a one-entry list', () => {
        const parsed = parseConsumeEffect({
            type: 'minecraft:apply_effects',
            effects: { id: 'minecraft:poison', duration: 100, amplifier: 1, show_icon: false }
        });
        expect(parsed).toMatchObject({
            kind: 'apply-effects',
            effects: [{ id: 'minecraft:poison', durationTicks: 100, amplifier: 1, showIcon: false }]
        });
    });

    it('reads a holder set in all three written forms', () => {
        expect(parseConsumeEffect({ type: 'minecraft:remove_effects', effects: '#minecraft:poisons' })).toEqual({
            kind: 'remove-effects',
            effects: { kind: 'tag', tag: 'minecraft:poisons' }
        });
        expect(parseConsumeEffect({ type: 'minecraft:remove_effects', effects: 'minecraft:poison' })).toEqual({
            kind: 'remove-effects',
            effects: { kind: 'entries', entries: ['minecraft:poison'] }
        });
        expect(
            parseConsumeEffect({ type: 'minecraft:remove_effects', effects: ['minecraft:poison', 'minecraft:wither'] })
        ).toEqual({
            kind: 'remove-effects',
            effects: { kind: 'entries', entries: ['minecraft:poison', 'minecraft:wither'] }
        });
    });

    it('defaults the teleport diameter to sixteen', () => {
        expect(parseConsumeEffect({ type: 'minecraft:teleport_randomly' })).toEqual({
            kind: 'teleport-randomly',
            diameter: DEFAULT_TELEPORT_DIAMETER
        });
        expect(parseConsumeEffect({ type: 'minecraft:teleport_randomly', diameter: 4 })).toEqual({
            kind: 'teleport-randomly',
            diameter: 4
        });
    });

    it('drops an effect it does not recognize instead of failing the load', () => {
        expect(parseConsumeEffect({ type: 'minecraft:something_new' })).toBeUndefined();
        expect(parseConsumeEffect({ type: 'minecraft:apply_effects', effects: [] })).toBeUndefined();
        expect(
            parseConsumeEffects({
                on_consume_effects: [{ type: 'minecraft:something_new' }, { type: 'minecraft:clear_all_effects' }]
            })
        ).toEqual([{ kind: 'clear-all-effects' }]);
    });

    it('reads a sound written inline as well as by id', () => {
        expect(parseConsumeEffect({ type: 'minecraft:play_sound', sound: 'minecraft:ui.toast.in' })).toEqual({
            kind: 'play-sound',
            sound: 'minecraft:ui.toast.in'
        });
        expect(
            parseConsumeEffect({ type: 'minecraft:play_sound', sound: { sound_id: 'minecraft:ui.toast.in' } })
        ).toEqual({ kind: 'play-sound', sound: 'minecraft:ui.toast.in' });
    });
});

describe('runConsumeEffects', () => {
    it('draws once per probabilistic effect and leaves the certain ones alone', () => {
        const world = createTestWorld({ randoms: [0.9, 0.1] });
        runConsumeEffects(
            [
                {
                    kind: 'apply-effects',
                    probability: 0.3,
                    effects: [{ id: 'a', durationTicks: 1, amplifier: 0, showIcon: true }]
                },
                {
                    kind: 'apply-effects',
                    probability: 0.3,
                    effects: [{ id: 'b', durationTicks: 1, amplifier: 0, showIcon: true }]
                },
                {
                    kind: 'apply-effects',
                    probability: 1,
                    effects: [{ id: 'c', durationTicks: 1, amplifier: 0, showIcon: true }]
                }
            ],
            source,
            world
        );
        expect(world.performed('apply-effects').map((action) => action.effects[0]?.id)).toEqual(['b', 'c']);
    });

    it('turns the diameter into a radius for the teleport action', () => {
        const world = createTestWorld();
        runConsumeEffects([{ kind: 'teleport-randomly', diameter: 16 }], source, world);
        expect(world.performed('teleport-randomly')[0]?.radius).toBe(8);
    });

    it('clears every effect when the list is a clear rather than a remove', () => {
        const world = createTestWorld();
        runConsumeEffects([{ kind: 'clear-all-effects' }], source, world);
        expect(world.performed('remove-effects')[0]?.effects).toBeUndefined();
    });
});
