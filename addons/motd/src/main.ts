import type { CustomCommandOrigin, CustomCommandResult } from '@minecraft/server';
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system } from '@minecraft/server';

import type { LineValue } from './motd.ts';
import { ACTIONS, COUNTS, countOf, LINES, lineOf, lineTemplate, readConfig, withMotd } from './motd.ts';

/**
 * `@jsprismarine/server`, with the members the addon needs, and `@jsprismarine/placeholders`
 * beside it.
 */
interface Api {
    readonly jsp: Pick<typeof import('@jsprismarine/server'), 'config' | 'serverList'>;
    readonly placeholders: typeof import('@jsprismarine/placeholders');
}

/** What the addon tells the server list: each field a template or a count of the config sets. */
interface Shown {
    motd?: string;
    levelName?: string;
    onlinePlayers?: number;
    maxPlayers?: number;
}

const LOG = '[MOTD]';
/** What `/motd` answers where the module, or a member it needs, is missing. */
const NEEDS_JSPRISMARINE = 'The MOTD addon needs JSPrismarine 0.27.0 or newer, and this server is not one.';

/**
 * The modules once they have loaded. Undefined before then, on Bedrock Dedicated Server, and on a
 * JSPrismarine older than 0.27.0.
 */
let api: Api | undefined;
/** The config file as last read, and the file's raw value for writes that keep the owner's other keys. */
let config = readConfig(undefined);
let rawConfig: unknown;
/** What the server list was last told, so a render that changes nothing sends nothing. */
let sent: Shown = {};
/** The tick of the next render on the interval. */
let nextRefresh = 0;
/** The tick at which an animation in a template next changes its text. */
let due: number | undefined;
/** The count fields already named on the console for rendering no number, so each is named once. */
const warnedCounts = new Set<string>();
/** Whether the console was told once that nothing provides the `server` placeholders. */
let warnedPlaceholders = false;

/** The earlier of two ticks, either of which may be absent. */
const earliest = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);

/** Renders one template the config holds, for no player, as the server list is for nobody. */
const renderLine = ({ placeholders }: Api, line: LineValue) =>
    placeholders.render(lineTemplate(line, config.frameInterval, (shorthand) => placeholders.parse(shorthand)));

/** Renders every field the config sets: the text of each line, and each count. */
const renderAll = (loaded: Api): { readonly shown: Shown; readonly nextChangeTick: number | undefined } => {
    const shown: Shown = {};
    let nextChangeTick: number | undefined;
    for (const key of LINES) {
        const line = config[key];
        if (line === undefined) continue;
        const rendered = renderLine(loaded, line);
        shown[key] = lineOf(rendered.text);
        nextChangeTick = earliest(nextChangeTick, rendered.nextChangeTick);
    }
    for (const key of COUNTS) {
        const count = config[key];
        if (count === undefined) continue;
        if (typeof count === 'number') {
            shown[key] = count;
            continue;
        }
        const rendered = renderLine(loaded, count);
        nextChangeTick = earliest(nextChangeTick, rendered.nextChangeTick);
        const value = countOf(rendered.text);
        if (value !== undefined) {
            shown[key] = value;
            warnedCounts.delete(key);
        } else if (!warnedCounts.has(key)) {
            warnedCounts.add(key);
            console.warn(
                `${LOG} \`${key}\` rendered to "${rendered.text}", which is not a count, so the list keeps its own.`
            );
        }
    }
    return { shown, nextChangeTick };
};

/**
 * Tells the server list what the config renders to now, when it changed. A field the config no
 * longer sets goes back to the server's own, which only a reset gives, so the fields still set are
 * sent again after it.
 */
const send = (loaded: Api, shown: Shown): void => {
    if (JSON.stringify(shown) === JSON.stringify(sent)) return;
    const dropped = Object.keys(sent).some((key) => !(key in shown));
    sent = shown;
    if (dropped) loaded.jsp.serverList.reset();
    if (Object.keys(shown).length > 0) loaded.jsp.serverList.update(shown);
};

/** Renders and sends, and plans the next render. */
const refresh = (loaded: Api): void => {
    const { shown, nextChangeTick } = renderAll(loaded);
    due = nextChangeTick;
    send(loaded, shown);
};

