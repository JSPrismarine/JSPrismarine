import type { CustomCommandOrigin, CustomCommandResult, Entity, Player } from '@minecraft/server';
import {
    CommandPermissionLevel,
    CustomCommandParamType,
    CustomCommandStatus,
    GameMode,
    system,
    world
} from '@minecraft/server';

import type { Action, Config, GameModeName, World } from './worlds.ts';
import {
    ACTIONS,
    PLAYER_ACTIONS,
    configFile,
    displayName,
    isAction,
    modify,
    readConfig,
    worldRules
} from './worlds.ts';

/** The members of `@jsprismarine/server` Multiverse needs, which JSPrismarine 0.25.0 has. */
type Jsprismarine = Pick<typeof import('@jsprismarine/server'), 'config' | 'levels'>;
type LevelInfo = import('@jsprismarine/server').LevelInfo;

const LOG = '[Multiverse]';
/** What `/mv` answers where the server has no levels to manage. */
const NEEDS_JSPRISMARINE = 'Multiverse manages the levels of a JSPrismarine server, 0.25.0 or newer.';

/** Each game mode of the config file as the Script API names it. */
const GAME_MODE: Readonly<Record<GameModeName, GameMode>> = {
    survival: GameMode.Survival,
    creative: GameMode.Creative,
    adventure: GameMode.Adventure,
    spectator: GameMode.Spectator
};

/**
 * `@jsprismarine/server` once it has loaded. Undefined before then, on Bedrock Dedicated Server,
 * and on a JSPrismarine without `levels`, where `/mv` only says what it needs.
 */
let jsp: Jsprismarine | undefined;
/** The config file as last read, and the file's raw value for writes that keep the owner's other keys. */
let config: Config = readConfig(undefined);
let rawConfig: unknown;
/** The players who died in this level, by player id, until they respawn. */
const diedHere = new Set<string>();

/** Whether an entity is a player. */
const isPlayer = (entity: Entity | undefined): entity is Player => entity?.typeId === 'minecraft:player';

/** Whether a player may run the actions for operators, and enter hidden and full worlds. */
const isOperator = (player: Player): boolean => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** The online player in this level with a name. */
const playerNamed = (name: string): Player | undefined => world.getAllPlayers().find((player) => player.name === name);

/** The level a name or UUID names, attached or not. */
const levelNamed = (server: Jsprismarine, name: string): LevelInfo | undefined => {
    const wanted = name.toLowerCase();
    const levels = server.levels.list();
    return (
        levels.find((level) => level.attached && level.name.toLowerCase() === wanted) ??
        levels.find((level) => level.id === wanted || level.name.toLowerCase() === wanted)
    );
};

/** Puts this level's game mode on a player who is not an operator. */
const applyGameMode = (server: Jsprismarine, player: Player): void => {
    if (isOperator(player)) return;
    const mode = worldRules(config, server.levels.current).gamemode;
    if (mode !== undefined && player.getGameMode() !== GAME_MODE[mode]) player.setGameMode(GAME_MODE[mode]);
};

/** Tells whoever ran a command how an operation that finished later went: a player in chat, the console in the log. */
const tell = (player: Player | undefined, message: string): void => {
    if (player?.isValid === true) player.sendMessage(message);
    else if (player === undefined) console.warn(`${LOG} ${message}`);
};

/** Takes the config file's value in and says what it left out. */
const applyConfig = (value: unknown): void => {
    rawConfig = value;
    config = readConfig(value);
    for (const problem of config.problems) console.warn(`${LOG} addons/multiverse.config.json: ${problem}.`);
};

/** Writes one world's rules, and takes the file in without waiting for its watch. */
const writeWorld = (server: Jsprismarine, level: LevelInfo, rules: World): void => {
    const file = configFile(rawConfig, new Map(config.worlds).set(level.id, rules));
    server.config.write(file);
    applyConfig(file);
};

const success = (message: string): CustomCommandResult => ({ status: CustomCommandStatus.Success, message });
const failure = (message: string): CustomCommandResult => ({ status: CustomCommandStatus.Failure, message });

/** Who ran a command: the player, if a player did, and whether they may run the operators' actions. */
interface Caller {
    readonly player?: Player;
    readonly operator: boolean;
}

