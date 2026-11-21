/**
 * What Multiverse decides on its own: what the config file may hold, and what `/mv modify`
 * changes. A world is one of the server's levels, and the file keys each world's rules by the
 * level's UUID, which stays the same when the level is renamed. Nothing here imports a module at
 * run time, so the tests and the docs build load it directly.
 */

/** The game modes a world can put its players in, as the config file names them. */
export const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
export type GameModeName = (typeof GAME_MODES)[number];

/** The words `/mv` takes first, in the order its enum lists them. */
export const ACTIONS = Object.freeze([
    'list',
    'info',
    'tp',
    'spawn',
    'who',
    'coords',
    'create',
    'load',
    'unload',
    'setspawn',
    'modify'
] as const);
export type Action = (typeof ACTIONS)[number];

/** The actions anyone may run. The others are for operators and the console. */
export const PLAYER_ACTIONS: readonly Action[] = ['list', 'info', 'tp', 'spawn', 'who', 'coords'];

/** The properties `/mv modify` sets, each with the values it takes. */
export const PROPERTIES = {
    alias: 'a name to show for the world, or none',
    gamemode: `${GAME_MODES.join(', ')} or none`,
    hidden: 'true or false',
    playerlimit: 'a whole number of players, or none',
    respawnworld: 'a world, or none'
} as const;
export type Property = keyof typeof PROPERTIES;

/** One world's rules. */
export interface World {
    /** The name players see, in place of the level's name. */
    readonly alias?: string;
    /** The game mode a player who is not an operator is put in on arrival. */
    readonly gamemode?: GameModeName;
    /** Whether the world is left out of `/mv list` for players, and closed to them. */
    readonly hidden: boolean;
    /** How many players `/mv tp` lets in at once. */
    readonly playerLimit?: number;
    /** The UUID of the level a player who dies here respawns in, when they have no bed or anchor. */
    readonly respawnWorld?: string;
}

/** The config file as Multiverse reads it. */
export interface Config {
    /** Every world with rules, by level UUID, in the file's order. */
    readonly worlds: ReadonlyMap<string, World>;
    /** What the file held that Multiverse left out, each a sentence without its full stop. */
    readonly problems: readonly string[];
}

/** A level as Multiverse needs to know it. */
export interface LevelRef {
    readonly id: string;
    readonly name: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a string is a UUID, the way the server writes a level's. */
export const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Whether a value is one of {@link GAME_MODES}. */
export const isGameMode = (value: unknown): value is GameModeName =>
    typeof value === 'string' && (GAME_MODES as readonly string[]).includes(value);

/** Whether a value is one of {@link ACTIONS}. */
export const isAction = (value: unknown): value is Action =>
    typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);

/** Whether a value is one of the {@link PROPERTIES}. */
export const isProperty = (value: string): value is Property => Object.hasOwn(PROPERTIES, value);

/** The rules of a world the file has none for. */
export const DEFAULT_WORLD: World = { hidden: false };

/** Reads one world's rules, naming each field it leaves out. */
const readWorld = (id: string, value: Record<string, unknown>, problems: string[]): World => {
    const where = `\`worlds.${id}`;
    let world: World = DEFAULT_WORLD;
    const { alias, gamemode, hidden, playerLimit, respawnWorld } = value;
    if (alias !== undefined) {
        if (typeof alias === 'string' && alias.length > 0) world = { ...world, alias };
        else problems.push(`${where}.alias\` is not a name`);
    }
    if (gamemode !== undefined) {
        if (isGameMode(gamemode)) world = { ...world, gamemode };
        else problems.push(`${where}.gamemode\` is not one of ${GAME_MODES.join(', ')}`);
    }
    if (hidden !== undefined) {
        if (typeof hidden === 'boolean') world = { ...world, hidden };
        else problems.push(`${where}.hidden\` is not true or false`);
    }
    if (playerLimit !== undefined) {
        if (typeof playerLimit === 'number' && Number.isInteger(playerLimit) && playerLimit >= 0)
            world = { ...world, playerLimit };
        else problems.push(`${where}.playerLimit\` is not a whole number, 0 or more`);
    }
    if (respawnWorld !== undefined) {
        if (typeof respawnWorld === 'string' && isUuid(respawnWorld))
            world = { ...world, respawnWorld: respawnWorld.toLowerCase() };
        else problems.push(`${where}.respawnWorld\` is not a level UUID`);
    }
    return world;
};

/**
 * Reads the config file's value. A world or a field of the wrong shape is left out and named in
 * `problems`, so a typo in one world does not take the others down.
 * @param value - The parsed file, or undefined when there is none.
 */
