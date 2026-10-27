import { describe, expect, it } from 'vitest';

import { flattenCommandTree } from '../flatten';
import type { CommandHost, CommandSource, EntityRef } from '../host';
import { createCommandSource } from '../host';
import { buildAvailableCommands } from '../packet';
import { parseSelector } from '../selector';
import type { TestCommandHostOverrides } from '../testing';
import { testCommandHost, testEntity } from '../testing';
import type { ContentRegistryIds } from '../tree';
import { CommandRegistry } from '../tree';
import { EXECUTE_CONDITIONS, EXECUTE_ON_RELATIONS, EXECUTE_STORE_TARGETS, EXECUTE_SUBCOMMANDS } from './execute';
import {
    BEDROCK_ONLY_COMMAND_NAMES,
    JAVA_ONLY_COMMAND_NAMES,
    SHARED_COMMAND_NAMES,
    registerVanillaCommands
} from './vanilla';

/** Runs one command line and returns what every executed branch produced. */
const run = (
    line: string,
    overrides: TestCommandHostOverrides = {},
    extra: { entity?: EntityRef; feedback?: string[]; content?: ContentRegistryIds } = {}
): { results: unknown[]; host: CommandHost; registry: CommandRegistry<CommandSource> } => {
    const host = testCommandHost(overrides);
    const registry = registerVanillaCommands(
        extra.content === undefined ? undefined : new CommandRegistry<CommandSource>({ content: extra.content })
    );
    const source = createCommandSource({
        host,
        ...(extra.entity === undefined ? {} : { entity: extra.entity }),
        permissionLevel: 4,
        onFeedback: (message) => extra.feedback?.push(message)
    });
    return { results: registry.getDispatcher().execute(line, source), host, registry };
};

describe('the command set', () => {
    it('registers the 46 shared names, the 5 Java-only and the 9 Bedrock-only ones', () => {
        const names = new Set(registerVanillaCommands().getNames());

        for (const name of [...SHARED_COMMAND_NAMES, ...JAVA_ONLY_COMMAND_NAMES, ...BEDROCK_ONLY_COMMAND_NAMES]) {
            expect(names.has(name), `${name} is not registered`).toBe(true);
        }
        expect(SHARED_COMMAND_NAMES).toHaveLength(46);
        expect(names.size).toBe(60);
    });

    it('answers to the aliases Java gives the same command', () => {
        const registry = registerVanillaCommands();

        expect(registry.getAliasOwner('tp')).toBe('teleport');
        expect(registry.getAliasOwner('msg')).toBe('tell');
        expect(registry.getAliasOwner('w')).toBe('tell');
        expect(registry.getAliasOwner('experience')).toBe('xp');
    });

    it('flattens the whole set into a packet without dropping a command', () => {
        const { payload, notes } = buildAvailableCommands(registerVanillaCommands());

        expect(payload.commands).toHaveLength(60);
        expect(payload.commands.every((command) => command.overloads.length > 0)).toBe(true);
        expect(notes.every((note) => note.severity === 'degraded' || note.reason === 'overload-limit')).toBe(true);
    });
});

