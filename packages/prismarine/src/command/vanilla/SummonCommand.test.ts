import { CommandDispatcher } from '@jsprismarine/brigadier';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { CommandExecutor } from '../CommandExecutor';
import SummonCommand from './SummonCommand';

describe('command', () => {
    describe('vanilla', () => {
        describe('SummonCommand', () => {
            let dispatcher: CommandDispatcher<CommandExecutor>;
            let addEntity: ReturnType<typeof vi.fn<World['addEntity']>>;
            let world: World;
            let player: Player;

            beforeEach(async () => {
                addEntity = vi.fn<World['addEntity']>(async () => {});
                world = stub<World>({
                    getName: () => 'world',
                    getServer: () => stub<Server>(),
                    addEntity
                });
                player = stubOf(Player, {
                    getWorld: () => world,
                    getPosition: () => new Position(14.85, 5.62, 17.61, world),
                    sendMessage: vi.fn<Player['sendMessage']>(async () => {})
                });

                dispatcher = new CommandDispatcher();
                await new SummonCommand().register(dispatcher);
            });

            it('adds the mob to the world the summoner stands in', async () => {
                // The summon call once handed the world in as the options object, so the mob's
                // world came out undefined and `/debug` printed `world: none`.
                await dispatcher.execute('summon cat', player);

                expect(addEntity).toHaveBeenCalledTimes(1);
                const mob = addEntity.mock.calls[0]?.[0];
                expect(mob?.getWorld()).toBe(world);
                expect(mob?.getType()).toBe('minecraft:cat');
            });

            it('puts the mob where the summoner stands', async () => {
                await dispatcher.execute('summon cat', player);

                const position = addEntity.mock.calls[0]?.[0]?.getPosition();
                expect(position?.getX()).toBe(14.85);
                expect(position?.getY()).toBe(5.62);
                expect(position?.getZ()).toBe(17.61);
            });

            it('names the world when the mob describes itself', async () => {
                await dispatcher.execute('summon cat', player);

                // The exact text `/debug` prints for the entity's world.
                expect(addEntity.mock.calls[0]?.[0]?.toString()).toContain('world: §bworld§r');
            });

            it('tells the summoner what was summoned', async () => {
                await dispatcher.execute('summon cat', player);

                expect(player.sendMessage).toHaveBeenCalledWith('Summoned minecraft:cat');
            });
        });
    });
});
