/**
 * The record a scripting scenario produces, and the golden a Bedrock Dedicated Server run of it
 * is checked in as.
 *
 * A scenario's scripts cannot write files, so they report what they observe on the content log,
 * over the line protocol the `bedrock-dump` packs already use (`DUMP <table> <json>`, parsed by
 * `parseDumpLine`). Two tables carry a scenario:
 *
 * - `DUMP record {"pack":"v2","seq":1,"tick":0,"event":"top-level"}` is one observation. `seq`
 *   counts the pack's own observations from 1, and `tick` is `system.currentTick` when the
 *   observation was made. A `value` field holds what a call returned and an `error` field what
 *   it threw, as `String(error)`.
 * - `DUMP end {"pack":"v2","records":12}` says the pack is done and how many observations it
 *   made, so a lost line fails the capture instead of shortening the golden.
 *
 * An observation never holds a wall-clock time. Everything in it is decided by the engine's own
 * order and tick count, so a record taken on any machine is the same record.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { parseDumpLine } from '../../../bedrock-data/utils/bedrock-dump/protocol.ts';
import { isFamily } from '../families.ts';
import type { Family } from '../families.ts';
import { isRecord } from '../isRecord.ts';

/** A JSON value a script can report as what a call returned. */
export type ObservedValue = string | number | boolean | null | readonly ObservedValue[] | ObservedObject;

/** A JSON object a script reported. */
export interface ObservedObject {
    readonly [key: string]: ObservedValue;
}

/** One thing a scenario script saw, in the order the engine let it see it. */
export interface Observation {
    /** The scenario pack that made the observation: its directory name. */
    readonly pack: string;
    /** The pack's own count of its observations, from 1. */
    readonly seq: number;
    /** `system.currentTick` when the observation was made. */
    readonly tick: number;
    /** What happened, such as `top-level` or `world.afterEvents.worldLoad`. */
    readonly event: string;
    /** What the observed call returned, when the observation is of a call that returned. */
    readonly value?: ObservedValue;
    /** `String(error)` of what the observed call threw, when it threw. */
    readonly error?: string;
}

/** Everything a scenario's scripts observed, in log order across all of its packs. */
export interface ScenarioRecord {
    readonly observations: readonly Observation[];
}

/** The version of {@link ScenarioGolden}'s shape. A reader refuses any other. */
export const SCENARIO_GOLDEN_FORMAT = 1;

/** A scenario's record as the pinned Bedrock Dedicated Server produced it, checked in as a golden. */
export interface ScenarioGolden extends ScenarioRecord {
    readonly $comment: readonly string[];
    readonly format: typeof SCENARIO_GOLDEN_FORMAT;
    /** The parity family the scenario belongs to. */
    readonly family: Family;
    /** The scenario id, which is also the golden's file name. */
    readonly scenario: string;
    /** The server that produced the record. */
    readonly server: {
        readonly protocolVersion: number;
        readonly serverVersion: string;
    };
}

/** The directory the scenario goldens live in. */
export const SCENARIO_GOLDEN_DIRECTORY = join(import.meta.dirname, '..', '..', 'goldens', 'scripting');

/** Where a scenario's golden is. */
export const scenarioGoldenPath = (scenario: string): string => join(SCENARIO_GOLDEN_DIRECTORY, `${scenario}.json`);

/** The dump table an observation line uses. */
export const RECORD_TABLE = 'record';

/** The dump table a pack's last line uses. */
export const END_TABLE = 'end';

const isObservedValue = (value: unknown): value is ObservedValue =>
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isObservedValue)) ||
    (isRecord(value) && !Array.isArray(value) && Object.values(value).every(isObservedValue));

const OBSERVATION_FIELDS = new Set(['pack', 'seq', 'tick', 'event', 'value', 'error']);

/** Whether a parsed value is an {@link Observation}, with no field the format does not define. */
export const isObservation = (value: unknown): value is Observation =>
    isRecord(value) &&
    Object.keys(value).every((key) => OBSERVATION_FIELDS.has(key)) &&
    typeof value.pack === 'string' &&
    Number.isInteger(value.seq) &&
    Number.isInteger(value.tick) &&
    typeof value.event === 'string' &&
    (value.value === undefined || isObservedValue(value.value)) &&
    (value.error === undefined || typeof value.error === 'string');

/**
 * Reads a scenario's record off a server's output.
 *
 * @param lines - Every line the server printed, in order.
 * @param packs - The scenario's pack names. Each has to end, and no other pack may report.
 * @returns The observations in the order the server printed them.
 * @throws Error when a record line is malformed, a pack never ended, or a pack's `seq` values
 *   are not 1 to the count its end line gives.
 */