describe('the entity commands', () => {
    const pig = testEntity({ id: 'pig-1', type: 'minecraft:pig', name: 'Pig', isPlayer: false });

    it('/kill kills every selected entity and returns the count', () => {
        const killed: string[] = [];
        const { results } = run('kill @e', {
            entities: {
                select: () => [pig, testEntity({ id: 'pig-2', name: 'Pig2' })],
                kill: (entity) => {
                    killed.push(entity.id);
                    return true;
                }
            }
        });

        expect(killed).toEqual(['pig-1', 'pig-2']);
        expect(results).toEqual([2]);
    });

    it('/summon places the entity at the resolved position', () => {
        const summoned: { type: string; position: unknown }[] = [];
        const { results } = run('summon minecraft:pig ~5 ~ ~-2', {
            entities: {
                summon: (type, position) => {
                    summoned.push({ type, position });
                    return pig;
                }
            }
        });

        expect(summoned).toEqual([{ type: 'minecraft:pig', position: { x: 5, y: 0, z: -2 } }]);
        expect(results).toEqual([1]);
    });

    it('/summon uses the dimension selected by execute in', () => {
        let options: unknown;
        run('execute in nether run summon minecraft:pig', {
            entities: {
                summon: (_type, _position, _rotation, receivedOptions) => {
                    options = receivedOptions;
                    return pig;
                }
            }
        });

        expect(options).toMatchObject({ dimension: 'minecraft:the_nether' });
    });

    describe('a registry argument against the content the host loaded', () => {
        const content = {
            entityTypes: ['minecraft:pig', 'minecraft:villager_v2', 'mypack:dragon'],
            blocks: ['minecraft:stone', 'mypack:brass_block'],
            items: ['minecraft:stick', 'mypack:wrench'],
            enchantments: ['minecraft:sharpness', 'mypack:keen']
        } satisfies ContentRegistryIds;

        /** Summons through a host that reports what it was handed. */
        const summon = (line: string) => {
            const types: string[] = [];
            run(
                line,
                {
                    entities: {
                        summon: (type) => {
                            types.push(type);
                            return pig;
                        }
                    }
                },
                { content }
            );
            return types;
        };

        it('accepts a pack entity Mojang never published, with its namespace kept', () => {
            // The bug: `mypack:dragon` failed at parse against the frozen
            // 229-entry `EntityType` enum, for an entity the host can spawn.
            expect(summon('summon mypack:dragon 0 0 0')).toEqual(['mypack:dragon']);
        });

        it('still accepts a vanilla name the content build does not list', () => {
            // Mojang's list is added to, not replaced, so a build that omits
            // a vanilla entity does not make it unspellable.
            expect(summon('summon minecraft:creeper 0 0 0')).toEqual(['minecraft:creeper']);
            expect(summon('summon creeper 0 0 0')).toEqual(['minecraft:creeper']);
        });

        it('accepts a loaded id written without its namespace', () => {
            expect(summon('summon villager_v2 0 0 0')).toEqual(['minecraft:villager_v2']);
        });

        it('still refuses a name neither list holds', () => {
            expect(() => summon('summon mypack:absent 0 0 0')).toThrow('is not in the minecraft:entity_type registry');
        });

        it("offers the pack ids to the client on top of Mojang's enum", () => {
            const registry = registerVanillaCommands(new CommandRegistry<CommandSource>({ content }));
            const summonCommand = flattenCommandTree(registry).commands.find((entry) => entry.name === 'summon');
            const parameter = summonCommand?.overloads[0]?.parameters[0];

            expect(parameter?.shape.kind).toBe('enum');
            const values = parameter?.shape.kind === 'enum' ? parameter.shape.values : [];
            expect(values).toContain('mypack:dragon');
            expect(values).toContain('pig');
            // Added once: a loaded id Mojang already publishes is not doubled.
            expect(values.filter((value) => value === 'minecraft:pig')).toHaveLength(1);
        });

        it('reaches the block, item and enchantment arguments too', () => {
            const withPlayer = { entities: { select: () => [testEntity()] } } satisfies TestCommandHostOverrides;

            // Each line is refused without the content and parses with it,
            // which is the whole of what threading the ids changes.
            for (const line of ['setblock 0 0 0 mypack:brass_block', 'give @a mypack:wrench', 'enchant @a mypack:keen'])
                expect(() => run(line, withPlayer), line).toThrow('registry');

            for (const line of ['setblock 0 0 0 mypack:brass_block', 'give @a mypack:wrench', 'enchant @a mypack:keen'])
                expect(() => run(line, withPlayer, { content }), line).not.toThrow();
        });
    });

    it('/give passes the count and the data value through', () => {
        const given: unknown[] = [];
        const { results } = run('give @a minecraft:stick 17 3', {
            entities: {
                select: () => [testEntity()],
                giveItem: (_player, item, count, data) => {
                    given.push({ item, count, data });
                    return count;
                }
            }
        });

        expect(given).toEqual([{ item: 'minecraft:stick', count: 17, data: 3 }]);
        expect(results).toEqual([17]);
    });

    it('/effect give defaults the seconds and amplifier the way Java does', () => {
        const applied: unknown[] = [];
        run('effect give @s minecraft:speed', {
            entities: {
                select: () => [testEntity()],
                addEffect: (_entity, effect, seconds, amplifier, hidden) => {
                    applied.push({ effect, seconds, amplifier, hidden });
                    return true;
                }
            }
        });

        expect(applied).toEqual([{ effect: 'minecraft:speed', seconds: 30, amplifier: 0, hidden: false }]);
    });

    it('/attribute base get reports the value and returns it truncated', () => {
        const feedback: string[] = [];
        const { results } = run(
            'attribute @s minecraft:generic.max_health base get',
            { entities: { select: () => [testEntity()], getAttributeBase: () => 20.5 } },
            { feedback }
        );

        expect(results).toEqual([20]);
        expect(feedback).toEqual(['Steve has a base of 20.5']);
    });

    it('/tag add reports how many entities changed', () => {
        const { results } = run('tag @e add mine', {
            entities: { select: () => [pig, testEntity()], addTag: (entity) => entity.id === 'pig-1' }
        });

        expect(results).toEqual([1]);
    });

    it('/teleport refuses a destination selector that matched two entities', () => {
        expect(() =>
            run('teleport @e', { entities: { select: () => [pig, testEntity()] } }, { entity: testEntity() })
        ).toThrow(/Only one entity is allowed/);
    });
});

