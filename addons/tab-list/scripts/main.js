import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system, world } from '@minecraft/server';

import { ACTIONS, EVENTS, configFile, parseMessage, pickTemplate, readConfig } from './templates.js';

/** The player dynamic property that keeps a template set for one player. */
const PLAYER_TEMPLATE = 'jsp_tablist:template';
/** The placeholder that names a player's primary group once permissions provide it. */
const GROUP_TOKEN = '{perms:primary_group}';
/** What `/tablist` answers where the module, or a member it needs, is missing. */
const NEEDS_JSPRISMARINE = 'The tab list needs JSPrismarine 0.23.0 or newer, and this server is not one.';
const LOG = '[Tab List]';

/**
 * `@jsprismarine/server` once it has loaded, when it has the members the list needs, and
 * `@jsprismarine/placeholders` beside it. Both undefined before then, on Bedrock Dedicated
 * Server, and on a JSPrismarine older than 0.23.0.
 */
let jsp;
let placeholders;
/** The config file as last read, and the file's raw value for writes that keep the owner's other keys. */
let config = readConfig(undefined);
let rawConfig;
/** The template set over the API for a player's session, by player id, which leaving clears. */
const session = new Map();
/** The last name sent for each player, by player id, so a render that changes nothing sends nothing. */
const shown = new Map();
/** The tick at which each player's animation next changes, by player id. */
const due = new Map();
/** The tick of the next render of every player. */
let nextRefresh = 0;
/** Whether the console was told once about what the server lacks. */
let warnedPlaceholders = false;
let warnedGroups = false;

/** Whether the registry has a namespace with a key, as a pack on a server that lacks it checks. */
const provides = (namespace, key) =>
    placeholders.namespaces().some((each) => each.namespace === namespace && each.keys.includes(key));

/** A player's primary group from the `perms` namespace, or undefined where no pack provides it. */
const groupOf = (player) => {
    if (provides('perms', 'primary_group')) return placeholders.render(GROUP_TOKEN, player).text;
    if (config.groups.size > 0 && !warnedGroups) {
        warnedGroups = true;
        console.warn(`${LOG} Group templates are set, but nothing provides ${GROUP_TOKEN}, so they are skipped.`);
    }
    return undefined;
};

/** The template kept on a player, parsed from its property. */
const persistedOf = (player) => {
    const kept = player.getDynamicProperty(PLAYER_TEMPLATE);
    if (typeof kept !== 'string') return undefined;
    try {
        return JSON.parse(kept);
    } catch {
        return undefined;
    }
};

/** The template a player renders now, or undefined when no level has one. */
const templateFor = (player) =>
    pickTemplate({
        session: session.get(player.id),
        persisted: persistedOf(player),
        group: groupOf(player),
        groups: config.groups,
        global: config.global
    });

/** Stops showing a name for a player: the login name comes back when one was sent. */
const forget = (player) => {
    due.delete(player.id);
    if (!shown.delete(player.id)) return;
    if (player.isValid) jsp.playerList.reset(player);
};

/** Renders a player's template and sends the name when it changed. */
const render = (player) => {
    const template = templateFor(player);
    if (template === undefined) {
        forget(player);
        return;
    }
    const { text, nextChangeTick } = placeholders.render(template, player);
    if (nextChangeTick === undefined) due.delete(player.id);
    else due.set(player.id, nextChangeTick);
    if (shown.get(player.id) === text) return;
    shown.set(player.id, text);
    // An empty render shows the login name rather than nothing, which the member refuses.
    if (text === '') jsp.playerList.reset(player);
    else jsp.playerList.setDisplayName(player, text);
};

/** Renders every player, now and at the next interval. */
const renderAll = () => {
    nextRefresh = system.currentTick + config.interval;
    for (const player of world.getAllPlayers()) render(player);
};

/** Each tick: the interval's render when it is due, otherwise the players whose animation changes. */
const step = () => {
    const tick = system.currentTick;
    if (!warnedPlaceholders) {
        warnedPlaceholders = true;
        if (!provides('player', 'name')) {
            console.warn(
                `${LOG} Nothing provides {player:...} placeholders, so they stay as written. Run \`addon install standard-placeholders\`.`
            );
        }
    }
    if (tick >= nextRefresh) {
        renderAll();
        return;
    }
    if (due.size === 0) return;
    for (const player of world.getAllPlayers()) {
        const at = due.get(player.id);
        if (at !== undefined && at <= tick) render(player);
    }
};

/** Takes the config file's value in, says what it left out, and renders again at the next tick. */
const applyConfig = (value) => {
    rawConfig = value;
    config = readConfig(value);
    for (const problem of config.problems) console.warn(`${LOG} addons/tab-list.config.json: ${problem}.`);
    nextRefresh = 0;
};

/** Writes the config with a change, and takes it in without waiting for the file watch. */
const writeConfig = (change) => {
    change(config);
    const file = configFile(rawConfig, config);
    jsp.config.write(file);
    applyConfig(file);
};

/** Keeps a template on a player, or takes it off with undefined. */
const persist = (player, template) => {
    player.setDynamicProperty(PLAYER_TEMPLATE, template === undefined ? undefined : JSON.stringify(template));
};

/** The online player with a name. Nothing keys a player by `id`, which is one login's entity id on this server. */
const playerNamed = (name) => world.getAllPlayers().find((player) => player.name === name);

