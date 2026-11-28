/**
 * An exchange: what a server sends a client in answer to one thing the client does, recorded so
 * that the same steps can run against the pinned Bedrock Dedicated Server of each protocol and
 * against JSPrismarine, and the two compared
 * ([the verification plan](../../../../docs/plans/bedrock-version-verification.md)).
 *
 * A scenario says what the client does and which of the server's packets it is about. The capture
 * pass drives a client through it against a pinned server and writes what that server sent; the
 * replay drives the same scenario against JSPrismarine and compares.
 */
import { ClientErrors } from '@jsprismarine/errors/client';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type Client from '../Client';
import type ClientWorld from '../ClientWorld';
import type { DecodedPacket } from '../net/ClientPacketRegistry';

/** What a scenario's steps can do. A capture and a replay each implement it for their server. */
export interface ExchangeDriver {
    /** The client, joined and spawned. */
    readonly client: Client;
    /** What the client knows from the packets it was sent. */
    readonly world: ClientWorld;
    /** The name the client joined with, which a command names the player by. */
    readonly name: string;
    /** Runs a command at the server's console and waits for it to be answered. */
    command(line: string): Promise<void>;
    /** Lets `ticks` server ticks pass, reporting the client's input each one, as a client does. */
    wait(ticks: number): Promise<void>;
    /**
     * Waits a tick at a time until `condition` holds.
     * @throws Error naming `what` when it never does.
     */
    until(condition: () => boolean, what: string): Promise<void>;
    /** Starts recording the packets the scenario is about. Each scenario calls it once. */
    record(): void;
}

/** One exchange the client drives a server through. */
export interface ExchangeScenario {
    /** The name a capture is filed under and an `@bdsSee` tag names. */
    readonly id: string;
    /** What the scenario does, for the dashboard. */
    readonly description: string;
    /**
     * The packets the scenario is about, by name, and for each the fields compared, as paths into
     * its payload: `containerType`, `position.x` or `items.length`. A field a server fills with
     * something only it decides, such as a runtime id or a tick, is left out.
     */
    readonly subjects: Readonly<Record<string, readonly string[]>>;
    /** The client's steps. It calls `driver.record()` before the step whose answer it is about. */
    run(driver: ExchangeDriver): Promise<void>;
    /** How many ticks to keep recording after the steps, for answers that come late. */
    readonly settleTicks: number;
}

/** One packet a server sent, as an exchange compares it. */
export interface ExchangedPacket {
    readonly name: string;
    readonly fields: Readonly<Record<string, unknown>>;
}

/** What `dump:bedrock --pass exchanges` writes for one scenario at one protocol. */
export interface ExchangeCapture {
    readonly scenario: string;
    readonly protocolVersion: number;
    /** The server build that sent it, such as `1.26.60.6`. */
    readonly server: string;
    readonly packets: readonly ExchangedPacket[];
}

/** A value as a capture file holds it: JSON, with a bigint as its digits and an `n`. */
const plain = (value: unknown): unknown => {
    if (typeof value === 'bigint') return `${value}n`;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(plain);
    // A vector or a block position read through its getters, as both editions' models expose them.
    if ('getX' in value && 'getY' in value && 'getZ' in value) {
        const { getX, getY, getZ } = value;
        if (typeof getX === 'function' && typeof getY === 'function' && typeof getZ === 'function') {
            return { x: getX.call(value), y: getY.call(value), z: getZ.call(value) };
        }
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, plain(entry)]));
};

/** The payload a packet decoded to: its packet data, or its own fields for a packet that keeps them. */
const payloadOf = (packet: NetworkPacket): unknown => packet.getPacketData() ?? packet;

/** The value at `path` in `payload`, where a segment `length` reads an array's length. */
const valueAt = (payload: unknown, path: string): unknown => {
    let value = payload;
    for (const segment of path.split('.')) {
        if (value === null || value === undefined) return undefined;
        if (segment === 'length' && Array.isArray(value)) return value.length;
        if (typeof value !== 'object') return undefined;
        value = Reflect.get(value, segment);
    }
    return value;
};

/**
 * The packet as a scenario compares it, or undefined for one the scenario is not about.
 * @param scenario - The scenario.
 * @param packet - A packet the server sent.
 */