describe('the world commands', () => {
    it('/setblock resolves a relative position and reports the placement', () => {
        const placed: unknown[] = [];
        const { results } = run('setblock ~1 ~2 ~3 minecraft:stone', {
            world: {
                setBlock: (dimension, position, block, mode) => {
                    placed.push({ dimension, position, block, mode });
                    return true;
                }
            }
        });

        expect(placed).toEqual([
            {
                dimension: 'minecraft:overworld',
                position: { x: 1, y: 2, z: 3 },
                block: { identifier: 'minecraft:stone', states: {} },
                mode: 'replace'
            }
        ]);
        expect(results).toEqual([1]);
    });

    it('/setblock reads a Bedrock block state list', () => {
        const placed: unknown[] = [];
        run('setblock 0 0 0 minecraft:stone_stairs ["weirdo_direction"=2,"upside_down_bit"=true] keep', {
            world: {
                setBlock: (_dimension, _position, block, mode) => {
                    placed.push({ states: block.states, mode });
                    return true;
                }
            }
        });

        expect(placed).toEqual([{ states: { weirdo_direction: '2', upside_down_bit: 'true' }, mode: 'keep' }]);
    });

    it('/fill returns the block count the host reports', () => {
        const { results } = run('fill 0 0 0 1 1 1 minecraft:stone', { world: { fill: () => 8 } });

        expect(results).toEqual([8]);
    });

    it('/clone passes both modes through', () => {
        const seen: unknown[] = [];
        run('clone 0 0 0 1 1 1 10 10 10 masked force', {
            world: {
                clone: (_dimension, _begin, _end, _destination, maskMode, mode) => {
                    seen.push({ maskMode, mode });
                    return 4;
                }
            }
        });

        expect(seen).toEqual([{ maskMode: 'masked', mode: 'force' }]);
    });

    it('/time query daytime wraps the tick count', () => {
        const { results } = run('time query daytime', { world: { getTime: () => 30_000 } });

        expect(results).toEqual([6000]);
    });

    it('/gamerule names every rule in the registry by its 1.21.11 id', () => {
        const set: unknown[] = [];
        run('gamerule max_command_sequence_length 1024', {
            world: {
                setGameRule: (name, value) => {
                    set.push({ name, value });
                    return true;
                }
            }
        });

        expect(set).toEqual([{ name: 'minecraft:max_command_sequence_length', value: 1024 }]);
    });

    it('/gamerule reads a boolean rule as a boolean', () => {
        const set: unknown[] = [];
        run('gamerule send_command_feedback false', {
            world: {
                setGameRule: (name, value) => {
                    set.push({ name, value });
                    return true;
                }
            }
        });

        expect(set).toEqual([{ name: 'minecraft:send_command_feedback', value: false }]);
    });

    it('/weather sets the weather and the duration', () => {
        const seen: unknown[] = [];
        run('weather rain 600', {
            world: {
                setWeather: (weather, duration) => {
                    seen.push({ weather, duration });
                }
            }
        });

        expect(seen).toEqual([{ weather: 'rain', duration: 600 }]);
    });

    it('/weather takes a suffixed duration, as its Java argument does', () => {
        const seen: unknown[] = [];
        run('weather thunder 30s', {
            world: {
                setWeather: (weather, duration) => {
                    seen.push({ weather, duration });
                }
            }
        });

        expect(seen).toEqual([{ weather: 'thunder', duration: 600 }]);
    });
});