/** The attached level a name or UUID names, when the caller may see it, or why not. */
const visibleLevel = (
    server: Jsprismarine,
    caller: Caller,
    name: string | undefined
): { readonly level: LevelInfo } | { readonly problem: string } => {
    if (name === undefined) return { problem: 'Name a world.' };
    const level = levelNamed(server, name);
    if (level === undefined || !level.attached || (worldRules(config, level).hidden && !caller.operator))
        return { problem: `There is no world ${name}. /mv list shows the worlds.` };
    return { level };
};

/** One line of `/mv list` and `/mv who` naming a level, with its alias. */
const levelLine = (level: LevelInfo): string => {
    const alias = worldRules(config, level).alias;
    return `${level.name}${alias === undefined ? '' : ` (${alias})`}`;
};

/** `/mv list`: every world the caller may see with its players, and for operators the hidden and unloaded ones. */
const listCommand = (server: Jsprismarine, caller: Caller): CustomCommandResult => {
    const levels = server.levels.list();
    const lines = levels
        .filter((level) => level.attached && (caller.operator || !worldRules(config, level).hidden))
        .map((level) => {
            const notes = [
                level.entry ? 'entry' : undefined,
                worldRules(config, level).hidden ? 'hidden' : undefined
            ].filter((note) => note !== undefined);
            return `${levelLine(level)}: ${level.players.length} online${notes.length === 0 ? '' : ` §7[${notes.join(', ')}]§r`}`;
        });
    if (caller.operator) {
        const unloaded = levels.filter((level) => !level.attached).map((level) => level.name);
        if (unloaded.length > 0) lines.push(`§7Unloaded: ${unloaded.join(', ')}`);
    }
    return success(lines.join('\n'));
};

/** `/mv info <world>`: a world's rules, and its UUID, which the config file keys them by. */
const infoCommand = (server: Jsprismarine, caller: Caller, name: string | undefined): CustomCommandResult => {
    const found = visibleLevel(server, caller, name);
    if ('problem' in found) return failure(found.problem);
    const { level } = found;
    const rules = worldRules(config, level);
    const respawn =
        rules.respawnWorld === undefined
            ? undefined
            : server.levels.list().find((each) => each.id === rules.respawnWorld);
    return success(
        [
            `${levelLine(level)}: ${level.id}`,
            `Game mode: ${rules.gamemode ?? 'unchanged'}`,
            `Players: ${level.players.length}${rules.playerLimit === undefined ? '' : ` of ${rules.playerLimit}`}`,
            `Respawn in: ${rules.respawnWorld === undefined ? 'the world' : (respawn?.name ?? rules.respawnWorld)}`,
            `Hidden: ${rules.hidden ? 'yes' : 'no'}`
        ].join('\n')
    );
};

/** Moves a player to a level's spawn, and tells them if the move failed. */
const sendTo = (server: Jsprismarine, player: Player, level: LevelInfo): void => {
    server.levels.transfer(player, level.id, { toSpawn: true }).then(
        (landed) => {
            if (!landed) tell(player, `§cYou could not be moved to ${displayName(config, level)}.`);
        },
        (error: unknown) => tell(player, `§c${error instanceof Error ? error.message : String(error)}`)
    );
};

/**
 * `/mv tp <world> [player]`: sends the caller, or for an operator a named player in this world,
 * to a world's spawn.
 */
const tpCommand = (
    server: Jsprismarine,
    caller: Caller,
    name: string | undefined,
    target: string | undefined
): CustomCommandResult => {
    const found = visibleLevel(server, caller, name);
    if ('problem' in found) return failure(found.problem);
    const { level } = found;
    let player = caller.player;
    if (target !== undefined && target !== player?.name) {
        if (!caller.operator) return failure('Only an operator can send another player.');
        player = playerNamed(target);
        if (player === undefined)
            return failure(`No player named ${target} is in this world. /world tp moves a player from any world.`);
    }
    if (player === undefined) return failure('Name the player to send.');
    const limit = worldRules(config, level).playerLimit;
    if (limit !== undefined && !caller.operator && level.players.length >= limit)
        return failure(`${displayName(config, level)} is full: ${limit} players.`);
    sendTo(server, player, level);
    return success(`Sending ${player.name} to ${displayName(config, level)}.`);
};

/** `/mv spawn`: sends the caller to the spawn of the world they are in. */
const spawnCommand = (server: Jsprismarine, caller: Caller): CustomCommandResult => {
    const player = caller.player;
    if (player === undefined) return failure('Only a player can go to a spawn.');
    const level = server.levels.current;
    sendTo(server, player, level);
    return success(`Sending you to the spawn of ${displayName(config, level)}.`);
};

