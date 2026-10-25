import type { LogLevel } from '@jsprismarine/logger';

/**
 * Version of the message schema. Both sides stamp it on every message as `v`, and the type
 * guards reject messages from another version so a mismatched host and server fail loudly
 * instead of misreading each other.
 */
export const PROTOCOL_VERSION = 1;

interface Envelope<T extends string> {
    type: T;
    v: typeof PROTOCOL_VERSION;
}

/**
 * One log record as the server forwards it to the console.
 *
 * `seq` increases by one per record so the console can detect a gap even when a `log.dropped`
 * message is itself lost. `at` is epoch milliseconds so the console formats the time for its
 * own zone. `formatted` is the ANSI line the logger would have printed itself.
 */
export interface LogEntry {
    seq: number;
    level: LogLevel;
    namespace: string;
    at: number;
    message: string;
    formatted: string;
}

/** Server lifecycle states reported over the link. `stopped` and `crashed` come from the child's exit, not a message. */
export type LifecycleState = 'starting' | 'running' | 'stopping';

/** Messages the server sends to the console. */
export type ServerMessage =
    | (Envelope<'hello'> & { serverVersion: string; pid: number })
    | (Envelope<'log'> & LogEntry)
    | (Envelope<'log.dropped'> & { count: number })
    | (Envelope<'status'> & {
          tps: number;
          tickMs: number;
          players: number;
          maxPlayers: number;
          rssBytes: number;
          uptimeMs: number;
      })
    | (Envelope<'lifecycle'> & { state: LifecycleState })
    | (Envelope<'command.result'> & { id: string; ok: boolean; error?: string })
    | (Envelope<'complete.result'> & { id: string; completions: readonly string[]; replace: string });

/** Messages the console sends to the server. */
export type ConsoleMessage =
    | (Envelope<'command'> & { id: string; line: string })
    | (Envelope<'complete'> & { id: string; line: string; cursor: number })
    | Envelope<'shutdown'>
    | (Envelope<'subscribe'> & { level: LogLevel });

/** The `type` of a {@link ServerMessage}. */
export type ServerMessageType = ServerMessage['type'];

/** The `type` of a {@link ConsoleMessage}. */
export type ConsoleMessageType = ConsoleMessage['type'];

/** States of the host's supervisor, which owns the server child process. */
export type SupervisorState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed' | 'restarting' | 'waiting';

/**
 * Events the host raises about the server child. They never cross the IPC channel; the host
 * produces them from the child's exit status, the file watcher, and the child's stdio pipes,
 * and the console renders them as status and toasts rather than log lines.
 */
export type SupervisorEvent =
    | {
          type: 'supervisor.state';
          state: SupervisorState;
          code?: number | null;
          signal?: string | null;
          generation: number;
      }
    | { type: 'supervisor.watching'; root: string }
    | { type: 'supervisor.changed'; path: string }
    | { type: 'supervisor.generating'; ok?: boolean }
    | { type: 'supervisor.output'; stream: 'stdout' | 'stderr'; text: string };

type FieldKind = 'string' | 'number' | 'boolean' | 'array';

type KindOf<T> = T extends string
    ? 'string'
    : T extends number
      ? 'number'
      : T extends boolean
        ? 'boolean'
        : T extends readonly unknown[]
          ? 'array'
          : never;

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];

/**
 * The runtime check table for one message family: every message type maps to the `typeof`
 * (or array) kind of each of its required fields. Optional fields such as `error` are not
 * checked. `satisfies` against this type keeps the table in step with the message union: a
 * missing or extra type or field is a compile error.
 */
type FieldTable<Message extends Envelope<string>> = {
    readonly [M in Message as M['type']]: {
        readonly [K in Exclude<RequiredKeys<M>, keyof Envelope<string>>]: KindOf<M[K]>;
    };
};

const SERVER_FIELDS = {
    hello: { serverVersion: 'string', pid: 'number' },
    log: { seq: 'number', level: 'string', namespace: 'string', at: 'number', message: 'string', formatted: 'string' },
    'log.dropped': { count: 'number' },
    status: {
        tps: 'number',
        tickMs: 'number',
        players: 'number',
        maxPlayers: 'number',
        rssBytes: 'number',
        uptimeMs: 'number'
    },
    lifecycle: { state: 'string' },
    'command.result': { id: 'string', ok: 'boolean' },
    'complete.result': { id: 'string', completions: 'array', replace: 'string' }
} as const satisfies FieldTable<ServerMessage>;

const CONSOLE_FIELDS = {
    command: { id: 'string', line: 'string' },
    complete: { id: 'string', line: 'string', cursor: 'number' },
    shutdown: {},
    subscribe: { level: 'string' }
} as const satisfies FieldTable<ConsoleMessage>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasKind = (value: unknown, kind: FieldKind): boolean =>
    kind === 'array' ? Array.isArray(value) : typeof value === kind;

const matchesTable = (value: unknown, table: Record<string, Record<string, FieldKind>>): boolean => {
    if (!isRecord(value) || value.v !== PROTOCOL_VERSION || typeof value.type !== 'string') return false;
    const fields = Object.hasOwn(table, value.type) ? table[value.type] : undefined;
    if (fields === undefined) return false;
    return Object.entries(fields).every(([key, kind]) => hasKind(value[key], kind));
};

/**
 * Whether a decoded JSON value is a {@link ServerMessage} of this protocol version with its
 * required fields present and of the right primitive kind.
 */
export function isServerMessage(value: unknown): value is ServerMessage {
    return matchesTable(value, SERVER_FIELDS);
}

/**
 * Whether a decoded JSON value is a {@link ConsoleMessage} of this protocol version with its
 * required fields present and of the right primitive kind.
 */
export function isConsoleMessage(value: unknown): value is ConsoleMessage {
    return matchesTable(value, CONSOLE_FIELDS);
}