describe('the data-driven commands', () => {
    it('/data get reads the path and prints what it found', () => {
        const feedback: string[] = [];
        const { results } = run(
            'data get storage mypack:state counter',
            { data: { getData: () => '7' } },
            { feedback }
        );

        expect(feedback).toEqual(['7']);
        expect(results).toEqual([7]);
    });

    it('/data modify set passes the operation and the value', () => {
        const seen: unknown[] = [];
        run('data modify storage mypack:state counter set value 3', {
            data: {
                modifyData: (target, path, operation, value) => {
                    seen.push({ target, path, operation, value });
                    return true;
                }
            }
        });

        expect(seen).toEqual([
            { target: { kind: 'storage', id: 'mypack:state' }, path: 'counter', operation: 'set', value: '3' }
        ]);
    });

    it('/item modify applies a standalone item modifier', () => {
        const seen: unknown[] = [];
        run('item modify entity @s weapon.mainhand mypack:sharpen', {
            entities: { select: () => [testEntity()] },
            data: {
                applyItemModifier: (_target, slot, modifier) => {
                    seen.push({ slot, modifier });
                    return 1;
                }
            }
        });

        expect(seen).toEqual([{ slot: { name: 'weapon.mainhand' }, modifier: 'mypack:sharpen' }]);
    });

    it('/loot give runs the table into the players', () => {
        const seen: unknown[] = [];
        const { results } = run('loot give @a loot minecraft:chests/simple_dungeon', {
            entities: { select: () => [testEntity()] },
            data: {
                runLoot: (loot, _source, destination) => {
                    seen.push({ loot, destinationKind: destination.kind });
                    return 3;
                }
            }
        });

        expect(seen).toEqual([
            { loot: { kind: 'table', table: 'minecraft:chests/simple_dungeon' }, destinationKind: 'give' }
        ]);
        expect(results).toEqual([3]);
    });

    it('/loot mine names the block rather than a table, which is what it has', () => {
        const seen: unknown[] = [];
        run('loot spawn 1 2 3 mine 4 5 6 minecraft:diamond_pickaxe', {
            data: {
                runLoot: (loot, _source, destination) => {
                    seen.push({ loot, destination });
                    return 1;
                }
            }
        });

        expect(seen).toEqual([
            {
                loot: {
                    kind: 'mine',
                    dimension: 'minecraft:overworld',
                    position: { x: 4, y: 5, z: 6 },
                    tool: 'minecraft:diamond_pickaxe'
                },
                destination: {
                    kind: 'spawn',
                    dimension: 'minecraft:overworld',
                    position: { x: 1, y: 2, z: 3 }
                }
            }
        ]);
    });

    it('/loot kill names the entity it would roll', () => {
        const seen: unknown[] = [];
        run('loot give @a kill @e', {
            entities: { select: () => [testEntity()] },
            data: {
                runLoot: (loot) => {
                    seen.push(loot);
                    return 1;
                }
            }
        });

        expect(seen).toEqual([{ kind: 'kill', entity: testEntity() }]);
    });

    it('/loot replace writes one slot per named entity', () => {
        const seen: unknown[] = [];
        run('loot replace entity @a container.0 3 loot mypack:prize', {
            entities: { select: () => [testEntity(), testEntity()] },
            data: {
                runLoot: (_loot, _source, destination) => {
                    seen.push(destination);
                    return 1;
                }
            }
        });

        expect(seen).toHaveLength(2);
        expect(seen[0]).toMatchObject({ kind: 'replace', slot: { name: 'container.0', count: 3 } });
    });

    it('/function returns what the function returned', () => {
        const { results } = run('function mypack:tick', {
            data: { runFunction: () => ({ result: 42, matched: false }) }
        });

        expect(results).toEqual([42]);
    });

    it('/return reports the value it ends the function with', () => {
        const seen: (number | undefined)[] = [];
        const record = {
            data: {
                returnFromFunction: (value?: number) => {
                    seen.push(value);
                    return value ?? 0;
                }
            }
        } satisfies TestCommandHostOverrides;

        expect(run('return 7', record).results).toEqual([7]);
        expect(run('return fail', record).results).toEqual([0]);
        expect(seen).toEqual([7, undefined]);
    });

    it('/return run ends the function with what the command it ran produced', () => {
        const seen: (number | undefined)[] = [];
        run('return run random value 1..6', {
            data: {
                randomValue: () => 4,
                returnFromFunction: (value?: number) => {
                    seen.push(value);
                    return value ?? 0;
                }
            }
        });

        expect(seen).toEqual([4]);
    });

    it('/scoreboard players operation returns the new score', () => {
        const { results } = run('scoreboard players operation A obj += B obj', {
            entities: { select: () => [testEntity({ name: 'A' })] },
            scoreboard: { operation: () => 11 }
        });

        expect(results).toEqual([11]);
    });

    it('/random value draws from the named sequence', () => {
        const seen: unknown[] = [];
        const { results } = run('random value 1..6 mypack:dice', {
            data: {
                randomValue: (min, max, sequence) => {
                    seen.push({ min, max, sequence });
                    return 4;
                }
            }
        });

        expect(seen).toEqual([{ min: 1, max: 6, sequence: 'mypack:dice' }]);
        expect(results).toEqual([4]);
    });

    it('/schedule queues a function in replace mode by default', () => {
        const seen: unknown[] = [];
        run('schedule function mypack:later 100', {
            data: {
                schedule: (name, delay, mode) => {
                    seen.push({ name, delay, mode });
                    return true;
                }
            }
        });

        expect(seen).toEqual([{ name: 'mypack:later', delay: 100, mode: 'replace' }]);
    });

    it('/schedule reads the delay as Java time, suffixes and all', () => {
        const delays: number[] = [];
        const record = {
            data: {
                schedule: (_name: string, delay: number) => {
                    delays.push(delay);
                    return true;
                }
            }
        } satisfies TestCommandHostOverrides;

        for (const written of ['5s', '2d', '7t', '100', '0.5s']) {
            run(`schedule function mypack:later ${written}`, record);
        }

        expect(delays).toEqual([100, 48_000, 7, 100, 10]);
    });

    it('/schedule refuses a unit that is not a unit', () => {
        expect(() => run('schedule function mypack:later 5w')).toThrow("'w' is not a time unit");
    });
});