export const readScenarioRecord = (lines: Iterable<string>, packs: readonly string[]): ScenarioRecord => {
    const observations: Observation[] = [];
    const ended = new Map<string, number>();

    for (const line of lines) {
        const row = parseDumpLine(line);
        if (row === undefined) {
            // parseDumpLine drops a line whose JSON does not parse, and a lost observation would
            // shorten the golden without a word, so a record line it refused fails the capture.
            if (line.includes(`DUMP ${RECORD_TABLE} `)) throw new Error(`A record line did not parse: ${line}`);
            continue;
        }
        if (row.table === RECORD_TABLE) {
            if (!isObservation(row.value)) throw new Error(`A record line is not an observation: ${line}`);
            if (!packs.includes(row.value.pack)) throw new Error(`Pack ${row.value.pack} is not in the scenario.`);
            observations.push(row.value);
        } else if (row.table === END_TABLE) {
            const end = row.value;
            if (!isRecord(end) || typeof end.pack !== 'string' || !Number.isInteger(end.records)) {
                throw new Error(`An end line is malformed: ${line}`);
            }
            ended.set(end.pack, Number(end.records));
        }
    }

    for (const pack of packs) {
        const count = ended.get(pack);
        if (count === undefined) throw new Error(`Pack ${pack} never wrote its end line.`);
        const seqs = observations.filter((observation) => observation.pack === pack).map(({ seq }) => seq);
        const expected = Array.from({ length: count }, (_, index) => index + 1);
        if (seqs.join(',') !== expected.join(',')) {
            throw new Error(`Pack ${pack} reported ${count} observations but the log holds seq [${seqs.join(', ')}].`);
        }
    }
    return { observations };
};

/**
 * Reads a scenario's golden.
 *
 * @returns The golden, or undefined when no capture has been checked in for the scenario.
 * @throws Error when the file is there but is not a golden of this format.
 */
export const readScenarioGolden = (scenario: string): ScenarioGolden | undefined => {
    const path = scenarioGoldenPath(scenario);
    if (!existsSync(path)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const refuse = (why: string): Error =>
        new Error(`${path} is not a format ${SCENARIO_GOLDEN_FORMAT} golden of scenario ${scenario}: ${why}.`);

    if (!isRecord(parsed)) throw refuse('it is not an object');
    const { $comment, family, server, observations } = parsed;
    if (parsed.format !== SCENARIO_GOLDEN_FORMAT) throw refuse(`its format is ${String(parsed.format)}`);
    if (parsed.scenario !== scenario) throw refuse(`it names scenario ${String(parsed.scenario)}`);
    if (!Array.isArray($comment) || !$comment.every((line) => typeof line === 'string')) {
        throw refuse('its $comment is not a list of lines');
    }
    if (typeof family !== 'string' || !isFamily(family)) throw refuse(`${String(family)} is not a declared family`);
    if (!isRecord(server) || !Number.isInteger(server.protocolVersion) || typeof server.serverVersion !== 'string') {
        throw refuse('its server is not a protocol version and a server version');
    }
    if (!Array.isArray(observations) || !observations.every(isObservation)) {
        throw refuse('an observation is malformed');
    }
    return {
        $comment,
        format: SCENARIO_GOLDEN_FORMAT,
        family,
        scenario,
        server: { protocolVersion: Number(server.protocolVersion), serverVersion: server.serverVersion },
        observations
    };
};

/** Renders a golden as the file the capture writes, with a stable key order and a final newline. */
export const renderScenarioGolden = (golden: ScenarioGolden): string => `${JSON.stringify(golden, undefined, 4)}\n`;

const describeObservation = (observation: Observation | undefined): string =>
    observation === undefined ? 'nothing' : JSON.stringify(observation);

/**
 * Compares a record with the golden's.
 *
 * @returns Undefined when the two hold the same observations in the same order, otherwise one
 *   sentence naming the first observation that differs and the counts on each side.
 */
export const diffScenarioRecords = (expected: ScenarioRecord, actual: ScenarioRecord): string | undefined => {
    const length = Math.max(expected.observations.length, actual.observations.length);
    for (let index = 0; index < length; index++) {
        const want = expected.observations[index];
        const got = actual.observations[index];
        if (isDeepStrictEqual(want, got)) continue;
        return (
            `observation ${index + 1} differs: BDS recorded ${describeObservation(want)}, ` +
            `JSPrismarine recorded ${describeObservation(got)} ` +
            `(${expected.observations.length} observations on BDS, ${actual.observations.length} on JSPrismarine)`
        );
    }
    return undefined;
};