/** `/mv who [world]`: the players in each world the caller may see, or in one. */
const whoCommand = (server: Jsprismarine, caller: Caller, name: string | undefined): CustomCommandResult => {
    let levels: readonly LevelInfo[];
    if (name === undefined) {
        levels = server.levels
            .list()
            .filter((level) => level.attached && (caller.operator || !worldRules(config, level).hidden));
    } else {
        const found = visibleLevel(server, caller, name);
        if ('problem' in found) return failure(found.problem);
        levels = [found.level];
    }
    return success(
        levels
            .map((level) => `${levelLine(level)}: ${level.players.length === 0 ? 'nobody' : level.players.join(', ')}`)
            .join('\n')
    );
};

/** `/mv coords`: the caller's world, dimension and position. */
const coordsCommand = (server: Jsprismarine, caller: Caller): CustomCommandResult => {
    const player = caller.player;
    if (player === undefined) return failure('Only a player has a position.');
    const { x, y, z } = player.location;
    return success(
        `${levelLine(server.levels.current)}, ${player.dimension.id}: ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`
    );
};

/** `/mv create <name> [preset] [seed]`: creates a level, which opens once its spawn has generated. */
const createCommand = (
    server: Jsprismarine,
    caller: Caller,
    name: string | undefined,
    preset: string | undefined,
    seed: string | undefined
): CustomCommandResult => {
    if (name === undefined) return failure('Name the world to create.');
    server.levels
        .create(name, { ...(preset === undefined ? {} : { preset }), ...(seed === undefined ? {} : { seed }) })
        .then(
            (level) => tell(caller.player, `Created ${level.name}. /mv tp ${level.name} goes there.`),
            (error: unknown) => tell(caller.player, `§c${error instanceof Error ? error.message : String(error)}`)
        );
    return success(`Creating ${name}.`);
};

/** `/mv load <world>`: attaches an unloaded level again. */
const loadCommand = (server: Jsprismarine, caller: Caller, name: string | undefined): CustomCommandResult => {
    if (name === undefined) return failure('Name the world to load.');
    server.levels.attach(name).then(
        (level) => tell(caller.player, `Loaded ${level.name}.`),
        (error: unknown) => tell(caller.player, `§c${error instanceof Error ? error.message : String(error)}`)
    );
    return success(`Loading ${name}.`);
};

/** `/mv unload <world>`: saves a level, sends its players to the entry world and detaches it. Its files stay. */
const unloadCommand = (server: Jsprismarine, caller: Caller, name: string | undefined): CustomCommandResult => {
    if (name === undefined) return failure('Name the world to unload.');
    server.levels.detach(name).then(
        () => tell(caller.player, `Unloaded ${name}. Its files stay, and /mv load ${name} opens it again.`),
        (error: unknown) => tell(caller.player, `§c${error instanceof Error ? error.message : String(error)}`)
    );
    return success(`Unloading ${name}.`);
};

/** `/mv setspawn`: makes the caller's position the spawn of the world they are in. */
const setspawnCommand = (server: Jsprismarine, caller: Caller): CustomCommandResult => {
    const player = caller.player;
    if (player === undefined) return failure('Only a player can set a spawn where they stand.');
    if (player.dimension.id !== 'minecraft:overworld')
        return failure("A world's spawn is in its Overworld. Stand there to set it.");
    const { x, y, z } = player.location;
    const spawn = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    // A command's callback cannot change the world, so the spawn waits for the tick.
    system.run(() => world.setDefaultSpawnLocation(spawn));
    return success(
        `The spawn of ${displayName(config, server.levels.current)} is now ${spawn.x} ${spawn.y} ${spawn.z}.`
    );
};

/** `/mv modify <world> <property> <value>`: changes one rule of a world. */
const modifyCommand = (
    server: Jsprismarine,
    caller: Caller,
    name: string | undefined,
    property: string | undefined,
    value: string | undefined
): CustomCommandResult => {
    if (name === undefined || property === undefined || value === undefined)
        return failure('Usage: /mv modify <world> <property> <value>');
    const level = levelNamed(server, name);
    if (level === undefined) return failure(`There is no world ${name}. /mv list shows the worlds.`);
    const result = modify(worldRules(config, level), property, value, (each) => levelNamed(server, each));
    if (!result.ok) return failure(result.reason);
    system.run(() => {
        writeWorld(server, level, result.world);
        if (level.id === server.levels.current.id)
            for (const player of world.getAllPlayers()) applyGameMode(server, player);
    });
    return success(`Set ${property.toLowerCase()} of ${level.name} to ${value}.`);
};

