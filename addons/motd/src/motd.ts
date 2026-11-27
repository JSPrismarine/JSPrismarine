/**
 * What the MOTD addon decides on its own: what the config file may hold, how a list of frames
 * becomes one animated template, and how a rendered count reads. Nothing here imports a module at
 * run time, so the tests and the docs build load it directly.
 */
import type { Template, TemplateNode } from '@jsprismarine/placeholders';

/** A template as the file holds it: a shorthand string or a rawtext-style tree. */
export type TemplateValue = Template | string;

/**
 * One line of the server list: a template, or a list of templates the list shows in turn, each
 * for `frameInterval` ticks.
 */
export type LineValue = TemplateValue | readonly TemplateValue[];

/** A player count: a fixed number, or a template that renders to one. */
export type CountValue = number | string;

/** The config file as the addon reads it. */
export interface Config {
    /** Ticks between two renders. */
    interval: number;
    /** Ticks each frame of a list of frames shows for. */
    frameInterval: number;
    /** The MOTD, or undefined to leave the server's own. */
    motd: LineValue | undefined;
    /** The second name, or undefined to leave the server's own. */
    levelName: LineValue | undefined;
    /** The online count to show, or undefined to leave the real one. */
    onlinePlayers: CountValue | undefined;
    /** The player limit to show, or undefined to leave `max-players`. */
    maxPlayers: CountValue | undefined;
    /** What the file held that the addon left out, each a sentence without its full stop. */
    readonly problems: string[];
}

/** The fields a template changes, in the order the config file lists them. */
export const LINES = Object.freeze(['motd', 'levelName'] as const);
/** The count fields, in the order the config file lists them. */
export const COUNTS = Object.freeze(['onlinePlayers', 'maxPlayers'] as const);

/** Ticks between two renders when the config names none: once a second at 20 TPS. */
export const DEFAULT_INTERVAL = 20;
/** Ticks each frame of a list shows for when the config names none: three seconds at 20 TPS. */
export const DEFAULT_FRAME_INTERVAL = 60;
/** The largest count the server list carries. */
export const MAX_COUNT = 2_147_483_647;

/** The words `/motd` takes first, in the order its enum lists them. */
export const ACTIONS = Object.freeze(['show', 'set', 'reset']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value is a template: a shorthand string or a tree. The renderer checks the nodes. */
export const isTemplate = (value: unknown): value is TemplateValue => typeof value === 'string' || isRecord(value);

/** Whether a line is a list of frames rather than one template. */
const isFrames = (line: LineValue): line is readonly TemplateValue[] => Array.isArray(line);

/** Whether a value is a line: a template, or a list of at least one. */
export const isLine = (value: unknown): value is LineValue =>
    isTemplate(value) || (Array.isArray(value) && value.length > 0 && value.every(isTemplate));

/** Whether a value is a count: a whole number in range, or a template string. */
const isCount = (value: unknown): value is CountValue =>
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT);

/** Whether a value is a whole number of ticks, 1 or more. */
const isTicks = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * Reads the config file's value. A field of the wrong shape is left out and named in `problems`,
 * so a typo in one field does not take the others down.
 * @param value - The parsed file, or undefined when there is none.
 */
export const readConfig = (value: unknown): Config => {
    const problems: string[] = [];
    const config: Config = {
        interval: DEFAULT_INTERVAL,
        frameInterval: DEFAULT_FRAME_INTERVAL,
        motd: undefined,
        levelName: undefined,
        onlinePlayers: undefined,
        maxPlayers: undefined,
        problems
    };
    if (value === undefined) return config;
    if (!isRecord(value)) {
        problems.push('the file is not a JSON object');
        return config;
    }
    for (const key of ['interval', 'frameInterval'] as const) {
        const ticks = value[key];
        if (ticks === undefined) continue;
        if (isTicks(ticks)) config[key] = ticks;
        else problems.push(`\`${key}\` is not a whole number of ticks, 1 or more`);
    }
    for (const key of LINES) {
        const line = value[key];
        if (line === undefined) continue;
        if (isLine(line)) config[key] = line;
        else problems.push(`\`${key}\` is not a template or a list of templates`);
    }
    for (const key of COUNTS) {
        const count = value[key];
        if (count === undefined) continue;
        if (isCount(count)) config[key] = count;
        else problems.push(`\`${key}\` is not a whole number from 0 to ${MAX_COUNT} or a template`);
    }
    return config;
};

/**
 * The file to write with a new MOTD, keeping whatever else the owner put in it.
 * @param raw - The file as it is now.
 * @param motd - The new MOTD, or undefined to take it out of the file.
 * @returns The file's new value.
 */
export const withMotd = (raw: unknown, motd: LineValue | undefined): Record<string, unknown> => {
    const file: Record<string, unknown> = { ...(isRecord(raw) ? raw : {}) };
    delete file.motd;
    return motd === undefined ? file : { ...file, motd };
};

/**
 * A line as one template: a template as it is, and a list as an `animate` node whose frames each
 * show for `frameInterval` ticks. A shorthand frame becomes its parsed nodes.
 * @param line - The line the config holds.
 * @param frameInterval - Ticks each frame shows for.
 * @param parse - Parses shorthand into a template, as `placeholders.parse` does.
 */
export const lineTemplate = (
    line: LineValue,
    frameInterval: number,
    parse: (shorthand: string) => Template
): TemplateValue => {
    if (!isFrames(line)) return line;
    const frames: (readonly TemplateNode[])[] = line.map((frame) =>
        typeof frame === 'string' ? parse(frame).rawtext : frame.rawtext
    );
    return { rawtext: [{ animate: { interval: frameInterval, frames } }] };
};

/**
 * A count a template rendered to, or undefined when the text is not a whole number in range.
 * @param text - The rendered text, which may carry spaces around the number.
 */
export const countOf = (text: string): number | undefined => {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return undefined;
    const count = Number(trimmed);
    return count <= MAX_COUNT ? count : undefined;
};

/**
 * A rendered line as the server list takes it: a `;` the Bedrock ping cannot carry becomes `:`.
 * @param text - The rendered text.
 */
export const lineOf = (text: string): string => text.replaceAll(';', ':');
