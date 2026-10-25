import { describe, expect, it } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import { Entity } from '../entity/Entity';
import { GenericEntity } from '../entity/GenericEntity';
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
    stub<World>({ getName: () => 'test-world', getServer: () => stub<Server>(), getEntities: () => [] });

/** An entity somewhere, since where exactly does not matter to a selector. */
const somewhere = () => new Position(0, 0, 0, fakeWorld());

/** A mob-shaped body, which is what the runtime gives every mob and what a selector meets. */
const sheep = () => new GenericEntity({ identifier: 'minecraft:sheep', position: somewhere() });

/**
 * A stand-in that answers `instanceof Player` without a connection behind it.
 *
 * The selector tells players apart by their class rather than by asking them, so an object
 * carrying the right methods no longer passes for one. Going through the prototype rather
 * than the constructor keeps the network session out of a unit test.
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
