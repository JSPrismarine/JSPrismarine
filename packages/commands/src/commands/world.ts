/**
 * The world-side commands: `/setblock`, `/fill`, `/clone`, `/time`,
 * `/weather`, `/gamerule`, `/difficulty`, `/setworldspawn`, `/spawnpoint`,
 * `/locate`, `/place`, `/particle`, `/playsound`, `/stopsound` and
 * `/spreadplayers`.
 *
 * `/gamerule` reads its rule names from {@link JAVA_GAME_RULES}, so the two
 * spellings 1.21.11 left behind both parse.
 */
import type { ArgumentType } from '@jsprismarine/brigadier';
import { javaIdentifiersTable } from '@jsprismarine/mapping/tables';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    blockPositionArgument,
    blockStatesArgument,
    entityArgument,
    enumArgument,
    floatArgument,
    integerArgument,
    positionArgument,
    resourceArgument,
    stringArgument,
    timeArgument
} from '../argumentTypes';
import { JAVA_GAME_RULES } from '../gamerules';
import type { BlockRef, CommandSource } from '../host';
import { suggestFromData } from '../suggestions';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import { arg, command, dimensionArgument, lit, report, resolvePosition, select, source, value } from './support';

const CHEATS = {
    permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
    requiresCheats: true
} as const;

const LOCATE_KINDS = ['structure', 'biome', 'poi'] as const;
type LocateKind = (typeof LOCATE_KINDS)[number];

const LOCATE_REGISTRIES = {
    structure: 'worldgen/structure',
    biome: 'worldgen/biome',
    poi: 'point_of_interest_type'
} as const satisfies Record<LocateKind, string>;

const locateNameSuggestions = suggestFromData<CommandSource>(
    (context) => javaIdentifiersTable.registries[LOCATE_REGISTRIES[value<LocateKind>(context, 'kind')]] ?? []
);

/** Reads Bedrock's `["facing"="north"]` block state list into a record. */
export const parseBlockStates = (text: string): Record<string, string> => {
    const states: Record<string, string> = {};
    for (const [, key, state] of text.matchAll(/"?([\w:]+)"?\s*=\s*"?([\w:.-]+)"?/g)) {
        if (key !== undefined && state !== undefined) states[key] = state;
    }
    return states;
};

const blockAt = (context: Context, nameKey: string, statesKey?: string): BlockRef => ({
    identifier: value<string>(context, nameKey),
    states: statesKey === undefined ? {} : parseBlockStates(value<string>(context, statesKey))
});