/** Each tick: a render when the interval or an animation says one is due. */
const step = (loaded: Api): void => {
    const tick = system.currentTick;
    if (!warnedPlaceholders) {
        warnedPlaceholders = true;
        if (!loaded.placeholders.namespaces().some(({ namespace }) => namespace === 'server')) {
            console.warn(
                `${LOG} Nothing provides {server:...} placeholders, so they stay as written. Run \`addon install standard-placeholders\`.`
            );
        }
    }
    if (tick >= nextRefresh) {
        nextRefresh = tick + config.interval;
        refresh(loaded);
    } else if (due !== undefined && due <= tick) {
        refresh(loaded);
    }
};

/** Takes the config file's value in, says what it left out, and renders again at the next tick. */
const applyConfig = (value: unknown): void => {
    rawConfig = value;
    config = readConfig(value);
    for (const problem of config.problems) console.warn(`${LOG} addons/motd.config.json: ${problem}.`);
    nextRefresh = 0;
};

/** Writes the config with a new MOTD, and takes it in without waiting for the file watch. */
const writeMotd = ({ jsp }: Api, motd: LineValue | undefined): void => {
    const file = withMotd(rawConfig, motd);
    jsp.config.write(file);
    applyConfig(file);
};

const success = (message: string): CustomCommandResult => ({ status: CustomCommandStatus.Success, message });
const failure = (message: string): CustomCommandResult => ({ status: CustomCommandStatus.Failure, message });

/** `/motd show`: what the server list shows now, and what the template renders to. */
const showCommand = (loaded: Api): CustomCommandResult => {
    const { motd, levelName, onlinePlayers, maxPlayers } = loaded.jsp.serverList;
    const lines = [`The server list shows: ${motd} (${levelName}), ${onlinePlayers}/${maxPlayers} players.`];
    lines.push(
        config.motd === undefined
            ? "No MOTD template is set, so the list shows the server's own."
            : `The MOTD template is ${typeof config.motd === 'string' ? config.motd : JSON.stringify(config.motd)}`
    );
    return success(lines.join('\n'));
};

/** Runs `/motd`. */
const motd = (_origin: CustomCommandOrigin, action: string, template?: string): CustomCommandResult => {
    const loaded = api;
    if (loaded === undefined) return failure(NEEDS_JSPRISMARINE);
    switch (action) {
        case 'show':
            return showCommand(loaded);
        case 'set':
            if (template === undefined) return failure('Usage: /motd set <template>');
            // A command runs where the world cannot be changed, so the write waits for the tick.
            system.run(() => writeMotd(loaded, template));
            return success('MOTD template set.');
        case 'reset':
            system.run(() => writeMotd(loaded, undefined));
            return success("MOTD template cleared, so the list shows the server's own MOTD.");
        default:
            return failure(`Usage: /motd <${ACTIONS.join('|')}> ...`);
    }
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerEnum('jsp:motd_action', [...ACTIONS]);
    customCommandRegistry.registerCommand(
        {
            name: 'jsp:motd',
            description: 'Shows or sets the template the server list renders its MOTD from.',
            permissionLevel: CommandPermissionLevel.GameDirectors,
            mandatoryParameters: [{ name: 'jsp:motd_action', type: CustomCommandParamType.Enum }],
            optionalParameters: [{ name: 'template', type: CustomCommandParamType.String }]
        },
        motd
    );
});

// Neither module is in the manifest, and both load with import(): Bedrock Dedicated Server refuses
// a pack that declares a module it does not know or imports one statically. There an import
// rejects and the server list is untouched.
Promise.all([import('@jsprismarine/server'), import('@jsprismarine/placeholders')]).then(
    ([jsp, placeholders]) => {
        if (!('serverList' in jsp) || !('config' in jsp)) return;
        const loaded: Api = { jsp, placeholders };
        api = loaded;
        applyConfig(jsp.config.value);
        jsp.config.afterEvents.change.subscribe(({ value }) => applyConfig(value));
        system.runInterval(() => step(loaded), 1);
    },
    () => {}
);
