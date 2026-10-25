import type { LogEntry } from '@jsprismarine/console-protocol';

/** Child process output streams the host forwards as raw lines. */
export type RawStream = 'stdout' | 'stderr';

/**
 * One slot in the log ring buffer. Every record carries the `LogEntry` fields so the view can
 * treat them alike; `kind` says how to render it. Separators mark a server restart and carry the
 * reason in `message`, raw records are child stdout or stderr lines, and dropped records stand in
 * for lines the server discarded under back pressure.
 */
export type StoredRecord = LogEntry & { generation: number } & (
        | { kind: 'log' }
        | { kind: 'separator' }
        | { kind: 'raw'; stream: RawStream }
        | { kind: 'dropped'; count: number }
    );