export const readConfig = (value: unknown): Config => {
    const problems: string[] = [];
    const worlds = new Map<string, World>();
    if (value === undefined) return { worlds, problems };
    if (!isRecord(value)) return { worlds, problems: ['the file is not a JSON object'] };
    const listed = value.worlds;
    if (listed === undefined) return { worlds, problems };
    if (!isRecord(listed)) return { worlds, problems: ['`worlds` is not an object'] };
    for (const [id, rules] of Object.entries(listed)) {
        if (!isUuid(id)) problems.push(`\`worlds.${id}\` is not a level UUID; /mv info shows a world's`);
        else if (!isRecord(rules)) problems.push(`\`worlds.${id}\` is not an object`);
        else worlds.set(id.toLowerCase(), readWorld(id, rules, problems));
    }
    return { worlds, problems };
};

/** The rules of a level: the file's, or the defaults. */
export const worldRules = (config: Config, level: LevelRef): World => config.worlds.get(level.id) ?? DEFAULT_WORLD;

/** A level's name as players see it: its alias, or its name. */
export const displayName = (config: Config, level: LevelRef): string => worldRules(config, level).alias ?? level.name;

/** The file's value for one world's rules, leaving out the defaults. */
const worldFile = (world: World): Record<string, unknown> => {
    const file: Record<string, unknown> = {};
    if (world.alias !== undefined) file.alias = world.alias;
    if (world.gamemode !== undefined) file.gamemode = world.gamemode;
    if (world.hidden) file.hidden = true;
    if (world.playerLimit !== undefined) file.playerLimit = world.playerLimit;
    if (world.respawnWorld !== undefined) file.respawnWorld = world.respawnWorld;
    return file;
};

/**
 * The file to write for a set of worlds, keeping whatever else the owner put in it.
 * @param raw - The file as it is now.
 * @param worlds - Every world's rules, by level UUID, in order.
 */
export const configFile = (raw: unknown, worlds: ReadonlyMap<string, World>): Record<string, unknown> => {
    const base = isRecord(raw) ? raw : {};
    return {
        ...base,
        worlds: Object.fromEntries([...worlds].map(([id, world]) => [id, worldFile(world)]))
    };
};

/** What `/mv modify` asks for: the world's rules after the change, or why it is refused. */
export type Modification =
    { readonly ok: true; readonly world: World } | { readonly ok: false; readonly reason: string };

/**
 * Applies `/mv modify <world> <property> <value>` to a world's rules.
 * @param world - Its rules now.
 * @param property - The property, as typed.
 * @param value - The value, as typed. `none` clears a property that may be unset.
 * @param levelNamed - The level a name or UUID names, for `respawnworld`.
 */
export const modify = (
    world: World,
    property: string,
    value: string,
    levelNamed: (name: string) => LevelRef | undefined
): Modification => {
    const key = property.toLowerCase();
    if (!isProperty(key))
        return {
            ok: false,
            reason: `There is no property ${property}. Set one of ${Object.keys(PROPERTIES).join(', ')}.`
        };
    const refuse = (): Modification => ({ ok: false, reason: `${key} takes ${PROPERTIES[key]}.` });
    const none = value.toLowerCase() === 'none';
    switch (key) {
        case 'alias': {
            if (none) {
                const { alias: _cleared, ...rest } = world;
                return { ok: true, world: rest };
            }
            return value.length > 0 ? { ok: true, world: { ...world, alias: value } } : refuse();
        }
        case 'gamemode': {
            if (none) {
                const { gamemode: _cleared, ...rest } = world;
                return { ok: true, world: rest };
            }
            const mode = value.toLowerCase();
            return isGameMode(mode) ? { ok: true, world: { ...world, gamemode: mode } } : refuse();
        }
        case 'hidden': {
            const flag = value.toLowerCase();
            if (flag !== 'true' && flag !== 'false') return refuse();
            return { ok: true, world: { ...world, hidden: flag === 'true' } };
        }
        case 'playerlimit': {
            if (none) {
                const { playerLimit: _cleared, ...rest } = world;
                return { ok: true, world: rest };
            }
            const limit = Number(value);
            return /^\d+$/.test(value) && Number.isSafeInteger(limit)
                ? { ok: true, world: { ...world, playerLimit: limit } }
                : refuse();
        }
        case 'respawnworld': {
            if (none) {
                const { respawnWorld: _cleared, ...rest } = world;
                return { ok: true, world: rest };
            }
            const level = levelNamed(value);
            return level === undefined
                ? { ok: false, reason: `There is no world ${value}. /mv list shows the worlds.` }
                : { ok: true, world: { ...world, respawnWorld: level.id } };
        }
    }
};
