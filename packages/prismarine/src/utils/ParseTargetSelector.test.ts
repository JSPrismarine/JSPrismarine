import { describe, expect, it } from 'vitest';

import Player from '../Player';
import { Entity } from '../entity/Entity';
import Sheep from '../entity/passive/Sheep';
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
    ({ getName: () => 'test-world', getServer: () => null, getEntities: () => [] }) as unknown as World;

/** An entity somewhere, since where exactly does not matter to a selector. */
const somewhere = () => new Position(0, 0, 0, fakeWorld());

/**
 * A stand-in that answers `instanceof Player` without a connection behind it.
 *
 * The selector tells players apart by their class rather than by asking them, so an object
 * carrying the right methods no longer passes for one. Going through the prototype rather
 * than the constructor keeps the network session out of a unit test.
 */
const fakePlayer = () => Object.create(Player.prototype) as Player;

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
            const source = new Sheep({ position: somewhere() });
            const entities = [
                source,
                new Sheep({ position: somewhere() }),
                new Sheep({ position: somewhere() }),
                new Sheep({ position: somewhere() })
            ];

            expect(
                ParseTargetSelector({
                    input: '@e',
                    entities,
                    source
                })
            ).toStrictEqual(entities);
        });

        it('returns all non player entities upon "@e[type=!player]"', () => {
            const source = new Sheep({ position: somewhere() });
            const player = fakePlayer();
            const entities = [source, new Sheep({ position: somewhere() }), new Sheep({ position: somewhere() })];

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
            const source = new Sheep({ position: somewhere() });
            const player = fakePlayer();
            const entities = [source, new Sheep({ position: somewhere() }), new Sheep({ position: somewhere() })];

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
