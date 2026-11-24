import { createHash } from 'node:crypto';

import { CommandSyntaxException } from '@jsprismarine/brigadier';
import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../../.test/reportProgress';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import { flattenCommandTree } from '../flatten';
import type { CommandHost, CommandSource, EntityRef, TickCommandHost } from '../host';
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
    extra: { entity?: EntityRef; feedback?: string[]; errors?: string[]; content?: ContentRegistryIds } = {}
): { results: unknown[]; host: CommandHost; registry: CommandRegistry<CommandSource> } => {
    const host = testCommandHost(overrides);
    const registry = registerVanillaCommands(
        extra.content === undefined ? undefined : new CommandRegistry<CommandSource>({ content: extra.content })
    );
    const source = createCommandSource({
        host,
        ...(extra.entity === undefined ? {} : { entity: extra.entity }),
        permissionLevel: 4,
        onFeedback: (message) => extra.feedback?.push(message),
        onError: (message) => extra.errors?.push(message)
    });
    return { results: registry.getDispatcher().execute(line, source), host, registry };
};

describe('the command set', () => {
    it('registers every shared, Java-only and Bedrock-only command', () => {
        const names = registerVanillaCommands().getNames().sort();
        const declared = [...SHARED_COMMAND_NAMES, ...JAVA_ONLY_COMMAND_NAMES, ...BEDROCK_ONLY_COMMAND_NAMES].sort();

        expect(names).toEqual(declared);
        reportProgress(
            `${SHARED_COMMAND_NAMES.length} shared, ${JAVA_ONLY_COMMAND_NAMES.length} Java-only, and ${BEDROCK_ONLY_COMMAND_NAMES.length} Bedrock-only commands are declared.`
        );
    });

    it('answers to the aliases Java gives the same command', () => {
        const registry = registerVanillaCommands();

        expect(registry.getAliasOwner('tp')).toBe('teleport');
        expect(registry.getAliasOwner('msg')).toBe('tell');
        expect(registry.getAliasOwner('w')).toBe('tell');
        expect(registry.getAliasOwner('experience')).toBe('xp');
    });

    it('flattens the whole set into a packet without dropping a command', () => {
        const registry = registerVanillaCommands();
        const { payload, notes } = buildAvailableCommands(registry);

        expect(payload.commands.map((command) => command.name).sort()).toEqual(registry.getNames().sort());
        expect(payload.commands.every((command) => command.overloads.length > 0)).toBe(true);
        expect(notes.every((note) => note.severity === 'degraded' || note.reason === 'overload-limit')).toBe(true);
    });

    it('keeps the Java command packet, notes, and usage strings at the 26.3 baseline', () => {
        const registry = registerVanillaCommands();
        const { payload, notes } = buildAvailableCommands(registry);
        const source = createCommandSource({
            host: testCommandHost(),
            permissionLevel: CommandPermissionLevel.OWNER
        });
        const usages = registry.getDispatcher().getAllUsage(registry.getRoot(), source, false);
        const digest = createHash('sha1')
            .update(JSON.stringify({ payload, notes, usage: usages }))
            .digest('hex');

        // This digest covers command nodes, argument shapes, aliases, overload ordering,
        // flattening notes, and the complete usage walk against Java's pinned command data.
        // The old value did not match either this branch or master; both produce this digest.
        // Master's `/tick` command added a Java-only node, so the digest was repinned to include it.
        // `/gamerule` then took each rule's legacy and Bedrock names, which the packet lists too.
        // `/execute run <command>` then took the type id a real server writes, 90.
        // The chained subcommand pairs and parse symbols then took the form a real server sends.
        // Every overload a chain continues into, `/execute run` among them, then became chaining.
        // `/effect` then took Bedrock's `effect <player> <effect>` and `effect <player> clear` forms.
        // The Bedrock command data then moved to bedrock-samples v1.26.60.5, whose enums list the
        // 1.26.60 blocks, entities, biome and effect.
        // `/tickingarea` then joined the Bedrock-only commands.
        // `/gamerule dofiretick` and `doFireTick` then took a boolean, as Bedrock's enum lists them.
        // The packet then listed every command name and alias in `CommandName` and named each
        // alias enum `<command>CommandAliases`, as a Bedrock Dedicated Server sends them.
        // The packet then left out `/gamerule`'s camelCase names, which a Bedrock client refuses.
        // `/data modify … from`, `/function … with` and the `value` and `max` literals of
        // `execute store … bossbar` then joined the tree.
        // `/item … from` then took a source of either kind under every target, as Java's does.
        // `/allowlist`, with its `whitelist` alias, then joined the Bedrock-only commands.
        // `execute if items` then took its block form, and Java's `item_predicate` argument, a
        // string to Bedrock, then read brackets and quotes with spaces in them, as the item of
        // `execute if slots <slots> <item>` does.
        expect(digest).toBe('baa5eb96850569a70e76799a911c36573ca2351b');
    });
});

