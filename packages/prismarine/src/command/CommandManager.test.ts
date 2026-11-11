import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from '../';
import type { ChatManager } from '../chat/ChatManager';
import type { ServerContent } from '../content/ServerContent';
import Console from '../Console';
import type Player from '../Player';
import { PermissionManager } from '../permission/PermissionManager';
import type SessionManager from '../SessionManager';
import { stub } from '../testing/stub.test.helper';
import { playerOnPrototype } from '../testing/playerDouble.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type GameRuleManager from '../world/GameRuleManager';
import type { GameRuleEntry } from '../world/GameRuleManager';
import { Dimensions } from '../world/Dimension';
import { Position } from '../world/Position';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { testContent } from '../testing/entityServer';
import type { ConsoleSender } from './ConsoleSender';
import { CommandManager, commandPermissionOf } from './CommandManager';
import { JSPRISMARINE_COMMAND_PERMISSIONS } from './jsprismarineCommands';
import { identityNamed } from '../testing/sessionIdentity.test.helper';

describe('command', () => {
    describe('CommandManager', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {},
                info: () => {},
                warn: () => {},
                error: () => {}
            }),
            getSessionManager: () => ({
                getAllPlayers: () => []
            }),
            // No content build, which is what decides whether the commands
            // whose subsystem is the pack stack are registered at all.
            getContent: () => testContent(),
            on: vi.fn(),
            emit: vi.fn().mockResolvedValue({})
        }))();

        it("registers this server's own commands in the same registry as the vanilla set", async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const names = commandManager.getVanillaCommands().getNames();
            for (const name of Object.keys(JSPRISMARINE_COMMAND_PERMISSIONS)) expect(names).toContain(name);
            expect(names).toContain('teleport');
            expect(commandManager.vanillaName('about')).toBe('version');
        });

        it('gates each command by the permission node it has always used', () => {
            expect(commandPermissionOf('tps')).toBe('jsprismarine.command.tps');
            expect(commandPermissionOf('version')).toBe('jsprismarine.command.version');
            expect(commandPermissionOf('ban')).toBe('minecraft.command.ban');
            expect(commandPermissionOf('teleport')).toBe('minecraft.command.teleport');
        });

        it('keeps pre-enable tree access and reuses one flattened list', () => {
            const commandManager = new CommandManager(server);
            const tree = commandManager.getVanillaCommands();
            const commands = commandManager.getVanillaCommandList();

            expect(commandManager.getVanillaCommands()).toBe(tree);
            expect(commandManager.getVanillaCommandList()).toBe(commands);
            expect(commands.map(({ name }) => name)).toContain('teleport');
        });

        /** A manager whose permission checks are observable, plus the spy watching them. */
        const managerWithPermissionSpy = (granted = true) => {
            const can = vi.fn().mockReturnValue({ execute: () => granted });
            // A working rule store rather than an empty one: the vanilla `/gamerule` reads
            // and writes through it, and `sendCommandFeedback` decides whether a success
            // message reaches the sender at all.
            const rules = new Map<string, GameRuleEntry>([
                ['sendCommandFeedback', [true, true]],
                ['fallDamage', [true, true]]
            ]);
            const gameRules = stub<GameRuleManager>({
                getGameRule: (name: string) => rules.get(name) ?? null,
                setGameRule: (name: string, value: boolean | number, editable: boolean) => {
                    rules.set(name, [value, editable]);
                }
            });
            const world = stub<World>({ getGameRuleManager: () => gameRules });
            const worldManager = stub<WorldManager>({ getDefaultWorld: () => world });

            return {
                can,
                rules,
                commandManager: new CommandManager(
                    stub<Server>({
                        ...server,
                        getPermissionManager: () => stub<PermissionManager>({ can }),
                        getWorldManager: () => worldManager
                    })
                )
            };
        };

        it('should not consult permissions for a console-issued command', async () => {
            // The console is the process operator, so it is trusted by existing rather than
            // by holding a permission node. That used to be an `isConsole()` bypass inside
            // the permission manager, which only worked because the console pretended to be
            // an entity; the trust now lives here, where the sender's kind is known.
            const { can, commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            await commandManager.dispatchCommand(console, console, '/help');

            expect(can).not.toHaveBeenCalled();
        });

        it('should consult permissions for a player-issued command, and stop on refusal', async () => {
            // The other half of the pair: dropping the console from the check must not have
            // dropped it for everyone.
            const { can, commandManager } = managerWithPermissionSpy(false);
            await commandManager.enable();

            // Prototype-only: a real player needs a live connection, and a refused command
            // returns before anything would reach for one.
            const player = playerOnPrototype();
            const sendMessage = vi.spyOn(player, 'sendMessage').mockResolvedValue();

            await expect(commandManager.dispatchCommand(player, player, '/help')).resolves.toBe(false);

            // By identity: letting vitest pretty-print a prototype-only player walks into
            // `toString()`, which reaches for metadata and a world it has never been given.
            expect(can.mock.calls.length).toBe(1);
            expect(can.mock.calls[0]?.[0]).toBe(player);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('do not have permission'));
        });

        it('should list each command once, with the overloads of every branch', async () => {
            // The client keys commands by name, so a command reaching it twice leaves it with
            // whichever copy it read last.
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const list = commandManager.getVanillaCommandList();
            const names = list.map(({ name }) => name);
            expect(new Set(names).size).toBe(names.length);

            const overloadsOf = (name: string) => list.find((command) => command.name === name)?.overloads;
            // `/ban <player>` and `/ban <player> <reason>`.
            expect(overloadsOf('ban')?.map((overload) => overload.parameters.length)).toEqual([1, 2]);
            // `/version` runs bare and takes nothing else.
            expect(overloadsOf('version')?.map((overload) => overload.parameters.length)).toEqual([0]);
        });

        it('should dispatch a vanilla command through the command layer', async () => {
            // `/gamerule <rule>` reads through the host, so the value reaching the console
            // proves the vanilla tree parsed it and the host answered.
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/gamerule fall_damage true')).resolves.toBe(
                true
            );
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('minecraft:fall_damage = true'));
        });

        it('should refuse a command that is not registered', async () => {
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(
                commandManager.dispatchCommand(console, console, '/jsprismarine_test_command_does_not_exist')
            ).resolves.toBe(false);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });

        it('should resolve to true once a command has run', async () => {
            // `CommandRequestHandler` reports this to the client as the reply's success count.
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            vi.spyOn(console, 'sendMessage').mockImplementation(() => {});
            await expect(commandManager.dispatchCommand(console, console, '/gamerule fall_damage')).resolves.toBe(true);
        });

        it('should refuse an unknown command without throwing at the caller', async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/nope')).resolves.toBe(false);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });

        describe('permission config integration', () => {
            let directory: string;

            beforeEach(() => {
                directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-command-permission-test-'));
                vi.stubEnv('JSP_DIR', directory);
            });

            afterEach(() => {
                vi.unstubAllEnvs();
                rmSync(directory, { recursive: true, force: true });
            });

            it('lets the default UUID owner run /op and persists the target UUID', async () => {
                const ownerUuid = 'fbf8646c-652c-38c4-96ff-a29d86cb5943';
                const targetUuid = '00000000-0000-0000-0000-000000000007';
                const logger = stub<Logger>({
                    debug: () => {},
                    verbose: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {}
                });
                // Annotated, because these three doubles refer to each other in a cycle -
                // a player knows its server, the server its session manager, and that manager
                // the player - which inference alone cannot resolve.
                // A vanilla command names its targets as `EntityRef`s and resolves them back by
                // scanning the loaded worlds, so a target's body has to have a runtime id, a
                // position and a world the way a connected player's does.
                const body = {
                    runtimeId: 2n,
                    getFeetY: () => 64,
                    getPosition: () => new Position(0, 64, 0, world),
                    getWorld: () => world
                };
                const target: Player = playerOnPrototype(
                    {
                        getName: () => 'Target',
                        getUUID: () => UUID.fromString(targetUuid),
                        // The command host reads who the target is off its session.
                        getNetworkSession: () =>
                            stub<ReturnType<Player['getNetworkSession']>>({
                                identity: identityNamed('Target', targetUuid),
                                sendAvailableCommands: async () => {}
                            }),
                        getServer: () => server,
                        sendSettings: async () => {}
                    },
                    body
                );
                const sessionManager: SessionManager = stub<SessionManager>({
                    // Both, and agreeing: a vanilla command resolves its targets through the
                    // player list where a legacy one looked the name up directly.
                    getAllPlayers: () => [target],
                    getPlayerByExactName: (name) => (name === 'Target' ? target : null)
                });
                const permissionManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    post: () => 0
                });
                const console = stub<ConsoleSender>({
                    getName: () => 'Console',
                    getFormattedUsername: () => 'Console',
                    getServer: () => server,
                    sendMessage: () => {}
                });
                const world = stub<World>({
                    getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
                    getDimension: () => Dimensions.Overworld,
                    getEntities: () => [target.getBody()],
                    getActors: () => [target.getBody()],
                    getActor: (runtimeId: bigint) => (runtimeId === target.getRuntimeId() ? target.getBody() : null),
                    viewerOf: (runtimeId: bigint) =>
                        runtimeId === target.getRuntimeId() ? target.getNetworkSession() : undefined
                });
                const server: Server = stub<Server>({
                    // Empty registries rather than no content: `enable` builds the vanilla
                    // command set from them, so the arguments validate against Mojang's lists
                    // alone, which is what a server with no pack stack offers.
                    getContent: () =>
                        stub<ServerContent>({
                            entities: stub<ServerContent['entities']>({
                                registry: stub<ServerContent['entities']['registry']>({ keys: () => [] })
                            }),
                            blocks: stub<ServerContent['blocks']>({ types: new Map() }),
                            items: stub<ServerContent['items']>({ types: new Map() }),
                            enchantments: stub<ServerContent['enchantments']>({ ids: [] }),
                            definitions: stub<ServerContent['definitions']>({ damageTypes: new Map() })
                        }),
                    emit: async () => {},
                    post: () => 0,
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    getPermissionManager: () => permissionManager,
                    getConsoleSender: () => console,
                    getChatManager: () => stub<ChatManager>({ send: async () => {} }),
                    getWorldManager: () =>
                        stub<WorldManager>({
                            getDefaultWorld: () => world,
                            getLevels: () => [
                                stub<Level>({
                                    worlds: function* () {
                                        yield world;
                                    }
                                })
                            ]
                        })
                });
                const permissionOwner = stub<Player>({
                    getName: () => 'Filfat',
                    getUUID: () => UUID.fromString(ownerUuid),
                    isOp: () => false,
                    getPermissions: () => []
                });

                await permissionManager.enable();
                const grants = await permissionManager.getPermissions(permissionOwner);
                const owner = playerOnPrototype({
                    getName: () => 'Filfat',
                    getUUID: () => UUID.fromString(ownerUuid),
                    getRuntimeId: () => 1n,
                    getPermissions: () => grants,
                    isOp: () => permissionManager.isOp(ownerUuid),
                    getType: () => 'minecraft:player',
                    getFeetY: () => 64,
                    getPosition: () => new Position(0, 64, 0, world),
                    getWorld: () => world,
                    getServer: () => server,
                    sendMessage: async () => {}
                });
                const commandManager = new CommandManager(server);
                await commandManager.enable();

                await expect(commandManager.dispatchCommand(owner, owner, '/op Target')).resolves.toBe(true);

                expect(permissionManager.isOp(targetUuid)).toBe(true);
                expect(permissionManager.isOp('Target')).toBe(false);

                const reloadedManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    post: () => 0
                });
                await reloadedManager.enable();
                expect(reloadedManager.isOp(targetUuid)).toBe(true);
            });
        });
    });
});
