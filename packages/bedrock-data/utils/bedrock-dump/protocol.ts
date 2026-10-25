/**
 * The line protocol the dump pack and this job talk over.
 *
 * A behavior pack has no file system and no network. The only channel out of a running Bedrock
 * Dedicated Server is the content log, which the engine writes to stdout once
 * `content-log-console-output-enabled=true` is set. So every pack script writes one line per row
 * with `console.warn`, this module parses those lines back into tables, and nothing in between
 * has to know what a row means.
 *
 * A line is `DUMP <table> <json>`. The engine decorates the line with a timestamp and a
 * `[Scripting]` tag, so the parser looks for the prefix anywhere in the line rather than at its
 * start. Two table names are reserved: `begin` carries what the script saw of the engine before
 * any pass ran, and `end` carries the row count the script believes it wrote, which is how a run
 * cut short by the script watchdog is told apart from a complete one.
 */

/** Marks a content-log line as one of the dump pack's. The pack scripts repeat this literal. */
export const DUMP_PREFIX = 'DUMP ';

/** Table the pack writes once before any pass, describing the engine it is running on. */
export const BEGIN_TABLE = 'begin';

/** Table the pack writes once after the last pass, carrying the row count it wrote. */
export const END_TABLE = 'end';

/** One parsed content-log line. */
export interface DumpRow {
    /** Table the row belongs to, the first word after the prefix. */
    table: string;
    /** The row itself, parsed from the rest of the line. */
    value: unknown;
}

/**
 * Parses one line of server output.
 *
 * @returns The row, or undefined when the line is not a dump line or its JSON does not parse.
 */
export const parseDumpLine = (line: string): DumpRow | undefined => {
    const at = line.indexOf(DUMP_PREFIX);
    if (at < 0) return undefined;

    const body = line.slice(at + DUMP_PREFIX.length).trim();
    const space = body.indexOf(' ');
    if (space <= 0) return undefined;

    const table = body.slice(0, space);
    try {
        // The pack wrote this JSON, but it reaches us through a log file, so it is parsed as
        // untrusted text rather than trusted as a known shape.
        return { table, value: JSON.parse(body.slice(space + 1)) as unknown };
    } catch {
        return undefined;
    }
};

/** Every table one run of a pack script produced, with the rows in the order they were logged. */
export interface DumpTables {
    /** Table name to its rows. Tables the script wrote no rows for are absent. */
    tables: Map<string, unknown[]>;
    /** The single `begin` row, when the script got far enough to write one. */
    begin: unknown;
    /** The single `end` row, absent when the script did not finish. */
    end: unknown;
}

/**
 * Collects the dump lines out of a server's output. Lines that are not dump lines are ignored,
 * which is most of them.
 */
export const collectDumpTables = (lines: Iterable<string>): DumpTables => {
    const tables = new Map<string, unknown[]>();
    let begin: unknown;
    let end: unknown;

    for (const line of lines) {
        const row = parseDumpLine(line);
        if (row === undefined) continue;
        if (row.table === BEGIN_TABLE) {
            begin = row.value;
            continue;
        }
        if (row.table === END_TABLE) {
            end = row.value;
            continue;
        }
        const rows = tables.get(row.table);
        if (rows === undefined) tables.set(row.table, [row.value]);
        else rows.push(row.value);
    }

    return { tables, begin, end };
};

/** What the pack writes as its `end` row. */
export interface DumpSummary {
    /** Rows the script counted across every table, excluding `begin` and `end`. */
    rows: number;
    /** Rows the script could not produce, one per entry of the `errors` table. */
    errors: number;
}

/**
 * Checks that a run finished and wrote as many rows as it says it did.
 *
 * The script watchdog kills a pass that spends too long in one tick, and the engine then keeps
 * running with the pack half done. Without this check that is indistinguishable from a version
 * where a registry shrank.
 *
 * @throws Error when the `end` row is missing or the row counts disagree.
 */
export const assertComplete = (dumped: DumpTables): DumpSummary => {
    if (dumped.end === undefined) {
        throw new Error(
            'The dump pack never logged its `end` row. The script watchdog most likely killed a ' +
                'pass; raise `script-watchdog-hang-threshold` or split the pass.'
        );
    }
    // Parsed from the content log, so its shape is asserted here rather than trusted.
    const summary = dumped.end as Partial<DumpSummary>;
    if (typeof summary.rows !== 'number' || typeof summary.errors !== 'number') {
        throw new Error(`The dump pack's \`end\` row is not a summary: ${JSON.stringify(dumped.end)}`);
    }

    let counted = 0;
    for (const rows of dumped.tables.values()) counted += rows.length;
    if (counted !== summary.rows) {
        throw new Error(`The dump pack says it wrote ${summary.rows} rows, but ${counted} reached the log.`);
    }

    return { rows: summary.rows, errors: summary.errors };
};