describe('the entity commands', () => {
    const pig = testEntity({ id: 'pig-1', type: 'minecraft:pig', name: 'Pig', isPlayer: false });

    describe('/damage', () => {
        const target = testEntity({ id: 'dragon-1' });
        const attacker = testEntity({ id: 'player-1' });
        const owner = testEntity({ id: 'skeleton-1' });
        const content = { damageTypes: ['minecraft:generic', 'minecraft:in_fire', 'minecraft:arrow'] };

        /**
         * Runs a damage line and returns the calls that reached the host. `selections` answers the
         * selectors in the order the command resolves them: `by`, then `from`, then the target.
         */
        const damaged = (line: string, ...selections: EntityRef[][]) => {
            const calls: Array<{ id: string; amount: number; type: string; origin: unknown }> = [];
            const queue = [...selections];
            run(
                line,
                {
                    entities: {
                        select: () => queue.shift() ?? [target],
                        damage: (entity, amount, type, origin) => {
                            calls.push({ id: entity.id, amount, type, origin });
                            return true;
                        }
                    }
                },
                { entity: attacker, content }
            );
            return calls;
        };

        it('has no source entity when no clause names one, whoever ran the command', () => {
            expect(damaged('damage @e 1000')).toEqual([
                { id: 'dragon-1', amount: 1000, type: 'minecraft:generic', origin: undefined }
            ]);
            expect(damaged('damage @e 5 minecraft:in_fire')).toEqual([
                { id: 'dragon-1', amount: 5, type: 'minecraft:in_fire', origin: undefined }
            ]);
        });

        it('attributes the blow only when `by` names the entity', () => {
            const [call] = damaged('damage @e 5 minecraft:generic by @s', [attacker], [target]);

            expect(call?.origin).toEqual({ by: attacker });
        });

        it('takes an indirect `from` cause behind a `by` entity', () => {
            const [call] = damaged('damage @e 5 minecraft:arrow by @s from @a', [attacker], [owner], [target]);

            expect(call?.type).toBe('minecraft:arrow');
            expect(call?.origin).toEqual({ by: attacker, from: owner });
        });

        it('carries the location of an `at` clause', () => {
            const [call] = damaged('damage @e 5 minecraft:generic at 1 64 2');

            expect(call?.origin).toMatchObject({ at: { x: 1, y: 64, z: 2 } });
        });

        it('refuses a `by` selector that matches more than one entity', () => {
            expect(() => damaged('damage @e 5 minecraft:generic by @e', [attacker, owner], [target])).toThrow(
                /Only one entity/
            );
        });
    });

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

    it('/summon reports a failure instead of claiming it summoned the entity', () => {
        const feedback: string[] = [];
        const errors: string[] = [];
        const host = testCommandHost({ entities: { summon: () => undefined } });
        const registry = registerVanillaCommands();
        const source = createCommandSource({
            host,
            permissionLevel: 4,
            onFeedback: (message) => feedback.push(message),
            onError: (message) => errors.push(message)
        });

        expect(registry.getDispatcher().execute('summon minecraft:pig', source)).toEqual([0]);
        expect(feedback).toEqual([]);
        expect(errors).toEqual(['Unable to summon entity']);
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

        it('accepts bare and namespaced vanilla ids for Java block and item arguments', () => {
            const placed: string[] = [];
            const given: string[] = [];
            run('setblock 0 0 0 stone', {
                world: {
                    setBlock: (_dimension, _position, block) => {
                        placed.push(block.identifier);
                        return true;
                    }
                }
            });
            run('setblock 0 0 0 minecraft:stone');
            run('give @a stick 1', {
                entities: {
                    select: () => [testEntity()],
                    giveItem: (_entity, item) => {
                        given.push(item);
                        return 1;
                    }
                }
            });

            expect(placed).toEqual(['minecraft:stone']);
            expect(given).toEqual(['minecraft:stick']);
        });

        it('keeps block-state and item-component suffixes after parsing their resource ids', () => {
            const blockArguments: string[] = [];
            const itemArguments: string[] = [];
            run(
                'setblock 0 0 0 mypack:brass_block[facing=north]',
                {
                    world: {
                        setBlock: (_dimension, _position, block) => {
                            blockArguments.push(block.identifier);
                            return true;
                        }
                    }
                },
                { content }
            );
            run(
                'give @a mypack:wrench{minecraft:custom_data:{key:1}}',
                {
                    entities: {
                        select: () => [testEntity()],
                        giveItem: (_entity, item) => {
                            itemArguments.push(item);
                            return 1;
                        }
                    }
                },
                { content }
            );

            expect(blockArguments).toEqual(['mypack:brass_block[facing=north]']);
            expect(itemArguments).toEqual(['mypack:wrench{minecraft:custom_data:{key:1}}']);
        });

        it('uses the ids from each rebuilt command registry', () => {
            const first = {
                ...content,
                blocks: ['minecraft:stone', 'mypack:first_block']
            } satisfies ContentRegistryIds;
            const second = {
                ...content,
                blocks: ['minecraft:stone', 'mypack:second_block']
            } satisfies ContentRegistryIds;

            expect(() => run('setblock 0 0 0 mypack:first_block', {}, { content: first })).not.toThrow();
            expect(() => run('setblock 0 0 0 mypack:second_block', {}, { content: second })).not.toThrow();
            expect(() => run('setblock 0 0 0 mypack:first_block', {}, { content: second })).toThrow('registry');
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

    it('/clear with a max count of 0 reports the matching count and removes nothing', () => {
        const counted: unknown[] = [];
        let clearCalls = 0;
        const feedback: string[] = [];
        const { results } = run(
            'clear @a minecraft:dirt 0',
            {
                entities: {
                    select: () => [testEntity()],
                    countItems: (_player, item, data) => {
                        counted.push({ item, data });
                        return 1;
                    },
                    clearItems: () => {
                        clearCalls += 1;
                        return 0;
                    }
                }
            },
            { feedback }
        );

        expect(counted).toEqual([{ item: 'minecraft:dirt', data: undefined }]);
        expect(clearCalls).toBe(0);
        expect(results).toEqual([1]);
        expect(feedback).toEqual(['Found 1 matching item']);
    });

    it('/clear with a max count of 0 and no matching items reports the zero as an error', () => {
        const feedback: string[] = [];
        const errors: string[] = [];
        const host = testCommandHost({
            entities: { select: () => [testEntity()], countItems: () => 0 }
        });
        const registry = registerVanillaCommands();
        const source = createCommandSource({
            host,
            permissionLevel: 4,
            onFeedback: (message) => feedback.push(message),
            onError: (message) => errors.push(message)
        });

        expect(registry.getDispatcher().execute('clear @a minecraft:dirt 0', source)).toEqual([0]);
        expect(feedback).toEqual([]);
        expect(errors).toEqual(['Found 0 matching items']);
    });

    it('/clear with a positive max count still removes through clearItems', () => {
        const cleared: unknown[] = [];
        let countCalls = 0;
        const { results } = run('clear @a minecraft:dirt 2', {
            entities: {
                select: () => [testEntity()],
                countItems: () => {
                    countCalls += 1;
                    return 0;
                },
                clearItems: (_player, item, data, maxCount) => {
                    cleared.push({ item, data, maxCount });
                    return 2;
                }
            }
        });

        expect(cleared).toEqual([{ item: 'minecraft:dirt', data: undefined, maxCount: 2 }]);
        expect(countCalls).toBe(0);
        expect(results).toEqual([2]);
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

    it('/effect takes the Bedrock form, with the targets before the effect', () => {
        const applied: unknown[] = [];
        const cleared: unknown[] = [];
        const entities = {
            select: () => [testEntity()],
            addEffect: (_entity: EntityRef, effect: string, seconds: number, amplifier: number, hidden: boolean) => {
                applied.push({ effect, seconds, amplifier, hidden });
                return true;
            },
            clearEffect: (_entity: EntityRef, effect?: string) => {
                cleared.push(effect);
                return 1;
            }
        };
        run('effect @s speed 10 1 true', { entities });
        run('effect @s clear', { entities });
        run('effect @s clear speed', { entities });

        expect(applied).toEqual([{ effect: 'minecraft:speed', seconds: 10, amplifier: 1, hidden: true }]);
        expect(cleared).toEqual([undefined, 'minecraft:speed']);
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

        expect(placed).toEqual([{ states: { weirdo_direction: 2, upside_down_bit: true }, mode: 'keep' }]);
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

    it('/time query gametime reads the game clock, which runs while the day stands still', () => {
        const { results } = run('time query gametime', { world: { getTime: () => 1000, getGameTime: () => 5000 } });

        expect(results).toEqual([5000]);
    });

    it('/time set takes a named time of day as well as a tick count', () => {
        const set: number[] = [];
        const world = { setTime: (ticks: number) => void set.push(ticks) };
        for (const line of [
            'time set sunrise',
            'time set day',
            'time set noon',
            'time set minecraft:midnight',
            'time set 42'
        ])
            run(line, { world });

        expect(set).toEqual([23_000, 1000, 6000, 18_000, 42]);
    });

    it('/time set names the dimension it set the time of, as Bedrock 1.26.60 does', () => {
        const feedback: string[] = [];
        run('time set day', { world: { setTime: () => undefined } }, { feedback });

        expect(feedback).toEqual(["Set the time of 'minecraft:overworld' to 1000"]);
    });

    it('/time set refuses a word that names no time marker, naming the word and the dimension', () => {
        const set: number[] = [];
        const errors: string[] = [];
        const world = { setTime: (ticks: number) => void set.push(ticks) };

        const { results } = run('time set nonsense', { world }, { errors });

        expect(results).toEqual([0]);
        expect(errors).toEqual(["Cannot find time marker 'nonsense' on 'minecraft:overworld'"]);
        expect(set).toEqual([]);
    });

    it('/time set refuses a negative tick count and a fraction, as Bedrock does', () => {
        const set: number[] = [];
        const errors: string[] = [];
        const world = { setTime: (ticks: number) => void set.push(ticks) };

        const { results } = run('time set -5', { world }, { errors });
        expect(results).toEqual([0]);
        expect(errors).toEqual(['Cannot set time to before 0 ticks, the number must be at least 0']);
        expect(set).toEqual([]);

        expect(() => run('time set 1.5', { world })).toThrow(CommandSyntaxException);
        run('time set 0', { world });
        expect(set).toEqual([0]);
    });

    it('reads any run of spaces between arguments', () => {
        const set: number[] = [];
        run('time   set    day', { world: { setTime: (ticks: number) => void set.push(ticks) } });

        expect(set).toEqual([1000]);
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

    it('/gamerule takes the pre-1.21.11 and Bedrock names of a rule', () => {
        const set: unknown[] = [];
        const world = {
            setGameRule: (name: string, value: boolean | number) => {
                set.push({ name, value });
                return true;
            }
        };
        run('gamerule doMobSpawning false', { world });
        run('gamerule domobspawning true', { world });

        expect(set).toEqual([
            { name: 'minecraft:spawn_mobs', value: false },
            { name: 'minecraft:spawn_mobs', value: true }
        ]);
    });

    it('/gamerule takes a boolean for a rule Bedrock keeps boolean and Java made an integer', () => {
        const set: unknown[] = [];
        const world = {
            setGameRule: (name: string, value: boolean | number) => {
                set.push({ name, value });
                return true;
            }
        };
        run('gamerule dofiretick false', { world });
        run('gamerule doFireTick true', { world });
        run('gamerule fire_spread_radius_around_player 16', { world });

        expect(set).toEqual([
            { name: 'minecraft:fire_spread_radius_around_player', value: false },
            { name: 'minecraft:fire_spread_radius_around_player', value: true },
            { name: 'minecraft:fire_spread_radius_around_player', value: 16 }
        ]);
    });

    it('/gamerule reads a rule under its legacy name and reports its 1.21.11 id', () => {
        const feedback: string[] = [];
        run('gamerule doMobSpawning', { world: { getGameRule: () => false } }, { feedback });

        expect(feedback).toEqual(['minecraft:spawn_mobs = false']);
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

describe('/locate', () => {
    /** A source standing at a block position in the Overworld, as a player's would be. */
    const standing = testEntity({ id: 'p', name: 'Steve', position: { x: 0.5, y: 64, z: 0.5 } });

    it('reports a structure the way Java does: the corner, a hidden height and a flat distance', () => {
        const asked: unknown[] = [];
        const feedback: string[] = [];
        const { results } = run(
            'locate structure minecraft:stronghold',
            {
                world: {
                    locate: (kind, name, origin, dimension) => {
                        asked.push({ kind, name, origin, dimension });
                        return { x: -768, y: 0, z: 1840 };
                    }
                }
            },
            { entity: standing, feedback }
        );

        expect(asked).toEqual([
            {
                kind: 'structure',
                name: 'minecraft:stronghold',
                origin: { x: 0.5, y: 64, z: 0.5 },
                dimension: 'minecraft:overworld'
            }
        ]);
        expect(feedback).toEqual(['The nearest minecraft:stronghold is at [-768, ~, 1840] (1993 blocks away)']);
        // Java's result is the distance, which is what `execute store result` captures.
        expect(results).toEqual([1993]);
    });

    it('accepts a tag and a bare name, handing the host what was typed', () => {
        const names: string[] = [];
        const locate = (_kind: string, name: string) => {
            names.push(name);
            return { x: 0, y: 0, z: 0 };
        };
        run('locate structure #minecraft:village', { world: { locate } });
        run('locate structure stronghold', { world: { locate } });

        expect(names).toEqual(['#minecraft:village', 'stronghold']);
    });

    it('reports a biome with its height and a distance through all three axes', () => {
        const feedback: string[] = [];
        const { results } = run(
            'locate biome plains',
            { world: { locate: () => ({ x: 32, y: 70, z: 0 }) } },
            { entity: standing, feedback }
        );

        expect(feedback).toEqual(['The nearest plains is at [32, 70, 0] (32 blocks away)']);
        expect(results).toEqual([32]);
    });

    it("says what was not found in Java's words for each kind", () => {
        const errors: Record<string, string[]> = {};
        for (const line of [
            'locate structure minecraft:end_city',
            'locate biome minecraft:the_end',
            'locate poi minecraft:home'
        ]) {
            const host = testCommandHost();
            const captured: string[] = [];
            const registry = registerVanillaCommands();
            const source = createCommandSource({
                host,
                permissionLevel: 4,
                onError: (message) => captured.push(message)
            });
            const results = registry.getDispatcher().execute(line, source);
            expect(results).toEqual([0]);
            errors[line] = captured;
        }

        expect(errors).toEqual({
            'locate structure minecraft:end_city': ['Could not find a structure of type "minecraft:end_city" nearby'],
            'locate biome minecraft:the_end': [
                'Could not find a biome of type "minecraft:the_end" within a reasonable distance'
            ],
            'locate poi minecraft:home': [
                'Could not find a point of interest of type "minecraft:home" within a reasonable distance'
            ]
        });
    });

    it("suggests Mojang's structure list and whatever the host adds, tags included", async () => {
        const host = testCommandHost({
            world: { locateNames: (kind) => (kind === 'structure' ? ['mypack:keep', '#minecraft:village'] : []) }
        });
        const dispatcher = registerVanillaCommands().getDispatcher();
        const source = createCommandSource({ host, permissionLevel: 4 });

        const ids = await dispatcher.getCompletionSuggestions(
            dispatcher.parse('locate structure minecraft:vill', source)
        );
        expect(
            ids
                .getList()
                .map((suggestion) => suggestion.getText())
                .sort()
        ).toEqual([
            'minecraft:village_desert',
            'minecraft:village_plains',
            'minecraft:village_savanna',
            'minecraft:village_snowy',
            'minecraft:village_taiga'
        ]);

        const tags = await dispatcher.getCompletionSuggestions(dispatcher.parse('locate structure #', source));
        expect(tags.getList().map((suggestion) => suggestion.getText())).toEqual(['#minecraft:village']);

        const custom = await dispatcher.getCompletionSuggestions(dispatcher.parse('locate structure mypack', source));
        expect(custom.getList().map((suggestion) => suggestion.getText())).toEqual(['mypack:keep']);
    });

    it('suggests the biomes the host knows, since Mojang publishes no biome enum', async () => {
        const host = testCommandHost({
            world: { locateNames: (kind) => (kind === 'biome' ? ['minecraft:plains', '#minecraft:is_ocean'] : []) }
        });
        const dispatcher = registerVanillaCommands().getDispatcher();
        const source = createCommandSource({ host, permissionLevel: 4 });

        const suggestions = await dispatcher.getCompletionSuggestions(dispatcher.parse('locate biome ', source));
        expect(
            suggestions
                .getList()
                .map((suggestion) => suggestion.getText())
                .sort()
        ).toEqual(['#minecraft:is_ocean', 'minecraft:plains']);
    });
});

describe('the data-driven commands', () => {
    it('/data get reads the path, prints the tag as Java does and returns the result the host reports', () => {
        const feedback: string[] = [];
        const asked: unknown[] = [];
        const { results } = run(
            'data get storage mypack:state counter',
            {
                data: {
                    getData: (target, path, scale) => {
                        asked.push({ target, path, scale });
                        return { snbt: '7.5d', result: 7 };
                    }
                }
            },
            { feedback }
        );

        expect(asked).toEqual([{ target: { kind: 'storage', id: 'mypack:state' }, path: 'counter', scale: undefined }]);
        expect(feedback).toEqual(['Storage mypack:state has the following contents: 7.5d']);
        expect(results).toEqual([7]);
    });

    it('/data get with a scale passes the scale and prints the scaled number', () => {
        const feedback: string[] = [];
        const { results } = run(
            'data get storage mypack:state counter 0.5',
            { data: { getData: (_target, _path, scale) => ({ snbt: '7', result: Math.floor(7 * (scale ?? 1)) }) } },
            { feedback }
        );

        expect(feedback).toEqual(['counter in storage mypack:state after scale factor of 0.50 is 3']);
        expect(results).toEqual([3]);
    });

    it('/data get with no path prints the whole compound and returns what the host reports', () => {
        const feedback: string[] = [];
        const { results } = run(
            'data get storage mypack:state',
            { data: { getData: () => ({ snbt: '{a: 1}', result: 1 }) } },
            { feedback }
        );

        expect(feedback).toEqual(['Storage mypack:state has the following contents: {a: 1}']);
        expect(results).toEqual([1]);
    });

    it('/data get fails with Java’s message when the path matches nothing', () => {
        expect(() => run('data get storage mypack:state missing')).toThrow('Found no elements matching missing');
    });

    it('/data fails, so `store success` stores 0, when nothing matched or changed, and succeeds on a zero value', () => {
        const stored: number[] = [];
        const host = (data: TestCommandHostOverrides['data']): TestCommandHostOverrides => ({
            entities: { select: () => [testEntity({ name: 'flag' })] },
            scoreboard: {
                setScore: (_holder, _objective, value) => {
                    stored.push(value);
                    return value;
                }
            },
            data
        });
        const store = (line: string, data: TestCommandHostOverrides['data']) => {
            try {
                run(`execute store success score flag obj run ${line}`, host(data));
            } catch {
                // The failure is what `store success` records.
            }
        };

        store('data get storage mypack:state missing', { getData: () => undefined });
        store('data get storage mypack:state n', { getData: () => ({ snbt: '0', result: 0 }) });
        store('data modify storage mypack:state n set value 1', { modifyData: () => 0 });
        store('data merge storage mypack:state {n: 1}', { mergeData: () => false });
        store('data remove storage mypack:state n', { removeData: () => 0 });
        store('data remove storage mypack:state n', { removeData: () => 1 });

        expect(stored).toEqual([0, 1, 0, 0, 0, 1]);
    });

    it('/data modify set passes the operation and the value', () => {
        const seen: unknown[] = [];
        const feedback: string[] = [];
        const { results } = run(
            'data modify storage mypack:state counter set value 3',
            {
                data: {
                    modifyData: (target, path, operation, from) => {
                        seen.push({ target, path, operation, from });
                        return 1;
                    }
                }
            },
            { feedback }
        );

        expect(seen).toEqual([
            {
                target: { kind: 'storage', id: 'mypack:state' },
                path: 'counter',
                operation: 'set',
                from: { kind: 'value', snbt: '3' }
            }
        ]);
        expect(feedback).toEqual(['Modified storage mypack:state']);
        expect(results).toEqual([1]);
    });

    it('/data modify reads its value from another target with `from`, with or without a path', () => {
        const seen: unknown[] = [];
        const record = {
            data: {
                modifyData: (
                    _target: unknown,
                    _path: string,
                    operation: string,
                    from: unknown,
                    index?: number
                ): number => {
                    seen.push({ operation, from, index });
                    return 1;
                }
            }
        };
        run('data modify storage a:b list append from storage c:d items[0]', record);
        run('data modify storage a:b list insert 2 from storage c:d', record);
        run('data modify storage a:b "a b" set from storage c:d x."y z"', record);

        expect(seen).toEqual([
            { operation: 'append', from: { kind: 'from', target: { kind: 'storage', id: 'c:d' }, path: 'items[0]' } },
            { operation: 'insert', from: { kind: 'from', target: { kind: 'storage', id: 'c:d' } }, index: 2 },
            { operation: 'set', from: { kind: 'from', target: { kind: 'storage', id: 'c:d' }, path: 'x."y z"' } }
        ]);
    });

    it('/data modify fails with Java’s message when nothing changed', () => {
        expect(() => run('data modify storage a:b x set value 1')).toThrow(
            'Nothing changed. The specified properties already have these values'
        );
    });

    it('/data remove returns how many tags it removed', () => {
        const { results } = run('data remove storage a:b list[]', { data: { removeData: () => 3 } });

        expect(results).toEqual([3]);
    });

    it('/function … with storage passes the compound the path names as the arguments', () => {
        const calls: unknown[] = [];
        const record = {
            data: {
                getData: (_target: unknown, path?: string) => ({
                    snbt: path === 'scalar' ? '3' : '{x: 1}',
                    result: 1
                }),
                runFunction: (name: string, _source: unknown, nbt?: string, stored?: boolean) => {
                    calls.push({ name, nbt, stored });
                    return { result: 1, matched: false };
                }
            }
        };
        run('function mypack:macro with storage mypack:args', record);
        run('function mypack:macro with storage mypack:args nested', record);
        expect(() => run('function mypack:macro with storage mypack:args scalar', record)).toThrow(
            'Invalid argument type: 3, expected a compound'
        );

        // Printed from storage, so the runtime reads it back losslessly.
        expect(calls).toEqual([
            { name: 'mypack:macro', nbt: '{x: 1}', stored: true },
            { name: 'mypack:macro', nbt: '{x: 1}', stored: true }
        ]);
    });

    it('/function … with fails, so `store success` stores 0, when the source is missing or not a compound', () => {
        const stored: number[] = [];
        const ran: string[] = [];
        const host = (snbt: string | undefined) => ({
            entities: { select: () => [testEntity({ name: 'flag' })] },
            scoreboard: {
                setScore: (_holder: unknown, _objective: string, value: number) => {
                    stored.push(value);
                    return value;
                }
            },
            data: {
                getData: () => (snbt === undefined ? undefined : { snbt, result: 1 }),
                runFunction: (name: string) => {
                    ran.push(name);
                    return { result: 0, matched: false };
                }
            }
        });
        const line = 'execute store success score flag obj run function demo:macro with storage demo:args';

        expect(() => run(line, host(undefined))).toThrow('Found no elements matching');
        expect(() => run(line, host('"text"'))).toThrow('Invalid argument type: "text", expected a compound');
        // A function that runs and returns 0 still succeeded.
        run(line, host('{x: 1}'));

        expect(ran).toEqual(['demo:macro']);
        expect(stored).toEqual([0, 0, 1]);
    });

    it('/item modify applies a standalone item modifier', () => {
        const seen: unknown[] = [];
        run('item modify entity @s weapon.mainhand mypack:sharpen', {
            entities: { select: () => [testEntity()] },
            data: {
                applyItemModifier: (_targets, slot, modifier) => {
                    seen.push({ slot, modifier });
                    return 1;
                }
            }
        });

        expect(seen).toEqual([{ slot: { name: 'weapon.mainhand' }, modifier: 'mypack:sharpen' }]);
    });

    it('execute if items reads a block or every entity, and an item predicate with spaces in it', () => {
        const pig = testEntity({ id: 'pig', name: 'Pig', type: 'minecraft:pig', isPlayer: false });
        const cow = testEntity({ id: 'cow', name: 'Cow', type: 'minecraft:cow', isPlayer: false });
        const seen: unknown[] = [];
        const overrides: TestCommandHostOverrides = {
            entities: { select: () => [pig, cow] },
            data: {
                countSlotItems: (sources, slot, predicate) => {
                    seen.push({ sources: sources.map((source) => source.kind), slot, predicate });
                    return 3;
                }
            }
        };

        expect(run('execute if items block 1 2 3 container.* *[custom_name="a b"]', overrides).results).toEqual([3]);
        expect(run('execute if items entity @e armor.* #minecraft:trimmable_armor', overrides).results).toEqual([3]);
        expect(run('execute unless items entity @e armor.* minecraft:stone', overrides).results).toEqual([0]);
        // The executor's own slots, which is all this older form reads.
        expect(run('execute if slots weapon.mainhand stone', overrides, { entity: pig }).results).toEqual([1]);

        expect(seen).toEqual([
            { sources: ['block'], slot: { name: 'container.*' }, predicate: '*[custom_name="a b"]' },
            { sources: ['entity', 'entity'], slot: { name: 'armor.*' }, predicate: '#minecraft:trimmable_armor' },
            { sources: ['entity', 'entity'], slot: { name: 'armor.*' }, predicate: 'minecraft:stone' },
            { sources: ['entity'], slot: { name: 'weapon.mainhand' }, predicate: 'stone' }
        ]);
    });

    it('/item hands every target to the host, with the action that spreads the stack', () => {
        const pig = testEntity({ id: 'pig', name: 'Pig', type: 'minecraft:pig', isPlayer: false });
        const cow = testEntity({ id: 'cow', name: 'Cow', type: 'minecraft:cow', isPlayer: false });
        const seen: unknown[] = [];
        const feedback: string[] = [];
        for (const action of ['replace', 'fill', 'override']) {
            run(
                `item ${action} entity @e armor.* with minecraft:iron_helmet 2`,
                {
                    entities: { select: () => [pig, cow] },
                    data: {
                        setSlot: (targets, slot, item, count, mode) => {
                            seen.push({ targets: targets.length, slot, item, count, mode });
                            return 2;
                        }
                    }
                },
                { feedback }
            );
        }

        expect(seen).toEqual(
            ['replace', 'fill', 'override'].map((mode) => ({
                targets: 2,
                slot: { name: 'armor.*' },
                item: 'minecraft:iron_helmet',
                count: 2,
                mode
            }))
        );
        expect(feedback[0]).toBe('Replaced 2 slot(s) on 2 entities with minecraft:iron_helmet');
    });

    it('/item … from refuses a source selector that matched nothing, before writing a target', () => {
        const steve = testEntity({ id: 'steve', name: 'Steve' });
        const copied: unknown[] = [];
        const overrides: TestCommandHostOverrides = {
            entities: { select: (selector) => (selector.base === '@a' ? [steve] : []) },
            data: {
                copySlots: (...call) => {
                    copied.push(call);
                    return 1;
                }
            }
        };

        expect(() =>
            run('item override entity @a hotbar.* from entity @e[tag=copy_source] weapon.mainhand', overrides)
        ).toThrow('No entity was found');
        expect(() =>
            run('loot replace entity @e[tag=nobody] hotbar.0 loot minecraft:chests/simple_dungeon', overrides)
        ).toThrow('No entity was found');
        expect(copied).toEqual([]);
    });

    it('/item replace … from reads a source of either kind, apart from the target', () => {
        const steve = testEntity({ id: 'steve', name: 'Steve' });
        const pig = testEntity({ id: 'pig', name: 'Pig', type: 'minecraft:pig', isPlayer: false });
        const seen: unknown[] = [];
        const overrides: TestCommandHostOverrides = {
            // The target selector names the pig and the source selector names Steve.
            entities: { select: (selector) => (selector.base === '@s' ? [steve] : [pig]) },
            data: {
                copySlots: (sources, fromSlot, targets, toSlot, mode, modifier) => {
                    seen.push({ sources, fromSlot, targets, toSlot, mode, modifier });
                    return 1;
                }
            }
        };

        run('item replace entity @e[type=pig] armor.head from entity @s weapon.mainhand', overrides);
        run('item replace block 1 2 3 container.0 from entity @s hotbar.0 mypack:sharpen', overrides);

        expect(seen).toEqual([
            {
                sources: [{ kind: 'entity', entity: steve }],
                fromSlot: { name: 'weapon.mainhand' },
                targets: [{ kind: 'entity', entity: pig }],
                toSlot: { name: 'armor.head' },
                mode: 'replace',
                modifier: undefined
            },
            {
                sources: [{ kind: 'entity', entity: steve }],
                fromSlot: { name: 'hotbar.0' },
                targets: [{ kind: 'block', dimension: 'minecraft:overworld', position: { x: 1, y: 2, z: 3 } }],
                toSlot: { name: 'container.0' },
                mode: 'replace',
                modifier: 'mypack:sharpen'
            }
        ]);
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

    it('/loot replace rolls once and hands the roll to every named entity', () => {
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

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ kind: 'replace', slot: { name: 'container.0', count: 3 } });
        expect(seen[0]).toHaveProperty('targets.length', 2);
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
    describe('/tick', () => {
        const ticking = () => {
            const calls: unknown[] = [];
            const server = {
                ticking: {
                    rate: () => 20,
                    setRate: (rate) => void calls.push(['rate', rate]),
                    tickMs: () => 0,
                    measuredRate: () => 20,
                    frozen: () => false,
                    setFrozen: (frozen) => void calls.push(['frozen', frozen]),
                    step: (ticks) => calls.push(['step', ticks]) > 0,
                    stopStep: () => false,
                    sprint: (ticks) => void calls.push(['sprint', ticks]),
                    stopSprint: () => true
                }
            } satisfies { ticking: TickCommandHost };
            return { calls, server };
        };

        it('rate sets the target ticks per second', () => {
            const { calls, server } = ticking();
            run('tick rate 100', { server });
            expect(calls).toEqual([['rate', 100]]);
        });

        it('rate refuses a value outside 1 to 10000', () => {
            expect(() => run('tick rate 0')).toThrow();
            expect(() => run('tick rate 10001')).toThrow();
        });

        it('freeze and unfreeze flip the frozen flag', () => {
            const { calls, server } = ticking();
            run('tick freeze', { server });
            run('tick unfreeze', { server });
            expect(calls).toEqual([
                ['frozen', true],
                ['frozen', false]
            ]);
        });

        it('step freezes the world and runs one tick, or as many as the time says', () => {
            const { calls, server } = ticking();
            run('tick step', { server });
            run('tick step 2s', { server });
            expect(calls).toEqual([
                ['frozen', true],
                ['step', 1],
                ['frozen', true],
                ['step', 40]
            ]);
        });

        it('sprint runs the ticks and sprint stop ends the burst', () => {
            const { calls, server } = ticking();
            run('tick sprint 100', { server });
            const { results } = run('tick sprint stop', { server });
            expect(calls).toEqual([['sprint', 100]]);
            expect(results).toEqual([1]);
        });
    });

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
    it('builds the declared subcommands as children of the execute node', () => {
        const registry = registerVanillaCommands();
        const execute = [...registry.getRoot().getChildren()].find((node) => node.getName() === 'execute');
        const children = [...(execute?.getChildren() ?? [])].map((node) => node.getName());

        expect(children.sort()).toEqual([...EXECUTE_SUBCOMMANDS].sort());
        reportProgress(
            `/execute supports ${EXECUTE_SUBCOMMANDS.length} subcommands, ${EXECUTE_CONDITIONS.length} conditions, ${EXECUTE_ON_RELATIONS.length} relations, and ${EXECUTE_STORE_TARGETS.length} store targets.`
        );
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

    it('lets the host place `in` and `if dimension` in the world the source is in', () => {
        const seen: string[] = [];
        const world = {
            // A host that names its second level in the dimension keeps it through `in`.
            dimensionIn: (current: string, named: string) => `${named}@${current.split('@')[1] ?? ''}`,
            setBlock: (dimension: string) => {
                seen.push(dimension);
                return true;
            }
        };
        const entity: EntityRef = {
            id: '1',
            type: 'minecraft:pig',
            name: 'Pig',
            isPlayer: false,
            position: { x: 0, y: 64, z: 0 },
            rotation: { yaw: 0, pitch: 0 },
            dimension: 'minecraft:overworld@other'
        };

        run('execute in nether run setblock 0 0 0 minecraft:stone', { world }, { entity });
        run('execute if dimension overworld run setblock 0 0 0 minecraft:stone', { world }, { entity });

        expect(seen).toEqual(['minecraft:the_nether@other', 'minecraft:overworld@other']);
    });

    it('takes a namespaced dimension id in `in` as it is', () => {
        const seen: string[] = [];
        for (const dimension of ['minecraft:the_nether', 'mypack:skylands']) {
            run(`execute in ${dimension} run setblock 0 0 0 minecraft:stone`, {
                world: {
                    setBlock: (dimension) => {
                        seen.push(dimension);
                        return true;
                    }
                }
            });
        }

        expect(seen).toEqual(['minecraft:the_nether', 'mypack:skylands']);
    });

    it('suggests the dimensions the host has for `in`', async () => {
        const host = testCommandHost({ world: { dimensions: () => ['minecraft:overworld', 'mypack:skylands'] } });
        const dispatcher = registerVanillaCommands().getDispatcher();
        const source = createCommandSource({ host, permissionLevel: 4 });

        const suggestions = await dispatcher.getCompletionSuggestions(dispatcher.parse('execute in my', source));

        expect(suggestions.getList().map((suggestion) => suggestion.getText())).toEqual(['mypack:skylands']);
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

    it('writes a typed tag with `store result storage`, scaled and cast as Java casts it', () => {
        const written: unknown[] = [];
        const addressed = new Set<string>();
        const store = (type: string, scale: string, value: number) =>
            run(`execute store result storage a:b out ${type} ${scale} run fill 0 0 0 1 1 1 minecraft:stone`, {
                world: { fill: () => value },
                data: {
                    modifyData: (target, path, operation, from) => {
                        written.push(from.kind === 'value' ? from.snbt : from);
                        addressed.add(JSON.stringify({ target, path, operation }));
                        return 1;
                    }
                }
            });
        store('byte', '1', 5);
        store('byte', '1', 200);
        store('short', '1', 40000);
        store('int', '2.5', 3);
        store('int', '-0.5', 3);
        store('long', '1', 5);
        store('float', '1', 5);
        store('double', '0.5', 3);

        expect(written).toEqual(['5b', '-56b', '-25536s', '7', '-1', '5L', '5.0f', '1.5d']);
        expect([...addressed]).toEqual([
            JSON.stringify({ target: { kind: 'storage', id: 'a:b' }, path: 'out', operation: 'set' })
        ]);
    });

    it('saturates `store … int` as Java’s cast does, and writes an overflowing float as an infinity', () => {
        const written: unknown[] = [];
        const store = (type: string, scale: string, value: number) =>
            run(`execute store result storage a:b out ${type} ${scale} run fill 0 0 0 1 1 1 minecraft:stone`, {
                world: { fill: () => value },
                data: {
                    modifyData: (_target, _path, _operation, from) => {
                        written.push(from.kind === 'value' ? from.snbt : from);
                        return 1;
                    }
                }
            });
        const huge = `1${'0'.repeat(39)}`;
        store('int', '1000000000', 1000);
        store('int', '-1000000000', 1000);
        store('byte', '1000000000', 1000);
        store('long', `1${'0'.repeat(30)}`, 1);
        store('float', huge, 1);
        store('float', `-${huge}`, 1);

        expect(written).toEqual(['2147483647', '-2147483648', '-1b', '9223372036854775807L', '1e999f', '-1e999f']);
    });

    it('keeps `store … bossbar` in a storage whose id is a valid resource location', () => {
        const written: unknown[] = [];
        run('execute store result bossbar mypack:health max run fill 0 0 0 1 1 1 minecraft:stone', {
            world: { fill: () => 8 },
            data: {
                modifyData: (target, path, _operation, from) => {
                    written.push({ target, path, from });
                    return 1;
                }
            }
        });

        expect(written).toEqual([
            {
                target: { kind: 'storage', id: 'jsprismarine:bossbar/mypack/health' },
                path: 'max',
                from: { kind: 'value', snbt: '8' }
            }
        ]);
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