describe('the chat and administration commands', () => {
    it('/say addresses every player online', () => {
        const sent: unknown[] = [];
        run('say hello world', {
            server: {
                listPlayers: () => [testEntity()],
                sendMessage: (targets, kind, text) => {
                    sent.push({ count: targets.length, kind, text });
                }
            }
        });

        expect(sent).toEqual([{ count: 1, kind: 'chat', text: '[Server] hello world' }]);
    });

    it('/tell whispers to the selected players and counts them', () => {
        const { results } = run('tell @a hi there', {
            entities: { select: () => [testEntity(), testEntity({ id: 'b', name: 'Alex' })] }
        });

        expect(results).toEqual([2]);
    });

    it('/list reports how many players are online', () => {
        const { results } = run('list', { server: { listPlayers: () => [testEntity(), testEntity({ id: 'b' })] } });

        expect(results).toEqual([2]);
    });

    it('/kick names the player it removed', () => {
        const feedback: string[] = [];
        run(
            'kick @s rule breaking',
            { entities: { select: () => [testEntity({ name: 'Alex' })] }, server: { kick: () => true } },
            { feedback }
        );

        expect(feedback).toEqual(['Kicked Alex']);
    });

    it('/stop asks the host to stop', () => {
        let stopped = false;
        run('stop', {
            server: {
                stop: () => {
                    stopped = true;
                }
            }
        });

        expect(stopped).toBe(true);
    });
});

