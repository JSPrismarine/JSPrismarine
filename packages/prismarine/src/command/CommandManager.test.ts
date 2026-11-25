import { testKernel } from '../testing/kernel.test.helper';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Server from '../Server';
import type { ChatManager } from '../chat/ChatManager';
import type { Config } from '../config/Config';
import type { ServerContent } from '../content/ServerContent';
import Console from '../Console';
import type PlayerSession from '../player/PlayerSession';
import { PermissionManager } from '../permission/PermissionManager';
import type SessionManager from '../SessionManager';
import { stub } from '../testing/stub.test.helper';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import type GameRuleManager from '../world/GameRuleManager';
import type { GameRuleEntry } from '../world/GameRuleManager';
import { Dimensions } from '../world/DimensionType';
import { Position } from '../world/Position';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { testContent } from '../testing/entityServer';
import type { CommandExecutor } from './CommandExecutor';
import type { ConsoleSender } from './ConsoleSender';
import { CommandManager, commandPermissionOf } from './CommandManager';
import { JSPRISMARINE_COMMAND_PERMISSIONS } from './jsprismarineCommands';

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
                getSessions: () => []
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
            const level: Level = stub<Level>({ loadedWorld: () => world });
            const world: World = stub<World>({ getGameRuleManager: () => gameRules, getLevel: () => level });
            const worldManager = stub<WorldManager>({ getEntryWorld: () => world, getEntryLevel: () => level });

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

        describe('a command block', () => {
            /** A manager over one world whose rules a command block reads, with that world. */
            const commandBlockWorld = (commandBlocksEnabled = true) => {
                const rules = new Map<string, GameRuleEntry>([
                    ['sendcommandfeedback', [true, true]],
                    ['falldamage', [true, true]],
                    ['commandblocksenabled', [commandBlocksEnabled, true]]
                ]);
                const gameRules = stub<GameRuleManager>({
                    getGameRule: (name: string) => rules.get(name.toLowerCase()) ?? null,
                    findGameRule: (name: string) => rules.get(name.toLowerCase()),
                    setGameRule: (name: string, value: boolean | number, editable: boolean) => {
                        rules.set(name.toLowerCase(), [value, editable]);
                    }
                });
                const level: Level = stub<Level>({ loadedWorld: () => world, name: 'world' });
                const worldManager = stub<WorldManager>({ getEntryWorld: () => world, getEntryLevel: () => level });
                const blockServer = stub<Server>({ ...server, getWorldManager: () => worldManager });
                const world: World = stub<World>({
                    getGameRuleManager: () => gameRules,
                    getLevel: () => level,
                    getDimension: () => Dimensions.Overworld,
                    getServer: () => blockServer
                });
                return { world, rules, commandManager: new CommandManager(blockServer) };
            };

            it('runs from the block, counting a success and keeping the last line it answered', async () => {
                const { world, rules, commandManager } = commandBlockWorld();
                await commandManager.enable();

                const run = commandManager.runCommandBlock(
                    world,
                    { x: 1, y: 2, z: 3 },
                    '/gamerule fallDamage false',
                    '!'
                );

                expect(run?.successCount).toBe(1);
                expect(run?.output).not.toBe('');
                expect(rules.get('falldamage')?.[0]).toBe(false);
            });

            it('counts a command that succeeds with a result of 0 as a success', async () => {
                const { world, rules, commandManager } = commandBlockWorld();
                await commandManager.enable();
                rules.set('falldamage', [false, true]);

                const run = commandManager.runCommandBlock(world, { x: 0, y: 0, z: 0 }, 'gamerule fallDamage', '!');

                expect(run?.successCount).toBe(1);
            });

            it('counts a line that does not parse as no success, with the syntax error as its output', async () => {
                const { world, commandManager } = commandBlockWorld();
                await commandManager.enable();

                const run = commandManager.runCommandBlock(
                    world,
                    { x: 0, y: 0, z: 0 },
                    'gamerule fallDamage maybe',
                    '!'
                );

                expect(run?.successCount).toBe(0);
                expect(run?.output).toMatch(/Syntax error/);
            });

            it('runs nothing while the commandblocksenabled rule is off', async () => {
                const { world, rules, commandManager } = commandBlockWorld(false);
                await commandManager.enable();

                expect(
                    commandManager.runCommandBlock(world, { x: 0, y: 0, z: 0 }, 'gamerule fallDamage false', '!')
                ).toBeUndefined();
                expect(rules.get('falldamage')?.[0]).toBe(true);
            });
        });

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
            const player = sessionOnPrototype();
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

        it('describes every command once for the console, each form starting with its name', async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const reference = commandManager.commandReference();
            const names = reference.map(({ name }) => name);
            expect(names).toEqual(
                [...commandManager.getVanillaCommands().getNames()].sort((a, b) => a.localeCompare(b))
            );
            for (const command of reference) {
                expect(command.usage.length, command.name).toBeGreaterThan(0);
                for (const form of command.usage) expect(form.split(' ')[0], command.name).toBe(command.name);
            }
            const teleport = reference.find(({ name }) => name === 'teleport');
            expect(teleport?.aliases).toContain('tp');
            expect(teleport?.description).toBeDefined();
            // Several forms: a destination, or targets and a position.
            expect(teleport?.usage.length).toBeGreaterThan(1);
            // Every part after the name has a word count, and multi-word arguments say so.
            for (const command of reference) {
                expect(command.usageWords, command.name).toHaveLength(command.usage.length);
                command.usage.forEach((form, index) => {
                    expect(command.usageWords[index], form).toHaveLength(form.split(' ').length - 1);
                });
            }
            /** The word count of `part` in each of `name`'s forms that has it. */
            const wordsOf = (name: string, part: string) => {
                const command = reference.find((entry) => entry.name === name);
                return (command?.usage ?? []).flatMap((form, index) => {
                    const at = form.split(' ').indexOf(part);
                    return at > 0 ? [command?.usageWords[index]?.[at - 1]] : [];
                });
            };
            expect(wordsOf('teleport', '<location>')).toContain(3);
            expect(wordsOf('say', '<message>')).toEqual(['rest']);
            // A list capped like /help's says so, exactly where /help says more forms exist.
            for (const command of reference) {
                const helpCapped = commandManager.usageLines(command.name).some((line) => line.includes('More forms'));
                expect(command.moreUsage === true, command.name).toBe(helpCapped);
            }
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

        it("runs a script's command at once, and returns its success count or its error", async () => {
            const { commandManager, rules } = managerWithPermissionSpy();
            await commandManager.enable();

            expect(
                commandManager.runScriptCommand('gamerule fall_damage false', { dimension: 'minecraft:overworld' })
            ).toEqual({
                successCount: 1
            });
            expect(rules.get('fallDamage')?.[0]).toBe(false);
            expect(commandManager.runScriptCommand('nope', { dimension: 'minecraft:overworld' })).toEqual({
                error: expect.stringContaining('Unknown command')
            });
        });

        it('selects for a script by the Bedrock grammar, and refuses a selector that does not parse or has text after it', async () => {
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();
            const source = { dimension: 'minecraft:overworld' };

            expect(commandManager.selectForScript('@a[tag=vip]', source)).toEqual([]);
            expect(commandManager.selectForScript('@a[tag=vip] ', source)).toEqual([]);
            expect(commandManager.selectForScript('@a[tag=vip]junk', source)).toBeUndefined();
            expect(commandManager.selectForScript('@a[tag=', source)).toBeUndefined();
        });

        it('should refuse an unknown command without throwing at the caller', async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/nope')).resolves.toBe(false);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });

        /** A manager over the test server with some of its parts replaced, and feedback on. */
        const managerOver = (parts: Partial<Server>, onStopCommandComplete?: (stopped: boolean) => void) => {
            const gameRules = stub<GameRuleManager>({
                getGameRule: (name: string) => (name === 'sendCommandFeedback' ? [true, true] : null)
            });
            const level: Level = stub<Level>({ loadedWorld: () => world });
            const world: World = stub<World>({ getGameRuleManager: () => gameRules, getLevel: () => level });
            return new CommandManager(
                stub<Server>({
                    ...server,
                    getWorldManager: () =>
                        stub<WorldManager>({ getEntryWorld: () => world, getEntryLevel: () => level }),
                    ...parts
                }),
                onStopCommandComplete
            );
        };

        // What the pinned Bedrock Dedicated Server prints at its console for each line.
        it.each([
            ['/time set', 'Syntax error: Unexpected "": at "/time set>><<"'],
            ['/time nonsense', 'Syntax error: Unexpected "nonsense": at "/time >>nonsense<<"'],
            ['/time set 100 extra', 'Syntax error: Unexpected "extra": at "e set 100 >>extra<<"'],
            ['/time add abc', 'Syntax error: Unexpected "abc": at "/time add >>abc<<"'],
            ['/give @s diamond abc', 'Syntax error: Unexpected "abc": at "s diamond >>abc<<"'],
            ['/gamerule doDaylightCycle notabool', 'Syntax error: Unexpected "notabool": at "ightCycle >>notabool<<"'],
            ['/weather clear abc', 'Syntax error: Unexpected "abc": at "her clear >>abc<<"'],
            ['/difficulty bogus', 'Syntax error: Unexpected "bogus": at "ifficulty >>bogus<<"'],
            ['/time set 1.5', 'Syntax error: Unexpected "1.5": at "/time set >>1.5<<"'],
            ['/tp ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x', 'Syntax error: Unexpected "~": at "~ ~ ~ ~ ~ >>~<< ~ ~ ~ ~ ~"'],
            ['/effect @a speed 10 1 notabool', 'Syntax error: Unexpected "notabool": at "peed 10 1 >>notabool<<"']
        ])('refuses %s with the syntax error BDS words', async (line, expected) => {
            const commandManager = managerOver({});
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, line)).resolves.toBe(false);
            expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([`§c${expected}`]);
        });

        // 1.26.60 looks a word up as a time marker, so these parse and the command refuses them.
        it.each([
            ['/time set nonsense', "Cannot find time marker 'nonsense' on 'minecraft:overworld'"],
            ['/time   set   nonsense', "Cannot find time marker 'nonsense' on 'minecraft:overworld'"],
            ['/time set -5', 'Cannot set time to before 0 ticks, the number must be at least 0']
        ])('refuses %s with the error BDS words', async (line, expected) => {
            const commandManager = managerOver({});
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, line)).resolves.toBe(false);
            expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([`§c${expected}`]);
        });

        it('tells the sender of a failure in the work a command started, and answers false', async () => {
            // `/debug loadWorld` loads the level after the dispatcher has answered, so the config
            // lookup that fails does so in the work the body parked.
            const commandManager = managerOver({ getConfig: () => stub<Config>({ getWorlds: () => ({}) }) });
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/debug loadWorld nowhere')).resolves.toBe(
                false
            );
            expect(sendMessage.mock.calls.map(([message]) => message)).toEqual(['§cNo world nowhere in config']);
        });

        it('tells the process entry a /stop finished once its shutdown has, though its feedback failed', async () => {
            const stopped = vi.fn();
            let finishShutdown = () => {};
            const shutdown = new Promise<boolean>((resolve) => {
                finishShutdown = () => resolve(true);
            });
            const commandManager = managerOver({ shutdown: () => shutdown }, stopped);
            await commandManager.enable();

            // The sender is gone by the time the confirmation is sent, as a kicked player is.
            const sender: CommandExecutor = {
                sendMessage: async () => {
                    throw new Error('the connection closed');
                },
                getName: () => 'CONSOLE',
                getFormattedUsername: () => 'CONSOLE',
                getServer: () => server
            };
            const { settled } = commandManager.runCommand(sender, sender, '/stop');
            await Promise.resolve();
            expect(stopped).not.toHaveBeenCalled();

            finishShutdown();
            await settled;
            expect(stopped).toHaveBeenCalledTimes(1);
            expect(stopped).toHaveBeenCalledWith(true);
        });

        it('tells the process entry and the sender a /stop whose shutdown failed', async () => {
            // `Server.shutdown` with `stayAlive` fulfills false when a step failed, such as a
            // world save that threw. The process entry used to exit 0 regardless.
            const stopped = vi.fn();
            const commandManager = managerOver({ shutdown: async () => false }, stopped);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/stop')).resolves.toBe(false);

            expect(stopped).toHaveBeenCalledExactlyOnceWith(false);
            expect(sendMessage.mock.calls.map(([message]) => message)).toContainEqual(
                expect.stringContaining('did not shut down cleanly')
            );
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

            /**
             * A server with a real permission manager, a connected owner who holds `*` and a
             * connected `Target`, both resolvable as the entities a vanilla command names.
             */
            const integration = async () => {
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
                // What a selector reads of the target's actor.
                const body = {
                    runtimeId: 2n,
                    actor: {
                        isAlive: () => true,
                        getTags: () => [],
                        getFeetY: () => 64,
                        getPosition: () => new Position(0, 64, 0, world),
                        getWorld: () => world
                    }
                };
                // The command host and the operator change read who the target is off its session.
                const target: PlayerSession = sessionOnPrototype(
                    {
                        getName: () => 'Target',
                        sendAvailableCommands: async () => {},
                        announceSettings: async () => {},
                        getServer: () => server
                    },
                    { ...body, uuid: UUID.fromString(targetUuid) }
                );
                const sessionManager: SessionManager = stub<SessionManager>({
                    // Both, and agreeing: a vanilla command resolves its targets through the
                    // player list where a legacy one looked the name up directly.
                    getSessions: () => [target],
                    findSession: ({ name }) => (name === 'Target' ? target : null)
                });
                const permissionManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    getKernel: () => testKernel()
                });
                const console = stub<ConsoleSender>({
                    getName: () => 'Console',
                    getFormattedUsername: () => 'Console',
                    getServer: () => server,
                    sendMessage: () => {}
                });
                const connected = (): PlayerSession[] => [owner, target];
                const world = stub<World>({
                    getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
                    getDimension: () => Dimensions.Overworld,
                    getActors: () => connected().flatMap((session) => session.getActor() ?? []),
                    getActor: (runtimeId: bigint) =>
                        connected()
                            .find((session) => session.getRuntimeId() === runtimeId)
                            ?.getActor() ?? null,
                    viewerOf: (runtimeId: bigint) =>
                        connected().find((session) => session.getRuntimeId() === runtimeId),
                    getLevel: () => level,
                    getServer: () => server
                });
                const level: Level = stub<Level>({
                    worlds: function* () {
                        yield world;
                    }
                });
                const server: Server = stub<Server>({
                    // Empty registries rather than no content: `enable` builds the vanilla
                    // command set from them, so the arguments validate against Mojang's lists
                    // alone, which is what a server with no pack stack offers.
                    getContent: () =>
                        stub<ServerContent>({
                            entities: stub<ServerContent['entities']>({
                                registry: stub<ServerContent['entities']['registry']>({
                                    keys: () => [],
                                    entries: () => [].values()
                                })
                            }),
                            blocks: stub<ServerContent['blocks']>({ types: new Map() }),
                            items: stub<ServerContent['items']>({ types: new Map() }),
                            enchantments: stub<ServerContent['enchantments']>({ ids: [] }),
                            definitions: stub<ServerContent['definitions']>({ damageTypes: new Map() })
                        }),
                    getKernel: () => testKernel(),
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    getPermissionManager: () => permissionManager,
                    getConsoleSender: () => console,
                    getChatManager: () => stub<ChatManager>({ send: async () => {} }),
                    getWorldManager: () =>
                        stub<WorldManager>({
                            getEntryWorld: () => world,
                            getEntryLevel: () => level,
                            getLevels: () => [level]
                        })
                });
                await permissionManager.enable();
                // The owner holds `*` of their own, which counts as operator status.
                const filfat = identityNamed('Filfat', ownerUuid);
                await permissionManager.grantUser(filfat, '*');
                const owner: PlayerSession = sessionOnPrototype(
                    {
                        getName: () => 'Filfat',
                        hasPermission: (node: string) => permissionManager.has(filfat, node),
                        getCommandLevel: () => permissionManager.commandLevelOf(filfat),
                        isOp: () => permissionManager.isOp(filfat.subject),
                        getType: () => 'minecraft:player',
                        getFeetY: () => 64,
                        getPosition: () => new Position(0, 64, 0, world),
                        getWorld: () => world,
                        getServer: () => server,
                        sendMessage: async () => {}
                    },
                    { ...body, runtimeId: 1n, uuid: UUID.fromString(ownerUuid) }
                );
                const commandManager = new CommandManager(server);
                await commandManager.enable();
                return { commandManager, permissionManager, filfat, owner, sessionManager, logger };
            };

            it('lets a player holding `*` run /op, and saves the target under their subject', async () => {
                const { commandManager, permissionManager, owner, sessionManager, logger } = await integration();

                await expect(commandManager.dispatchCommand(owner, owner, '/op Target')).resolves.toBe(true);

                expect(permissionManager.isOp({ kind: 'offline', name: 'Target' })).toBe(true);
                expect(permissionManager.isOp({ kind: 'xbox', xuid: 'Target' })).toBe(false);

                const reloadedManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    getKernel: () => testKernel()
                });
                await reloadedManager.enable();
                expect(reloadedManager.isOp({ kind: 'offline', name: 'Target' })).toBe(true);
            });

            it('checks a command nested in `/execute ... run` against the node of the player who typed it', async () => {
                const { commandManager, permissionManager, filfat, owner } = await integration();
                // `*` grants every command; a node of the owner's own takes `/op` back.
                await permissionManager.grantUser(filfat, '-minecraft.command.op');

                await expect(commandManager.dispatchCommand(owner, owner, '/execute run op Target')).resolves.toBe(
                    false
                );
                expect(permissionManager.isOp({ kind: 'offline', name: 'Target' })).toBe(false);

                await permissionManager.revokeUser(filfat, '-minecraft.command.op');
                await expect(commandManager.dispatchCommand(owner, owner, '/execute run op Target')).resolves.toBe(
                    true
                );
                expect(permissionManager.isOp({ kind: 'offline', name: 'Target' })).toBe(true);
            });
        });
    });
});