export const exchangedPacketOf = (scenario: ExchangeScenario, packet: NetworkPacket): ExchangedPacket | undefined => {
    const name = packet.getName();
    const fields = scenario.subjects[name];
    if (fields === undefined) return undefined;
    const payload = payloadOf(packet);
    return { name, fields: Object.fromEntries(fields.map((field) => [field, plain(valueAt(payload, field))])) };
};

/**
 * Runs a scenario and returns the packets it is about, from the step it records on to the end of
 * its settle ticks.
 * @param scenario - The scenario.
 * @param driver - The server's side of the steps; its `record` is replaced by one that starts this recording.
 */
export const runExchange = async (scenario: ExchangeScenario, driver: ExchangeDriver): Promise<ExchangedPacket[]> => {
    // A packet the client cannot decode never reaches a listener, so it would be missing from the
    // capture and the replay alike and the two would agree that it was never sent.
    const undecoded = Object.keys(scenario.subjects).filter((name) => !driver.client.getRegistry().decodesNamed(name));
    if (undecoded.length > 0) {
        throw new ClientErrors.ExchangeSubjectNotDecoded({ scenario: scenario.id, packets: undecoded.join(', ') });
    }
    const recorded: ExchangedPacket[] = [];
    let recording = false;
    const listener = ({ packet }: DecodedPacket): void => {
        if (!recording) return;
        const exchanged = exchangedPacketOf(scenario, packet);
        if (exchanged !== undefined) recorded.push(exchanged);
    };
    driver.client.on('packet', listener);
    try {
        // Each operation forwarded, so a driver whose methods live on a prototype keeps them.
        await scenario.run({
            client: driver.client,
            world: driver.world,
            name: driver.name,
            command: (line) => driver.command(line),
            wait: (ticks) => driver.wait(ticks),
            until: (condition, what) => driver.until(condition, what),
            record: () => {
                recording = true;
            }
        });
        await driver.wait(scenario.settleTicks);
    } finally {
        driver.client.off('packet', listener);
    }
    return recorded;
};

/**
 * Every way a replay differs from a capture, empty when it sent the same packets with the same
 * fields in the same order.
 *
 * The two lists are aligned by packet name first, on their longest common run, so one extra or
 * missing packet reads as that one difference rather than as every packet after it being
 * another. Each aligned pair then compares field by field.
 * @param capture - What the pinned server sent.
 * @param replay - What JSPrismarine sent.
 * @returns One line for each difference, in the order the packets were sent, fit for a parity row.
 */
export const exchangeDifferences = (
    capture: readonly ExchangedPacket[],
    replay: readonly ExchangedPacket[]
): string[] => {
    // shared(i, j): how many packets capture[i..] and replay[j..] have in common, in order, by
    // name.
    const common = Array.from({ length: capture.length + 1 }, () => new Array<number>(replay.length + 1).fill(0));
    const shared = (i: number, j: number): number => common[i]?.[j] ?? 0;
    for (let i = capture.length - 1; i >= 0; i--) {
        const row = common[i] ?? [];
        for (let j = replay.length - 1; j >= 0; j--) {
            row[j] =
                capture[i]?.name === replay[j]?.name
                    ? shared(i + 1, j + 1) + 1
                    : Math.max(shared(i + 1, j), shared(i, j + 1));
        }
    }
    const differences: string[] = [];
    let i = 0;
    let j = 0;
    while (i < capture.length || j < replay.length) {
        const expected = capture[i];
        const actual = replay[j];
        if (expected !== undefined && actual !== undefined && expected.name === actual.name) {
            for (const [field, value] of Object.entries(expected.fields)) {
                const got = actual.fields[field];
                if (JSON.stringify(got) !== JSON.stringify(value)) {
                    differences.push(
                        `${expected.name}'s ${field} is ${JSON.stringify(got)} where BDS sends ${JSON.stringify(value)}`
                    );
                }
            }
            i++;
            j++;
        } else if (actual !== undefined && (expected === undefined || shared(i, j + 1) >= shared(i + 1, j))) {
            differences.push(`packet ${j + 1} is an extra ${actual.name}`);
            j++;
        } else if (expected !== undefined) {
            differences.push(`BDS's packet ${i + 1}, ${expected.name}, is never sent`);
            i++;
        }
    }
    return differences;
};
