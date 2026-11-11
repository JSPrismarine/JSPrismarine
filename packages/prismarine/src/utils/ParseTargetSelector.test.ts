import { describe, expect, it } from 'vitest';

import Player from '../Player';
import { Entity } from '../entity/Entity';
import { GenericEntity } from '../testing/genericEntity.test.helper';
import { testEntityServer } from '../testing/entityServer';
import { stub, stubOf } from '../testing/stub.test.helper';
import type { World } from '../world';
import { Position } from '../world/Position';
import ParseTargetSelector from './ParseTargetSelector';

/**
 * Just enough world for an entity to stand in one.
 *
 * A position now insists on having a world, and an entity takes its server from that world,
 * so `null` no longer stands in for either - which is the point of the change: an entity
 * that is nowhere is not a state the type system should have allowed.
 */
const fakeWorld = () =>
    stub<World>({ getName: () => 'test-world', getServer: () => testEntityServer(), getEntities: () => [] });

/** An entity somewhere, since where exactly does not matter to a selector. */
const somewhere = () => new Position(0, 0, 0, fakeWorld());

/** A mob-shaped body, which is what the runtime gives every mob and what a selector meets. */
const sheep = () => new GenericEntity({ identifier: 'minecraft:sheep', position: somewhere() });

/**
 * A stand-in that answers the player's type without a connection behind it.
 *
 * The selector tells players apart by their type, which a double built from the player's
 * prototype answers through its class. Going through the prototype rather than the
 * constructor keeps the network session out of a unit test.
 */
const fakePlayer = () => stubOf(Player);

describe('utils', () => {
    describe('ParseTargetSelector', () => {
        it('returns source upon "@s"', () => {
            const source = new Entity({ position: somewhere() });

            expect(
                ParseTargetSelector({
                    input: '@s',
                    entities: [source],
                    source
                })
            ).toStrictEqual([source]);
        });

        it('returns all players upon "@a"', () => {
            const source = new Entity({ position: somewhere() });
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
    });
});