/** Registers the 15 world commands. */
export const registerWorldCommands = (registry: CommandRegistry<CommandSource>): void => {
    const content = registry.getContent();

    registry.register(
        lit('setblock').then(
            arg('position', blockPositionArgument()).then(
                arg('block', resourceArgument('minecraft:block', content.blocks))
                    .executes(command((context) => setBlock(context, undefined, 'replace')))
                    .then(
                        arg('blockStates', blockStatesArgument())
                            .executes(command((context) => setBlock(context, 'blockStates', 'replace')))
                            .then(
                                arg(
                                    'mode',
                                    enumArgument('OldBlockMode', ['destroy', 'keep', 'replace'] as const)
                                ).executes(
                                    command((context) => setBlock(context, 'blockStates', value(context, 'mode')))
                                )
                            )
                    )
                    .then(
                        arg('mode', enumArgument('OldBlockMode', ['destroy', 'keep', 'replace'] as const)).executes(
                            command((context) => setBlock(context, undefined, value(context, 'mode')))
                        )
                    )
            )
        ),
        { description: 'Places one block.', ...CHEATS }
    );

    registry.register(
        lit('fill').then(
            arg('from', blockPositionArgument()).then(
                arg('to', blockPositionArgument()).then(
                    arg('block', resourceArgument('minecraft:block', content.blocks))
                        .executes(command((context) => fill(context, 'replace')))
                        .then(
                            arg(
                                'mode',
                                enumArgument('FillMode', ['destroy', 'hollow', 'keep', 'outline', 'replace'] as const)
                            ).executes(command((context) => fill(context, value(context, 'mode'))))
                        )
                )
            )
        ),
        { description: 'Fills a region with a block.', ...CHEATS }
    );

    registry.register(
        lit('clone').then(
            arg('begin', blockPositionArgument()).then(
                arg('end', blockPositionArgument()).then(
                    arg('destination', blockPositionArgument())
                        .executes(command((context) => clone(context, 'replace', 'normal')))
                        .then(
                            arg('maskMode', enumArgument('CloneMaskMode', ['filtered', 'masked', 'replace'] as const))
                                .executes(command((context) => clone(context, value(context, 'maskMode'), 'normal')))
                                .then(
                                    arg(
                                        'cloneMode',
                                        enumArgument('CloneMode', ['force', 'move', 'normal'] as const)
                                    ).executes(
                                        command((context) =>
                                            clone(context, value(context, 'maskMode'), value(context, 'cloneMode'))
                                        )
                                    )
                                )
                        )
                )
            )
        ),
        { description: 'Copies a region of blocks.', ...CHEATS }
    );

    registry.register(
        lit('time')
            .then(
                lit('query').then(
                    arg('unit', enumArgument('TimeQuery', ['daytime', 'gametime', 'day'] as const)).executes(
                        command((context) => {
                            const current = source(context);
                            const ticks = current.host.world.getTime();
                            const unit = value<string>(context, 'unit');
                            const measured =
                                unit === 'day'
                                    ? Math.floor(ticks / 24_000)
                                    : unit === 'daytime'
                                      ? ticks % 24_000
                                      : ticks;
                            current.sendFeedback(`The time is ${measured}`);
                            return measured;
                        })
                    )
                )
            )
            .then(
                lit('set').then(
                    arg('amount', timeArgument({ min: 0 })).executes(
                        command((context) => {
                            const current = source(context);
                            const ticks = value<number>(context, 'amount');
                            current.host.world.setTime(ticks);
                            return report(current, ticks === 0 ? 1 : ticks, `Set the time to ${ticks}`);
                        })
                    )
                )
            )
            .then(
                lit('add').then(
                    arg('amount', timeArgument()).executes(
                        command((context) => {
                            const current = source(context);
                            const ticks = current.host.world.addTime(value(context, 'amount'));
                            return report(current, ticks, `The time is now ${ticks}`);
                        })
                    )
                )
            ),
        { description: 'Changes or queries the world time.', ...CHEATS }
    );

    registry.register(
        lit('weather').then(
            arg('weather', enumArgument('Weather', ['clear', 'rain', 'thunder'] as const))
                .executes(command((context) => setWeather(context, undefined)))
                .then(
                    arg('duration', timeArgument({ min: 0 })).executes(
                        command((context) => setWeather(context, value<number>(context, 'duration')))
                    )
                )
        ),
        { description: 'Changes the weather.', ...CHEATS }
    );

    const gamerule = lit('gamerule');
    for (const rule of JAVA_GAME_RULES) {
        const spelling = rule.name.slice('minecraft:'.length);
        const node = lit(spelling).executes(
            command((context) => {
                const current = source(context);
                const found = current.host.world.getGameRule(rule.name);
                current.sendFeedback(`${rule.name} = ${String(found)}`);
                return typeof found === 'number' ? found : found === true ? 1 : 0;
            })
        );
        const valueType: ArgumentType<string | number> =
            rule.type === 'boolean'
                ? enumArgument('BoolGameRuleValue', ['true', 'false'] as const)
                : integerArgument(rule.min === undefined ? {} : { min: rule.min });
        node.then(
            arg('value', valueType).executes(
                command((context) => {
                    const current = source(context);
                    const raw = value<string | number>(context, 'value');
                    const set = current.host.world.setGameRule(
                        rule.name,
                        rule.type === 'boolean' ? raw === 'true' : raw
                    );
                    return report(current, set ? 1 : 0, `${rule.name} = ${String(raw)}`);
                })
            )
        );
        gamerule.then(node);
    }
    registry.register(gamerule, { description: 'Reads and writes gamerules.', ...CHEATS });

    registry.register(
        lit('difficulty')
            .executes(
                command((context) => {
                    const current = source(context);
                    current.sendFeedback(`The difficulty is ${current.host.world.getDifficulty()}`);
                    return 1;
                })
            )
            .then(
                arg('difficulty', enumArgument('Difficulty', ['peaceful', 'easy', 'normal', 'hard'] as const)).executes(
                    command((context) => {
                        const current = source(context);
                        const set = current.host.world.setDifficulty(value(context, 'difficulty'));
                        return report(current, set ? 1 : 0, 'Set the difficulty');
                    })
                )
            ),
        { description: 'Changes the difficulty.', ...CHEATS }
    );

    registry.register(
        lit('setworldspawn')
            .executes(command((context) => setWorldSpawn(context, false)))
            .then(
                arg('position', blockPositionArgument()).executes(command((context) => setWorldSpawn(context, true)))
            ),
        { description: 'Moves the world spawn.', ...CHEATS }
    );

    registry.register(
        lit('spawnpoint').then(
            arg('targets', entityArgument()).then(
                arg('position', blockPositionArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const position = resolvePosition(value(context, 'position'), current);
                        const set = select(current, value(context, 'targets')).filter((entity) =>
                            current.host.world.setSpawnPoint(entity, current.dimension, position, 0)
                        ).length;
                        return report(current, set, `Set the spawn point of ${set} players`);
                    })
                )
            )
        ),
        { description: 'Moves a player spawn point.', ...CHEATS }
    );

    registry.register(
        lit('locate').then(
            arg('kind', enumArgument('LocateKind', LOCATE_KINDS)).then(
                arg('name', stringArgument())
                    .suggests(locateNameSuggestions)
                    .executes(
                        command((context) => {
                            const current = source(context);
                            const found = current.host.world.locate(
                                value(context, 'kind'),
                                value(context, 'name'),
                                current.position,
                                current.dimension
                            );
                            if (found === undefined) return report(current, 0, 'Nothing was found');
                            current.sendFeedback(`Found it at ${found.x}, ${found.y}, ${found.z}`);
                            return 1;
                        })
                    )
            )
        ),
        { description: 'Finds the nearest structure, biome or point of interest.', ...CHEATS }
    );

    registry.register(
        lit('place').then(
            arg('kind', enumArgument('PlaceKind', ['feature', 'jigsaw', 'structure', 'template'] as const)).then(
                arg('name', stringArgument())
                    .executes(command((context) => place(context, false)))
                    .then(arg('position', blockPositionArgument()).executes(command((context) => place(context, true))))
            )
        ),
        { description: 'Places a feature, jigsaw, structure or template.', ...CHEATS }
    );

    registry.register(
        lit('particle').then(
            arg('name', resourceArgument('minecraft:particle_type'))
                .executes(command((context) => particle(context, false)))
                .then(arg('position', positionArgument()).executes(command((context) => particle(context, true))))
        ),
        { description: 'Spawns particles.', ...CHEATS }
    );

    registry.register(
        lit('playsound').then(
            arg('sound', stringArgument()).then(
                arg('targets', entityArgument())
                    .executes(command((context) => playSound(context, 1, 1)))
                    .then(
                        arg('position', positionArgument())
                            .executes(command((context) => playSound(context, 1, 1)))
                            .then(
                                arg('volume', floatArgument({ min: 0 }))
                                    .executes(command((context) => playSound(context, value(context, 'volume'), 1)))
                                    .then(
                                        arg('pitch', floatArgument({ min: 0 })).executes(
                                            command((context) =>
                                                playSound(context, value(context, 'volume'), value(context, 'pitch'))
                                            )
                                        )
                                    )
                            )
                    )
            )
        ),
        { description: 'Plays a sound.', ...CHEATS }
    );

    registry.register(
        lit('stopsound').then(
            arg('targets', entityArgument())
                .executes(command((context) => stopSound(context, undefined)))
                .then(
                    arg('sound', stringArgument()).executes(
                        command((context) => stopSound(context, value<string>(context, 'sound')))
                    )
                )
        ),
        { description: 'Stops a sound.', ...CHEATS }
    );

    registry.register(
        lit('spreadplayers').then(
            arg('x', floatArgument()).then(
                arg('z', floatArgument()).then(
                    arg('spreadDistance', floatArgument({ min: 0 })).then(
                        arg('maxRange', floatArgument({ min: 1 })).then(
                            arg('respectTeams', enumArgument('Boolean', ['true', 'false'] as const)).then(
                                arg('targets', entityArgument()).executes(
                                    command((context) => {
                                        const current = source(context);
                                        const moved = current.host.world.spreadPlayers(
                                            current.dimension,
                                            { x: value(context, 'x'), z: value(context, 'z') },
                                            value(context, 'spreadDistance'),
                                            value(context, 'maxRange'),
                                            value<string>(context, 'respectTeams') === 'true',
                                            select(current, value(context, 'targets'))
                                        );
                                        return report(current, moved, `Spread ${moved} players`);
                                    })
                                )
                            )
                        )
                    )
                )
            )
        ),
        { description: 'Spreads players around a point.', ...CHEATS }
    );

    // `/execute in` names the dimensions; the enum is shared so a server with
    // extra dimensions only has to extend it in one place.
    void dimensionArgument;
};

