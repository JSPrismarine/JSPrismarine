import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system, world } from '@minecraft/server';

import { clockOf, PLACEHOLDERS, uptimeOf } from './placeholders.js';

/** The enum of `/placeholders`'s first word. */
const ACTIONS = 'jsp:placeholders_action';
/** The dimension whose weather `{world:weather}` reads when the text is for no player. */
const OVERWORLD = 'overworld';

/**
 * `@jsprismarine/server` once it has loaded, with the members the providers read. Undefined before
 * then, on Bedrock Dedicated Server, and on a JSPrismarine older than 0.23.0.
 */
let jsp;
/** `@jsprismarine/placeholders`, the registry, once it has loaded; undefined where `jsp` is. */
let placeholders;
/** `system.currentTick` when the world loaded, which `{server:uptime}` counts from. */
let started = 0;
/**
 * The weather of each dimension, by id, from the changes the scripts have seen. The stable Script
 * API has no read of the weather (`Dimension.getWeather` is beta only), so a dimension is unknown
 * until its weather changes once, and `{world:weather}` stays as written until then
 * (https://github.com/JSPrismarine/JSPrismarine/issues/3388).
 */
const weather = new Map();

/** A dimension id without its `minecraft:` prefix, the form the weather event names it in. */
const bare = (dimension) => dimension.replace(/^minecraft:/, '');

/** A number with one decimal, as text. */
const oneDecimal = (number) => number.toFixed(1);

/** The resolvers of each namespace: the key's value, or undefined to leave the token. */
const resolvers = {
    player: (key, player) => {
        if (player === undefined) return undefined;
        switch (key) {
            case 'name':
                return player.name;
            case 'ping': {
                const ping = jsp.getPing(player);
                return ping === undefined ? undefined : Math.round(ping);
            }
            case 'health': {
                const health = player.getComponent('minecraft:health');
                return health === undefined ? undefined : Math.round(health.currentValue);
            }
            case 'max_health':
                return player.getComponent('minecraft:health')?.effectiveMax;
            case 'gamemode':
                return player.getGameMode();
            case 'dimension':
                return bare(player.dimension.id);
            case 'x':
                return Math.floor(player.location.x);
            case 'y':
                return Math.floor(player.location.y);
            case 'z':
                return Math.floor(player.location.z);
            case 'level':
                return player.level;
            default:
                return undefined;
        }
    },
    server: (key) => {
        switch (key) {
            case 'tps':
                return oneDecimal(jsp.performance.tps);
            case 'mspt':
                return oneDecimal(jsp.performance.averageTickMs);
            case 'online':
                return world.getAllPlayers().length;
            case 'max':
                return jsp.jsprismarine.maxPlayers;
            case 'version':
                return jsp.jsprismarine.version;
            case 'uptime':
                return uptimeOf(system.currentTick - started);
            default:
                return undefined;
        }
    },
    world: (key, player) => {
        switch (key) {
            case 'time':
                return clockOf(world.getTimeOfDay());
            case 'day':
                return world.getDay();
            case 'weather':
                return weather.get(player === undefined ? OVERWORLD : bare(player.dimension.id));
            default:
                return undefined;
        }
    }
};

/** Registers the three namespaces, each with the keys the table lists. */
const register = () => {
    for (const [namespace, keys] of Object.entries(PLACEHOLDERS)) {
        placeholders.register(namespace, { keys: Object.keys(keys), resolve: resolvers[namespace] });
    }
};

/** The lines `/placeholders list` prints: each namespace with its keys. */
const listing = () =>
    placeholders
        .namespaces()
        .map(({ namespace, keys }) => `${namespace}: ${keys.join(', ')}`)
        .join('\n');

/** Runs `/placeholders list` and `/placeholders parse <text>`. */
const run = (origin, action, text) => {
    if (jsp === undefined || placeholders === undefined) {
        return {
            status: CustomCommandStatus.Failure,
            message: 'Standard placeholders need JSPrismarine 0.23.0 or newer, and this server is not one.'
        };
    }
    if (action === 'list') return { status: CustomCommandStatus.Success, message: listing() };
    if (text === undefined) {
        return { status: CustomCommandStatus.Failure, message: 'Usage: /placeholders parse <text>' };
    }
    const sender = origin.sourceEntity;
    const player = sender?.typeId === 'minecraft:player' ? sender : undefined;
    return { status: CustomCommandStatus.Success, message: placeholders.resolve(text, player) };
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerEnum(ACTIONS, ['list', 'parse']);
    customCommandRegistry.registerCommand(
        {
            name: 'jsp:placeholders',
            description: 'Lists the placeholders, or renders a text with them for you.',
            permissionLevel: CommandPermissionLevel.GameDirectors,
            mandatoryParameters: [{ name: ACTIONS, type: CustomCommandParamType.Enum }],
            optionalParameters: [{ name: 'text', type: CustomCommandParamType.String }]
        },
        run
    );
});

world.afterEvents.worldLoad.subscribe(() => {
    started = system.currentTick;
});

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
    weather.set(bare(dimension), newWeather);
});

// Neither module is in the manifest, and both load with import(): Bedrock Dedicated Server refuses
// a pack that declares a module it does not know or imports one statically. There the imports
// reject and nothing registers.
Promise.all([import('@jsprismarine/server'), import('@jsprismarine/placeholders')]).then(
    ([server, registry]) => {
        if (!('performance' in server) || !('getPing' in server) || !('register' in registry)) return;
        jsp = server;
        placeholders = registry;
        register();
    },
    () => {}
);
