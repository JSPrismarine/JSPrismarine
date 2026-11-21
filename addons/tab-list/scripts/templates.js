/**
 * What the tab list decides on its own: which template a player renders, what the config file may
 * hold, and what a script event's message asks for. Nothing here imports a module, so the tests
 * and the docs build load it directly.
 */

/** Ticks between two renders when the config names none: once a second at 20 TPS. */
export const DEFAULT_INTERVAL = 20;

/** The script event ids other packs send, by what they ask for. */
export const EVENTS = Object.freeze({
    setGlobal: 'jsp_tablist:set_global',
    setGroup: 'jsp_tablist:set_group',
    clearGroup: 'jsp_tablist:clear_group',
    setPlayer: 'jsp_tablist:set_player',
    clearPlayer: 'jsp_tablist:clear_player'
});

/** The words `/tablist` takes first, in the order its enum lists them. */
export const ACTIONS = Object.freeze(['format', 'reset', 'group', 'player', 'show']);

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value is a template: a shorthand string or a rawtext-style tree. */
export const isTemplate = (value) => typeof value === 'string' || isRecord(value);

/**
 * Reads the config file's value. A field of the wrong shape is left out and named in `problems`,
 * so a typo in one group's template does not take every template down.
 * @param {unknown} value - The parsed file, or undefined when there is none.
 * @returns {{ interval: number, global: unknown, groups: Map<string, unknown>, problems: string[] }}
 *   The interval in ticks, the global template, the template of each group, and what was left out.
 */
export const readConfig = (value) => {
    const problems = [];
    const config = { interval: DEFAULT_INTERVAL, global: undefined, groups: new Map(), problems };
    if (value === undefined) return config;
    if (!isRecord(value)) {
        problems.push('the file is not a JSON object');
        return config;
    }
    if (value.interval !== undefined) {
        if (Number.isInteger(value.interval) && value.interval >= 1) config.interval = value.interval;
        else problems.push('`interval` is not a whole number of ticks, 1 or more');
    }
    const templates = value.templates;
    if (templates === undefined) return config;
    if (!isRecord(templates)) {
        problems.push('`templates` is not an object');
        return config;
    }
    if (templates.global !== undefined) {
        if (isTemplate(templates.global)) config.global = templates.global;
        else problems.push('`templates.global` is not a template');
    }
    if (templates.groups !== undefined) {
        if (!isRecord(templates.groups)) problems.push('`templates.groups` is not an object');
        else {
            for (const [group, template] of Object.entries(templates.groups)) {
                if (isTemplate(template)) config.groups.set(group, template);
                else problems.push(`\`templates.groups.${group}\` is not a template`);
            }
        }
    }
    return config;
};

/**
 * The file to write for a config, keeping whatever else the owner put in it.
 * @param {unknown} raw - The file as it is now.
 * @param {{ interval: number, global: unknown, groups: Map<string, unknown> }} config - What to write.
 * @returns {Record<string, unknown>} The file's new value.
 */
export const configFile = (raw, { interval, global, groups }) => {
    const base = isRecord(raw) ? raw : {};
    const templates = { ...(isRecord(base.templates) ? base.templates : {}) };
    delete templates.global;
    if (global !== undefined) templates.global = global;
    templates.groups = Object.fromEntries(groups);
    const file = { ...base, templates };
    // An interval the owner never wrote stays out of the file while it is the default.
    if (interval !== DEFAULT_INTERVAL || base.interval !== undefined) file.interval = interval;
    return file;
};

/**
 * The template a player renders: their own, set for the session or kept on them, then their
 * primary group's, then the global one.
 * @param {{ session?: unknown, persisted?: unknown, group?: string, groups: Map<string, unknown>, global?: unknown }} levels
 * @returns {unknown} The template, or undefined when no level has one.
 */
export const pickTemplate = ({ session, persisted, group, groups, global }) =>
    session ?? persisted ?? (group === undefined ? undefined : groups.get(group)) ?? global;

const refuse = (reason) => ({ ok: false, reason });
const accept = (request) => ({ ok: true, request });

/** A non-empty string field of a message, or the reason it is missing. */
const text = (data, field) => {
    const value = data[field];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * What a `jsp_tablist:*` script event asks for.
 * @param {string} id - The event's id.
 * @param {string} message - Its message, JSON.
 * @returns {{ ok: true, request: Record<string, unknown> } | { ok: false, reason: string }} The
 *   request with its `kind`, or why the message is refused.
 */
export const parseMessage = (id, message) => {
    let data;
    try {
        data = JSON.parse(message);
    } catch {
        return refuse('the message is not JSON');
    }
    if (!isRecord(data)) return refuse('the message is not a JSON object');
    const template = data.template;
    const group = text(data, 'group');
    const player = text(data, 'player');
    switch (id) {
        case EVENTS.setGlobal:
            return isTemplate(template)
                ? accept({ kind: 'setGlobal', template })
                : refuse('`template` is not a template');
        case EVENTS.setGroup:
            if (group === undefined) return refuse('`group` is not a name');
            return isTemplate(template)
                ? accept({ kind: 'setGroup', group, template })
                : refuse('`template` is not a template');
        case EVENTS.clearGroup:
            return group === undefined ? refuse('`group` is not a name') : accept({ kind: 'clearGroup', group });
        case EVENTS.setPlayer: {
            if (player === undefined) return refuse('`player` is not a name');
            if (!isTemplate(template)) return refuse('`template` is not a template');
            const persist = data.persist ?? false;
            if (typeof persist !== 'boolean') return refuse('`persist` is not a boolean');
            return accept({ kind: 'setPlayer', player, template, persist });
        }
        case EVENTS.clearPlayer:
            return player === undefined ? refuse('`player` is not a name') : accept({ kind: 'clearPlayer', player });
        default:
            return refuse('no such event');
    }
};