const setBlock = (context: Context, statesKey: string | undefined, mode: string): number => {
    const current = source(context);
    const placed = current.host.world.setBlock(
        current.dimension,
        resolvePosition(value(context, 'position'), current),
        blockAt(context, 'block', statesKey),
        mode === 'destroy' ? 'destroy' : mode === 'keep' ? 'keep' : 'replace'
    );
    return report(current, placed ? 1 : 0, 'Placed the block');
};

const fill = (context: Context, mode: string): number => {
    const current = source(context);
    const filled = current.host.world.fill(
        current.dimension,
        resolvePosition(value(context, 'from'), current),
        resolvePosition(value(context, 'to'), current),
        blockAt(context, 'block'),
        mode === 'destroy'
            ? 'destroy'
            : mode === 'hollow'
              ? 'hollow'
              : mode === 'keep'
                ? 'keep'
                : mode === 'outline'
                  ? 'outline'
                  : 'replace'
    );
    return report(current, filled, `Filled ${filled} blocks`);
};

const clone = (context: Context, maskMode: string, cloneMode: string): number => {
    const current = source(context);
    const copied = current.host.world.clone(
        current.dimension,
        resolvePosition(value(context, 'begin'), current),
        resolvePosition(value(context, 'end'), current),
        resolvePosition(value(context, 'destination'), current),
        maskMode === 'masked' ? 'masked' : maskMode === 'filtered' ? 'filtered' : 'replace',
        cloneMode === 'force' ? 'force' : cloneMode === 'move' ? 'move' : 'normal'
    );
    return report(current, copied, `Cloned ${copied} blocks`);
};

