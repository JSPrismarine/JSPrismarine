/**
 * The messages of the protocol Mojang's Minecraft Bedrock Debugger for VS Code speaks
 * (`Mojang/minecraft-debugger`, MIT), which the extension took from koush's QuickJS debugger. The
 * shapes follow the extension's `src/protocol-events.ts` and `src/session.ts` at v1.61.0.
 */

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../isRecord';

/**
 * The protocol version the host offers. The extension echoes any version from 2 up to its own
 * `DEBUGGER_PROTOCOL_VERSION` (`src/protocol-events.ts`), and 11 is that constant in v1.61.0.
 */
export const DEBUGGER_PROTOCOL_VERSION = 11;

/** The port the extension and Bedrock Dedicated Server use when none is given. */
export const DEFAULT_DEBUGGER_PORT = 19144;

/** The level of a printed or notified message, as the extension's `LogLevel` numbers them. */
export const LogLevel = { verbose: 0, log: 1, warn: 2, error: 3 } as const;

/** One script pack the extension may debug: its name and the UUID of its script module. */
export interface DebuggerPlugin {
    readonly name: string;
    readonly module_uuid: string;
}

/**
 * One statistic of a `StatEvent2`, the extension's `StatDataModel` (`src/stats/stats-provider.ts`):
 * a value for this tick, or a group of named children.
 */
export interface DebuggerStat {
    readonly name: string;
    readonly should_aggregate: boolean;
    /** The values; the last one is this tick's. */
    readonly values?: readonly (number | string)[];
    readonly children?: readonly DebuggerStat[];
}

/**
 * A tab of the extension's diagnostics panel, the extension's `DiagnosticsTabDescriptor`
 * (`src/diagnostics-schema.ts`), with the fields Bedrock Dedicated Server (BDS) fills.
 */
export interface DiagnosticsTab {
    readonly name: string;
    readonly stat_group_id: string;
    readonly data_source: 'server' | 'client' | 'server_script';
    readonly display_type: string;
    readonly is_empty_tab: boolean;
    readonly y_label?: string;
    readonly tick_range?: number;
    readonly value_scalar?: number;
    readonly key_label?: string;
}

/**
 * The tabs protocol 2193's pinned BDS sends in its `SchemaEvent`, captured from its wire: two for a
 * client's frame timings and memory, which a dedicated server never fills, and the engine's
 * memory table, which the `scripting_engine` statistic fills.
 */
export const DIAGNOSTICS_TABS: readonly DiagnosticsTab[] = [
    {
        name: 'Client - Timings',
        stat_group_id: 'client_frame_timings',
        data_source: 'client',
        display_type: 'stacked_line_chart',
        is_empty_tab: false,
        y_label: 'Time (ms)',
        tick_range: 200,
        value_scalar: 1
    },
    {
        name: 'Client - Memory',
        stat_group_id: 'client_memory',
        data_source: 'client',
        display_type: 'stacked_line_chart',
        is_empty_tab: false,
        y_label: 'Memory (MB)',
        tick_range: 200,
        value_scalar: 0.000001
    },
    {
        name: 'Server - Scripting Engine',
        stat_group_id: 'scripting_engine',
        data_source: 'server',
        display_type: 'table',
        is_empty_tab: false,
        key_label: 'Stat'
    }
];

/** The events the host sends, each inside an `{ type: 'event', event }` envelope. */
export type DebuggerEvent =
    | {
          readonly type: 'ProtocolEvent';
          readonly version: number;
          readonly plugins: readonly DebuggerPlugin[];
          readonly require_passcode?: boolean;
      }
    | { readonly type: 'StoppedEvent'; readonly reason: string; readonly thread: number }
    | { readonly type: 'ThreadEvent'; readonly reason: 'new' | 'exited'; readonly thread: number }
    | { readonly type: 'PrintEvent'; readonly message: string; readonly logLevel: number }
    | { readonly type: 'NotificationEvent'; readonly message: string; readonly logLevel: number }
    | { readonly type: 'StatEvent2'; readonly tick: number; readonly stats: readonly DebuggerStat[] }
    | { readonly type: 'SchemaEvent'; readonly descriptors: readonly DiagnosticsTab[] }
    /** A CPU profile, `.cpuprofile` JSON in base64, for the extension to write under `capture_base_path`. */
    | { readonly type: 'ProfilerCapture'; readonly capture_base_path: string; readonly capture_data: string }
    /** The host ends the session; BDS sends it just before it closes the connection. */
    | { readonly type: 'terminated' };

/**
 * A message the host sends. A response answers a `request` by its `request_seq`, with a body or
 * an error. `debuggee-response` answers a `debugger-request`; the extension reads it from the
 * envelope's `event` field (`receiveDebugeeMessage` in `src/session.ts`).
 */