describe('/execute as a real subcommand chain', () => {
    it('declares the 14 subcommands, 13 conditions, 8 relations and 5 store targets', () => {
        expect(EXECUTE_SUBCOMMANDS).toHaveLength(14);
        expect(EXECUTE_CONDITIONS).toHaveLength(13);
        expect(EXECUTE_ON_RELATIONS).toHaveLength(8);
        expect(EXECUTE_STORE_TARGETS).toHaveLength(5);
    });

    it('builds all 14 subcommands as children of the execute node', () => {
        const registry = registerVanillaCommands();
        const execute = [...registry.getRoot().getChildren()].find((node) => node.getName() === 'execute');
        const children = [...(execute?.getChildren() ?? [])].map((node) => node.getName());

        expect(children.sort()).toEqual([...EXECUTE_SUBCOMMANDS].sort());
    });

    it('forks `as`, running the rest of the chain once per matched entity', () => {
        const said: string[] = [];
        const { results } = run('execute as @e run say hi', {
            entities: {
                select: () => [testEntity({ id: 'a', name: 'A' }), testEntity({ id: 'b', name: 'B' })]
            },
            server: {
                listPlayers: () => [testEntity()],
                sendMessage: (_targets, _kind, text) => said.push(text)
            }
        });

        expect(said).toEqual(['[A] hi', '[B] hi']);
        expect(results).toHaveLength(2);
    });

    it('moves the position with `at` and leaves the runner alone', () => {
        const placed: unknown[] = [];
        run('execute at @e run setblock ~ ~ ~ minecraft:stone', {
            entities: { select: () => [testEntity({ position: { x: 10, y: 20, z: 30 } })] },
            world: {
                setBlock: (_dimension, position) => {
                    placed.push(position);
                    return true;
                }
            }
        });

        expect(placed).toEqual([{ x: 10, y: 20, z: 30 }]);
    });

    it('changes the dimension with `in`', () => {
        const seen: string[] = [];
        run('execute in nether run setblock 0 0 0 minecraft:stone', {
            world: {
                setBlock: (dimension) => {
                    seen.push(dimension);
                    return true;
                }
            }
        });

        expect(seen).toEqual(['minecraft:the_nether']);
    });

    it('floors the position with `align`', () => {
        const placed: unknown[] = [];
        run('execute positioned 1.7 2.3 3.9 align xz run setblock ~ ~ ~ minecraft:stone', {
            world: {
                setBlock: (_dimension, position) => {
                    placed.push(position);
                    return true;
                }
            }
        });

        expect(placed).toEqual([{ x: 1, y: 2.3, z: 3 }]);
    });

    it('runs the chain only when `if entity` matches, and skips it when `unless` does', () => {
        const said: string[] = [];
        const host = {
            entities: { select: () => [testEntity()] },
            server: {
                listPlayers: () => [testEntity()],
                sendMessage: (_t: unknown, _k: unknown, text: string) => said.push(text)
            }
        };

        run('execute if entity @e run say yes', host);
        expect(said).toEqual(['[Server] yes']);

        run('execute unless entity @e run say no', host);
        expect(said).toEqual(['[Server] yes']);
    });

    it('runs `if entity` on its own and returns 1 or 0', () => {
        expect(run('execute if entity @e', { entities: { select: () => [testEntity()] } }).results).toEqual([1]);
        expect(run('execute unless entity @e', { entities: { select: () => [testEntity()] } }).results).toEqual([0]);
    });

    it('matches `if function` on the return value, not on the lines that ran', () => {
        // The 1.20.3 rule. A function that ran forty lines and never reached
        // a `/return` returns nothing, and nothing does not match.
        const ran = {
            data: { runFunction: () => ({ result: 40, matched: false }) }
        } satisfies TestCommandHostOverrides;
        const returned = {
            data: { runFunction: () => ({ result: 1, matched: true }) }
        } satisfies TestCommandHostOverrides;

        expect(run('execute if function mypack:work', ran).results).toEqual([0]);
        expect(run('execute if function mypack:work', returned).results).toEqual([1]);
        expect(run('execute unless function mypack:work', ran).results).toEqual([1]);
    });

    it('walks a relationship with `on`', () => {
        const said: string[] = [];
        run(
            'execute on owner run say hi',
            {
                entities: { related: () => [testEntity({ name: 'Owner' })] },
                server: {
                    listPlayers: () => [testEntity()],
                    sendMessage: (_targets, _kind, text) => said.push(text)
                }
            },
            { entity: testEntity({ name: 'Pet' }) }
        );

        expect(said).toEqual(['[Owner] hi']);
    });

    it('captures a result with `store result score`', () => {
        const stored: unknown[] = [];
        run('execute store result score Counter obj run fill 0 0 0 1 1 1 minecraft:stone', {
            entities: { select: () => [testEntity({ name: 'Counter' })] },
            world: { fill: () => 8 },
            scoreboard: {
                setScore: (holder, objective, value) => {
                    stored.push({ holder, objective, value });
                    return value;
                }
            }
        });

        expect(stored).toEqual([{ holder: 'Counter', objective: 'obj', value: 8 }]);
    });

    it('stores 1 for success where it stores the count for result', () => {
        const stored: number[] = [];
        run('execute store success score Counter obj run fill 0 0 0 1 1 1 minecraft:stone', {
            entities: { select: () => [testEntity({ name: 'Counter' })] },
            world: { fill: () => 8 },
            scoreboard: {
                setScore: (_holder, _objective, value) => {
                    stored.push(value);
                    return value;
                }
            }
        });

        expect(stored).toEqual([1]);
    });

    it('chains several subcommands in one line', () => {
        const placed: unknown[] = [];
        run('execute as @e at @s in overworld positioned ~ ~1 ~ run setblock ~ ~ ~ minecraft:stone', {
            entities: { select: () => [testEntity({ position: { x: 4, y: 5, z: 6 } })] },
            world: {
                setBlock: (dimension, position) => {
                    placed.push({ dimension, position });
                    return true;
                }
            }
        });

        expect(placed).toEqual([{ dimension: 'minecraft:overworld', position: { x: 4, y: 6, z: 6 } }]);
    });

    it('flattens to the chained-subcommand shape Mojang spells, not a redirect', () => {
        const registry = registerVanillaCommands();
        const { commands, notes } = flattenCommandTree(registry);
        const execute = commands.find((command) => command.name === 'execute')!;

        expect([...(execute.chainedSubcommands[0]?.values ?? [])].sort()).toEqual([...EXECUTE_SUBCOMMANDS].sort());
        expect(execute.overloads.some((overload) => overload.chaining)).toBe(true);
        expect(
            execute.overloads.some((overload) =>
                overload.parameters.some(
                    (parameter) => parameter.shape.kind === 'basic' && parameter.shape.type === 'CODEBUILDERARGS'
                )
            )
        ).toBe(true);
        expect(
            notes.filter((note) => note.command === 'execute' && note.reason === 'redirect-cycle').length
        ).toBeGreaterThan(0);
    });

    it('reads a Bedrock selector when the source says the line came from a Bedrock client', () => {
        // The selector argument parses with the Java grammar by default; a
        // Bedrock-only argument therefore still parses and is noted.
        const { notes } = parseSelector('@e[family=monster]', 'java');

        expect(notes[0]?.reason).toBe('bedrock-only');
    });
});