const setWeather = (context: Context, duration: number | undefined): number => {
    const current = source(context);
    const weather = value<'clear' | 'rain' | 'thunder'>(context, 'weather');
    current.host.world.setWeather(weather, duration);
    return report(current, 1, `Set the weather to ${weather}`);
};

const setWorldSpawn = (context: Context, hasPosition: boolean): number => {
    const current = source(context);
    const position = hasPosition ? resolvePosition(value(context, 'position'), current) : current.position;
    const set = current.host.world.setWorldSpawn(current.dimension, position, 0);
    return report(current, set ? 1 : 0, 'Moved the world spawn');
};

const place = (context: Context, hasPosition: boolean): number => {
    const current = source(context);
    const position = hasPosition ? resolvePosition(value(context, 'position'), current) : current.position;
    const placed = current.host.world.place(
        value(context, 'kind'),
        value(context, 'name'),
        position,
        current.dimension
    );
    return report(current, placed ? 1 : 0, 'Placed it');
};

const particle = (context: Context, hasPosition: boolean): number => {
    const current = source(context);
    const position = hasPosition ? resolvePosition(value(context, 'position'), current) : current.position;
    const shown = current.host.world.particle(value(context, 'name'), position, current.dimension);
    return report(current, shown ? 1 : 0, 'Spawned the particle');
};

const playSound = (context: Context, volume: number, pitch: number): number => {
    const current = source(context);
    const listeners = select(current, value(context, 'targets'));
    const position = context.getNodes().some((node) => node.getNode().getName() === 'position')
        ? resolvePosition(value(context, 'position'), current)
        : current.position;
    const heard = current.host.world.playSound(value(context, 'sound'), listeners, position, volume, pitch);
    return report(current, heard, `Played the sound to ${heard} players`);
};

const stopSound = (context: Context, sound: string | undefined): number => {
    const current = source(context);
    const stopped = current.host.world.stopSound(select(current, value(context, 'targets')), sound);
    return report(current, stopped, `Stopped the sound for ${stopped} players`);
};