export type HostMessage =
    | { readonly type: 'event'; readonly event: DebuggerEvent }
    | { readonly type: 'response'; readonly request_seq: number; readonly body?: unknown; readonly error?: string }
    | {
          readonly type: 'debuggee-response';
          readonly event: {
              readonly type: 'debuggee-response';
              readonly request_seq: number;
              readonly success: boolean;
              readonly response_message?: string;
          };
      };

/** A Debug Adapter Protocol request the extension forwards: `stackTrace`, `next` and the rest. */
export interface ForwardedRequest {
    readonly request_seq: number;
    readonly command: string;
    readonly args: Record<string, unknown>;
}

/** A message the extension sends, parsed into what the host acts on. */
export type ExtensionMessage =
    | {
          readonly type: 'protocol';
          readonly version: number;
          readonly targetModuleUuid: string | undefined;
          readonly passcode: string | undefined;
      }
    | { readonly type: 'request'; readonly request: ForwardedRequest }
    | { readonly type: 'breakpoints'; readonly path: string; readonly lines: readonly number[] }
    | { readonly type: 'stopOnException'; readonly stop: boolean }
    | { readonly type: 'resume' }
    | { readonly type: 'minecraftCommand'; readonly command: string; readonly dimension: string }
    | { readonly type: 'debugger-request'; readonly request_seq: number; readonly request: string }
    | { readonly type: 'startProfiler' }
    | { readonly type: 'stopProfiler'; readonly capturesPath: string }
    | { readonly type: 'other'; readonly name: string };

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The lines of a breakpoint list: numbers since protocol 6, `SourceBreakpoint` objects before. */
const breakpointLines = (value: unknown): number[] =>
    Array.isArray(value)
        ? value.flatMap((entry) => {
              const line = isRecord(entry) ? entry.line : entry;
              return typeof line === 'number' && Number.isInteger(line) && line > 0 ? [line] : [];
          })
        : [];

/**
 * Reads one message from the extension. The shapes of protocol 8 and later are flat, and the
 * older ones nest their fields one level down (`src/protocol-events.ts`), so both are read.
 * @param message - A parsed JSON message.
 * @returns The message, or `other` for a type the host does not act on.
 * @throws {TypeError} When the message is not an object with a `type`.
 */
export const parseExtensionMessage = (message: unknown): ExtensionMessage => {
    if (!isRecord(message) || typeof message.type !== 'string') {
        throw new ScriptHostErrors.InvalidDebuggerMessage();
    }
    switch (message.type) {
        case 'protocol':
            return {
                type: 'protocol',
                version: typeof message.version === 'number' ? message.version : 0,
                targetModuleUuid: text(message.target_module_uuid),
                passcode: text(message.passcode)
            };
        case 'request': {
            const request = message.request;
            if (!isRecord(request) || typeof request.request_seq !== 'number' || typeof request.command !== 'string') {
                break;
            }
            return {
                type: 'request',
                request: {
                    request_seq: request.request_seq,
                    command: request.command,
                    args: isRecord(request.args) ? request.args : {}
                }
            };
        }
        case 'breakpoints': {
            // Before protocol 8 the path and the list sit in a `breakpoints` object.
            const body = isRecord(message.breakpoints) ? message.breakpoints : message;
            const path = text(body.path);
            if (path === undefined) break;
            return { type: 'breakpoints', path, lines: breakpointLines(body.breakpoints) };
        }
        case 'stopOnException':
            return { type: 'stopOnException', stop: message.stopOnException === true };
        case 'resume':
            return { type: 'resume' };
        case 'minecraftCommand': {
            const body = isRecord(message.command) ? message.command : message;
            const command = text(body.command);
            if (command === undefined) break;
            return { type: 'minecraftCommand', command, dimension: text(body.dimension_type) ?? 'overworld' };
        }
        case 'debugger-request': {
            const body = isRecord(message.request) ? message.request : message;
            if (typeof body.request_seq !== 'number') break;
            return { type: 'debugger-request', request_seq: body.request_seq, request: text(body.request) ?? '' };
        }
        case 'startProfiler':
            return { type: 'startProfiler' };
        case 'stopProfiler': {
            // Before protocol 8 the path sits in a `profiler` object.
            const body = isRecord(message.profiler) ? message.profiler : message;
            return { type: 'stopProfiler', capturesPath: text(body.captures_path) ?? '' };
        }
        default:
            break;
    }
    return { type: 'other', name: message.type };
};

/** Reads the lines of a `setBreakpoints` request, which protocol 6 and later send as a request. */
export const requestedBreakpointLines = (args: Record<string, unknown>): number[] => breakpointLines(args.breakpoints);
