import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';
import type { RandomSource } from '../filterContext';
import { isBribed, spendBribe } from './bribeable';

/** A definition that tames and trusts on the same item, at Bedrock's rounded 0.33. */
const definition = (identifier: string) => ({
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier },
        components: {},
        component_groups: {
            wild: {
                'minecraft:tameable': { probability: 0.33, tame_items: 'bone' },
                'minecraft:trusting': {
                    probability: 0.33,
                    trust_items: ['fish'],
                    trust_event: { event: 'test:on_trust', target: 'self' }
                }
            },
            trusting: { 'minecraft:is_shaking': {} }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['wild'] } },
            'test:on_trust': { remove: { component_groups: ['wild'] }, add: { component_groups: ['trusting'] } }
        }
    }
});

const spawnAt = (identifier: string, roll: number) => {
    const types = new EntityTypes();
    types.load([{ data: definition(identifier), pack: 'vanilla', path: 'entities/test.json' }]);
    const random: RandomSource = { next: () => roll, nextInt: (bound) => Math.floor(roll * bound) };
    return types.spawn(identifier, { environment: { random } });
};

const tames = (identifier: string, roll: number): boolean => {
    const result = spawnAt(identifier, roll).interactWithItemResult('minecraft:bone');
    return typeof result === 'object' && result.tame?.succeeded === true;
};

const trusts = (identifier: string, roll: number): boolean => {
    const entity = spawnAt(identifier, roll);
    const result = entity.interactWithItemResult('minecraft:cod');
    entity.applyQueuedEvents();
    if (result === false) throw new Error('the trust item was refused');
    return entity.activeComponentGroups().includes('trusting');
};

describe("Java's taming and trust odds", () => {
    it("tames a wolf on Java's one in three, where Bedrock's 0.33 falls short", () => {
        expect(tames('minecraft:wolf', 1 / 3 - 0.001)).toBe(true);
        expect(tames('minecraft:wolf', 1 / 3 + 0.001)).toBe(false);
    });

    it("tames a parrot on Java's one in ten", () => {
        expect(tames('minecraft:parrot', 0.099)).toBe(true);
        expect(tames('minecraft:parrot', 0.101)).toBe(false);
    });

    it('keeps the declared probability for a type Java does not have', () => {
        expect(tames('test:pet', 0.3299)).toBe(true);
        expect(tames('test:pet', 0.3301)).toBe(false);
    });

    it("eats an ocelot's food whether or not the roll wins its trust", () => {
        expect(trusts('minecraft:ocelot', 1 / 3 - 0.001)).toBe(true);
        expect(trusts('minecraft:ocelot', 1 / 3 + 0.001)).toBe(false);
        expect(spawnAt('minecraft:ocelot', 0.9).interactWithItemResult('minecraft:stick')).toBe(false);
    });
});

describe('minecraft:bribeable', () => {
    const dolphin = (identifier: string) => {
        const types = new EntityTypes();
        types.load([
            {
                data: {
                    format_version: '1.26.50',
                    'minecraft:entity': {
                        description: { identifier },
                        components: { 'minecraft:bribeable': { bribe_items: ['fish', 'salmon'] } }
                    }
                },
                pack: 'vanilla',
                path: 'entities/dolphin.json'
            }
        ]);
        return types.spawn(identifier);
    };

    it("takes any item of Java's fishes tag from a vanilla dolphin's player and holds the bribe", () => {
        const entity = dolphin('minecraft:dolphin');
        expect(isBribed(entity)).toBe(false);

        const fishes = { javaItemTags: ['minecraft:fishes'] };
        expect(entity.interactWithItemResult('minecraft:cooked_salmon', undefined, fishes)).toEqual({});
        expect(isBribed(entity)).toBe(true);
        // Java eats every fish it is offered, with no cooldown between them.
        expect(entity.interactWithItemResult('minecraft:pufferfish', undefined, fishes)).toEqual({});

        spendBribe(entity);
        expect(isBribed(entity)).toBe(false);
        expect(entity.interactWithItemResult('minecraft:cod', undefined, { javaItemTags: [] })).toBe(false);
    });

    it('keeps the listed items and the cooldown for a type Java does not have', () => {
        const entity = dolphin('test:dolphin');
        expect(entity.interactWithItemResult('minecraft:cooked_salmon')).toBe(false);
        expect(entity.interactWithItemResult('minecraft:cod')).toEqual({});
        expect(entity.interactWithItemResult('minecraft:salmon')).toBe(false);
    });
});