/** Runs `/mv`. Anyone may run the {@link PLAYER_ACTIONS}; the rest are for operators and the console. */
const mv = (
    origin: CustomCommandOrigin,
    action: string,
    first?: string,
    second?: string,
    third?: string
): CustomCommandResult => {
    if (!isAction(action)) return failure(`Usage: /mv <${ACTIONS.join('|')}> ...`);
    const server = jsp;
    if (server === undefined) return failure(NEEDS_JSPRISMARINE);
    const source = origin.sourceEntity;
    const player = isPlayer(source) ? source : undefined;
    const caller: Caller = {
        ...(player === undefined ? {} : { player }),
        operator: player === undefined || isOperator(player)
    };
    if (!PLAYER_ACTIONS.includes(action) && !caller.operator) return failure(`Only an operator can run /mv ${action}.`);
    return run(server, caller, action, first, second, third);
};

/** Runs one action for a caller who may run it. */
const run = (
    server: Jsprismarine,
    caller: Caller,
    action: Action,
    first: string | undefined,
    second: string | undefined,
    third: string | undefined
): CustomCommandResult => {
    switch (action) {
        case 'list':
            return listCommand(server, caller);
        case 'info':
            return infoCommand(server, caller, first);
        case 'tp':
            return tpCommand(server, caller, first, second);
        case 'spawn':
            return spawnCommand(server, caller);
        case 'who':
            return whoCommand(server, caller, first);
        case 'coords':
            return coordsCommand(server, caller);
        case 'create':
            return createCommand(server, caller, first, second, third);
        case 'load':
            return loadCommand(server, caller, first);
        case 'unload':
            return unloadCommand(server, caller, first);
        case 'setspawn':
            return setspawnCommand(server, caller);
        case 'modify':
            return modifyCommand(server, caller, first, second, third);
    }
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerEnum('jsp:mv_action', [...ACTIONS]);
    customCommandRegistry.registerCommand(
        {
            name: 'jsp:mv',
            description: 'Lists the worlds, moves between them, and for operators creates, loads and changes them.',
            permissionLevel: CommandPermissionLevel.Any,
            mandatoryParameters: [{ name: 'jsp:mv_action', type: CustomCommandParamType.Enum }],
            optionalParameters: [
                { name: 'world', type: CustomCommandParamType.String },
                { name: 'name', type: CustomCommandParamType.String },
                { name: 'value', type: CustomCommandParamType.String }
            ]
        },
        mv
    );
});

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (isPlayer(deadEntity)) diedHere.add(deadEntity.id);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    const server = jsp;
    if (server === undefined) return;
    // A player who joins the server or arrives from another level spawns here for the first time.
    if (initialSpawn) {
        applyGameMode(server, player);
        return;
    }
    if (!diedHere.delete(player.id) || player.getSpawnPoint() !== undefined) return;
    const respawn = worldRules(config, server.levels.current).respawnWorld;
    const level = respawn === undefined ? undefined : server.levels.list().find((each) => each.id === respawn);
    if (level?.attached === true) sendTo(server, player, level);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    diedHere.delete(playerId);
});

// Neither module is in the manifest, and both load with import(): Bedrock Dedicated Server refuses
// a pack that declares a module it does not know or imports one statically. There the imports
// reject, and `/mv` says what it needs.
import('@jsprismarine/server').then(
    (server) => {
        if (!('config' in server) || !('levels' in server)) return;
        jsp = server;
        applyConfig(server.config.value);
        server.config.afterEvents.change.subscribe(({ value }) => applyConfig(value));
    },
    () => {}
);
import('@jsprismarine/placeholders').then(
    (placeholders) => {
        placeholders.register('multiverse', {
            keys: ['world', 'alias'],
            resolve: (key) => {
                // Every player a pack renders for is in the level the pack runs in.
                const level = jsp?.levels.current;
                if (level === undefined) return undefined;
                return key === 'world' ? level.name : displayName(config, level);
            }
        });
    },
    () => {}
);
