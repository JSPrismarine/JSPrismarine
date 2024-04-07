import { describe, it, expect } from 'vitest';

import { Entity } from '../entity/Entity';
import ParseTargetSelector from './ParseTargetSelector';
import Sheep from '../entity/passive/Sheep';

describe('util', () => {
    describe('ParseTargetSelector', () => {
        it('returns source upon "@s"', () => {
            const source = new Entity(null as any, null as any);

            expect(
                ParseTargetSelector({
                    input: '@s',
                    entities: [source],
                    source
                })
            ).toStrictEqual([source]);
        });

        it('returns all players upon "@a"', () => {
            const source = new Entity(null as any, null as any);
            const players = [{ isPlayer: () => true } as any, { isPlayer: () => true } as any];
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
            const source = new Sheep(null as any, null as any);
            const entities = [
                source,
                new Sheep(null as any, null as any),
                new Sheep(null as any, null as any),
                new Sheep(null as any, null as any)
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
            const source = new Sheep(null as any, null as any);
            const player = {
                isPlayer: () => true,
                getType: () => 'minecraft:player'
            } as any;
            const entities = [source, new Sheep(null as any, null as any), new Sheep(null as any, null as any)];

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
            const source = new Sheep(null as any, null as any);
            const player = {
                isPlayer: () => true,
                getType: () => 'minecraft:player'
            } as any;
            const entities = [source, new Sheep(null as any, null as any), new Sheep(null as any, null as any)];

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
