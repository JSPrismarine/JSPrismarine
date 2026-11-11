import { describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';

import ParseTargetSelector from './ParseTargetSelector';
import type { SelectorEntity } from './ParseTargetSelector';

/** Every double gets its own id, as a world's entities do. */
let nextId = 1n;

/** An entity of a type, standing at a point, which is all a selector reads. */
const entityAt = (type: string, x = 0): SelectorEntity => {
    const id = nextId++;
    return {
        getRuntimeId: () => id,
        getType: () => type,
        getName: () => type,
        getPosition: () => new Vector3(x, 0, 0)
    };
};

/** A mob, which a selector tells apart from a player by its type. */
const sheep = (x = 0) => entityAt('minecraft:sheep', x);

/** A player, as this selector meets one: an entity of the player's type. */
const fakePlayer = (x = 0) => Object.assign(entityAt('minecraft:player', x), { gamemode: 0 });

describe('utils', () => {
    describe('ParseTargetSelector', () => {
        it('returns source upon "@s"', () => {
            const source = entityAt('minecraft:armor_stand');

            expect(
                ParseTargetSelector({
                    input: '@s',
                    entities: [source],
                    source
                })
            ).toStrictEqual([source]);
        });

        it('returns all players upon "@a"', () => {
            const source = entityAt('minecraft:armor_stand');
            const players = [fakePlayer(), fakePlayer()];
            const entities = [source, ...players];

            expect(
                ParseTargetSelector({
                    input: '@a',
                    entities,
                    source
                })
            ).toStrictEqual(players);
        });

        it('returns all entities upon "@e"', () => {
            const source = sheep();
            const entities = [source, sheep(), sheep(), sheep()];

            expect(
                ParseTargetSelector({
                    input: '@e',
                    entities,
                    source
                })
            ).toStrictEqual(entities);
        });

        it('uses the supplied random source for "@r"', () => {
            const source = sheep();
            const entities = [source, sheep(), sheep()];
            let draws = 0;

            expect(
                ParseTargetSelector({
                    input: '@r',
                    entities,
                    source,
                    random: () => {
                        draws++;
                        return 0.75;
                    }
                })
            ).toStrictEqual([entities[2]]);
            expect(draws).toBe(1);
        });

        it('returns all non player entities upon "@e[type=!player]"', () => {
            const source = sheep();
            const player = fakePlayer();
            const entities = [source, sheep(), sheep()];

            expect(
                ParseTargetSelector({
                    input: '@e[type=!player]',
                    entities: [...entities, player],
                    source
                })
            ).toStrictEqual(entities);

            expect(
                ParseTargetSelector({
                    input: '@e[type=!minecraft:player]',
                    entities: [...entities, player],
                    source
                })
            ).toStrictEqual(entities);
        });

        it('returns only player entities upon "@e[type=player]"', () => {
            const source = sheep();
            const player = fakePlayer();
            const entities = [source, sheep(), sheep()];

            expect(
                ParseTargetSelector({
                    input: '@e[type=player]',
                    entities: [...entities, player],
                    source
                })
            ).toStrictEqual([player]);

            expect(
                ParseTargetSelector({
                    input: '@e[type=minecraft:player]',
                    entities: [...entities, player],
                    source
                })
            ).toStrictEqual([player]);
        });

        it('returns the nearest other player upon "@p"', () => {
            const source = fakePlayer(0);
            const near = fakePlayer(2);
            const entities = [source, fakePlayer(5), near, sheep(1)];

            expect(ParseTargetSelector({ input: '@p', entities, source })).toStrictEqual([near]);
        });
    });
});