const success = (message) => ({ status: CustomCommandStatus.Success, message });
const failure = (message) => ({ status: CustomCommandStatus.Failure, message });

/** `/tablist format [template]`: shows or sets the global template. */
const formatCommand = (template) => {
    if (template === undefined) {
        const current = config.global;
        if (current === undefined) return success('No global template is set.');
        return success(`The global template is ${typeof current === 'string' ? current : JSON.stringify(current)}`);
    }
    system.run(() =>
        writeConfig((current) => {
            current.global = template;
        })
    );
    return success('Global template set.');
};

/** `/tablist group <group> <template|remove>`. */
const groupCommand = (group, template) => {
    if (group === undefined || template === undefined)
        return failure('Usage: /tablist group <group> <template|remove>');
    const removing = template === 'remove';
    system.run(() =>
        writeConfig((current) => {
            if (removing) current.groups.delete(group);
            else current.groups.set(group, template);
        })
    );
    return success(removing ? `Template of group ${group} removed.` : `Template of group ${group} set.`);
};

/** `/tablist player <target> <template|reset>`. */
const playerCommand = (name, template) => {
    if (name === undefined || template === undefined)
        return failure('Usage: /tablist player <target> <template|reset>');
    const player = playerNamed(name);
    if (player === undefined) return failure(`No player named ${name} is online.`);
    const resetting = template === 'reset';
    system.run(() => {
        if (!player.isValid) return;
        session.delete(player.id);
        persist(player, resetting ? undefined : template);
        render(player);
    });
    return success(resetting ? `Template of ${name} reset.` : `Template of ${name} set.`);
};

/** `/tablist show <target>`: what the target renders to now. */
const showCommand = (name) => {
    if (name === undefined) return failure('Usage: /tablist show <target>');
    const player = playerNamed(name);
    if (player === undefined) return failure(`No player named ${name} is online.`);
    const template = templateFor(player);
    if (template === undefined) return success(`${name} has no template, so the list shows the login name.`);
    return success(`${name} renders to: ${placeholders.render(template, player).text}`);
};

/** Runs `/tablist`. A String argument is one word unless quoted, so `format` joins the two it may get. */
const tablist = (_origin, action, first, second) => {
    if (jsp === undefined) return failure(NEEDS_JSPRISMARINE);
    switch (action) {
        case 'format':
            return formatCommand(first === undefined ? undefined : second === undefined ? first : `${first} ${second}`);
        case 'reset':
            system.run(() =>
                writeConfig((current) => {
                    current.global = undefined;
                })
            );
            return success('Global template cleared.');
        case 'group':
            return groupCommand(first, second);
        case 'player':
            return playerCommand(first, second);
        case 'show':
            return showCommand(first);
        default:
            return failure(`Usage: /tablist <${ACTIONS.join('|')}> ...`);
    }
};

/** Applies what another pack asked for over a script event. */
const applyRequest = (request) => {
    switch (request.kind) {
        case 'setGlobal':
            writeConfig((current) => {
                current.global = request.template;
            });
            return;
        case 'setGroup':
            writeConfig((current) => {
                current.groups.set(request.group, request.template);
            });
            return;
        case 'clearGroup':
            writeConfig((current) => {
                current.groups.delete(request.group);
            });
            return;
        case 'setPlayer':
        case 'clearPlayer': {
            const player = playerNamed(request.player);
            if (player === undefined) {
                console.warn(`${LOG} No player named ${request.player} is online, so ${request.kind} changes nothing.`);
                return;
            }
            if (request.kind === 'clearPlayer') {
                session.delete(player.id);
                persist(player, undefined);
            } else if (request.persist) {
                session.delete(player.id);
                persist(player, request.template);
            } else {
                session.set(player.id, request.template);
            }
            render(player);
            return;
        }
        default:
            return;
    }
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerEnum('jsp:tablist_action', [...ACTIONS]);
    customCommandRegistry.registerCommand(
        {
            name: 'jsp:tablist',
            description: 'Sets the templates the player list renders names from.',
            permissionLevel: CommandPermissionLevel.GameDirectors,
            mandatoryParameters: [{ name: 'jsp:tablist_action', type: CustomCommandParamType.Enum }],
            optionalParameters: [
                { name: 'name', type: CustomCommandParamType.String },
                { name: 'template', type: CustomCommandParamType.String }
            ]
        },
        tablist
    );
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    session.delete(playerId);
    shown.delete(playerId);
    due.delete(playerId);
});

system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (jsp === undefined || !Object.values(EVENTS).includes(id)) return;
    const parsed = parseMessage(id, message);
    if (!parsed.ok) {
        console.warn(`${LOG} ${id}: ${parsed.reason}.`);
        return;
    }
    applyRequest(parsed.request);
});

// Neither module is in the manifest, and both load with import(): Bedrock Dedicated Server refuses
// a pack that declares a module it does not know or imports one statically. There an import
// rejects and the list is untouched.
Promise.all([import('@jsprismarine/server'), import('@jsprismarine/placeholders')]).then(
    ([server, templates]) => {
        if (!('playerList' in server) || !('config' in server)) return;
        jsp = server;
        placeholders = templates;
        applyConfig(jsp.config.value);
        jsp.config.afterEvents.change.subscribe(({ value }) => applyConfig(value));
        system.runInterval(step, 1);
    },
    () => {}
);
