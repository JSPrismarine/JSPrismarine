import { CommandDispatcher } from '@jsprismarine/brigadier';
import { Vector3 } from '@jsprismarine/math';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import MovementType from '../../network/type/MovementType';
import { stub, stubOf } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { CommandExecutor } from '../CommandExecutor';
import TpCommand from './TpCommand';

type SetPosition = ReturnType<typeof vi.fn<Player['setPosition']>>;

describe('command', () => {
    describe('vanilla', () => {
        describe('TpCommand', () => {
            let dispatcher: CommandDispatcher<CommandExecutor>;
            let self: Player;
            let other: Player;
            let moveSelf: SetPosition;
            let moveOther: SetPosition;

            /** A player standing still at (x, y, z) whose moves are recorded rather than made. */
            const playerAt = (name: string, x: number, y: number, z: number, world: World) => {
                const setPosition = vi.fn<Player['setPosition']>(async () => {});
                const player = stubOf(Player, {
                    getName: () => name,
                    getFormattedUsername: () => name,
                    getPosition: () => new Position(x, y, z, world),
                    getWorld: () => world,
                    getServer: () => world.getServer(),
                    sendMessage: async () => {},
                    setPosition
                });
                return { player, setPosition };
            };

            beforeEach(async () => {
                const players: Player[] = [];
                const world = stub<World>({
                    getName: () => 'test',
                    getEntities: () => players,
                    getServer: () =>
                        stub<Server>({
                            getSessionManager: () =>
                                stub<SessionManager>({
                                    getPlayerByExactName: (name) =>
                                        players.find((player) => player.getName() === name) ?? null
                                })
                        })
                });

                ({ player: self, setPosition: moveSelf } = playerAt('filfat', 10, 64, 20, world));
                ({ player: other, setPosition: moveOther } = playerAt('Steve', -5, 70, 3, world));
                players.push(self, other);

                dispatcher = new CommandDispatcher();
                await new TpCommand().register(dispatcher);
            });

            /** Runs a command the way `CommandManager` does, so a failing command rejects. */
            const run = (input: string, source: CommandExecutor = self) =>
                Promise.all(dispatcher.execute(input, source));

            /** The destination of the one move a player made, with the coordinates spelled out. */
            const destination = (setPosition: SetPosition) => {
                expect(setPosition).toHaveBeenCalledTimes(1);
                const [options] = setPosition.mock.calls[0]!;
                return {
                    type: options.type,
                    x: options.position.getX(),
                    y: options.position.getY(),
                    z: options.position.getZ()
                };
            };

            it('should have correct properties', () => {
                const command = new TpCommand();
                expect(command.id).toBe('minecraft:tp');
                expect(command.aliases).toContain('teleport');
                expect(command.permission).toBe('minecraft.command.teleport');
            });

            // Issue #460: `@s` parsed as a position of (NaN, NaN, NaN) and won over the
            // player branch, so teleporting to yourself sent you to -2147483648.
            it.each(['tp @s @s', 'tp filfat filfat'])('"%s" keeps the player where they stand', async (input) => {
                await run(input);

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: 10, y: 64, z: 20 });
                expect(moveOther).not.toHaveBeenCalled();
            });

            it('teleports a player to another player', async () => {
                await run('tp filfat Steve');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: -5, y: 70, z: 3 });
                expect(moveOther).not.toHaveBeenCalled();
            });

            it('teleports the source to a named player', async () => {
                await run('tp Steve');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: -5, y: 70, z: 3 });
            });

            it('teleports the source to itself with a bare selector', async () => {
                await run('tp @s');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: 10, y: 64, z: 20 });
            });

            // Numbers used to be tried as a player name first, and "1" is nobody.
            it('teleports to absolute coordinates, centered on the block', async () => {
                await run('tp 1 2 3');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: 1.5, y: 2, z: 3.5 });
            });

            it('centers negative coordinates towards positive infinity too', async () => {
                await run('tp -5 70 -3');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: -4.5, y: 70, z: -2.5 });
            });

            it('leaves fractional coordinates as written', async () => {
                await run('tp 1.25 2 3.75');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: 1.25, y: 2, z: 3.75 });
            });

            it('resolves relative coordinates against the source', async () => {
                await run('tp ~ ~ ~');

                expect(destination(moveSelf)).toEqual({ type: MovementType.Teleport, x: 10.5, y: 64, z: 20.5 });
            });

            it('teleports another player to coordinates', async () => {
                await run('tp Steve ~ ~10 ~');

                expect(destination(moveOther)).toEqual({ type: MovementType.Teleport, x: 10.5, y: 74, z: 20.5 });
                expect(moveSelf).not.toHaveBeenCalled();
            });

            it('rejects two coordinates', async () => {
                await expect(run('tp 1 2')).rejects.toThrow();

                expect(moveSelf).not.toHaveBeenCalled();
            });

            it('rejects a player who is not online', async () => {
                await expect(run('tp Alex')).rejects.toThrow('Cannot find the destination');

                expect(moveSelf).not.toHaveBeenCalled();
            });

            it('refuses to teleport the console anywhere', async () => {
                const console = stub<CommandExecutor>({
                    getName: () => 'console',
                    getFormattedUsername: () => 'console',
                    sendMessage: () => {},
                    getServer: () => self.getServer()
                });

                await expect(run('tp 1 2 3', console)).rejects.toThrow("can't be run from the console");
            });

            it('never hands a non-finite position to the player', async () => {
                await Promise.allSettled(
                    ['tp @s @s', 'tp filfat filfat', 'tp 1 2 3', 'tp ~ ~ ~', 'tp @s'].map((input) => run(input))
                );

                for (const [{ position }] of moveSelf.mock.calls) {
                    expect(position).toBeInstanceOf(Vector3);
                    expect([position.getX(), position.getY(), position.getZ()].every(Number.isFinite)).toBe(true);
                }
                expect(moveSelf.mock.calls.length).toBe(5);
            });
        });
    });
});
