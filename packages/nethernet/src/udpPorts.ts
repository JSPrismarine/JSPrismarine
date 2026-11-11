/** An inclusive range of UDP ports. */
export interface PortRange {
    readonly start: number;
    readonly end: number;
}

/** A NAT or port-forwarding mapping: clients reach `internal` through `external`. */
export interface PortMapping {
    /** The address clients connect to, or undefined to keep each candidate's own address. */
    readonly address?: string;
    readonly external: PortRange;
    readonly internal: PortRange;
}

/** What a `server-udp-ports` setting says. */
export interface UdpPorts {
    /** The local ports WebRTC may allocate, or undefined to leave it to the operating system. */
    readonly local?: PortRange;
    /** Mappings to advertise in answers, in the order they were written. */
    readonly mappings: readonly PortMapping[];
}

const PORT = '(\\d{1,5})';
const RANGE = `${PORT}(?:-${PORT})?`;
const LOCAL_ENTRY = new RegExp(`^${RANGE}$`);
const MAPPING_ENTRY = new RegExp(`^(?:(\\[[^\\]]+\\]|[^:\\[\\]]+):)?${RANGE}:${RANGE}$`);

const rangeOf = (entry: string, start: string | undefined, end: string | undefined): PortRange => {
    const range = { start: Number(start), end: Number(end ?? start) };
    if (range.start < 1 || range.end > 65_535 || range.start > range.end) {
        throw new Error(`server-udp-ports: ${entry} is not a range of ports between 1 and 65535`);
    }
    return range;
};

const sizeOf = ({ start, end }: PortRange): number => end - start + 1;

/**
 * Reads Bedrock Dedicated Server's `server-udp-ports` syntax: comma-separated entries, each either
 * `internal` or `start-end` (a local port or port range for WebRTC), or `[ip:]external[-external]:internal[-internal]`
 * (a mapping to advertise, its two sides the same length). An IPv6 address goes in brackets.
 * @param setting - The setting, or an empty string for none.
 * @throws {Error} For an entry in neither form, ports out of range, or mismatched mapping lengths;
 * and for more than one local range, which werift cannot allocate from.
 */
export const parseUdpPorts = (setting: string): UdpPorts => {
    const ranges: PortRange[] = [];
    const mappings: PortMapping[] = [];
    for (const entry of setting
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '')) {
        const local = LOCAL_ENTRY.exec(entry);
        if (local !== null) {
            ranges.push(rangeOf(entry, local[1], local[2]));
            continue;
        }
        const mapping = MAPPING_ENTRY.exec(entry);
        if (mapping === null) throw new Error(`server-udp-ports: ${entry} is neither a port range nor a mapping`);
        const external = rangeOf(entry, mapping[2], mapping[3]);
        const internal = rangeOf(entry, mapping[4], mapping[5]);
        if (sizeOf(external) !== sizeOf(internal)) {
            throw new Error(`server-udp-ports: ${entry} maps ${sizeOf(external)} ports onto ${sizeOf(internal)}`);
        }
        const address = mapping[1]?.replace(/^\[|\]$/g, '');
        mappings.push(address === undefined ? { external, internal } : { address, external, internal });
        ranges.push(internal);
    }

    if (ranges.length === 0) return { mappings };
    const start = Math.min(...ranges.map((range) => range.start));
    const end = Math.max(...ranges.map((range) => range.end));
    const covered = ranges.every((range) => range.start === start && range.end === end);
    if (!covered) {
        throw new Error('server-udp-ports: every local range must be the same one; werift allocates from one range');
    }
    return { local: { start, end }, mappings };
};

/**
 * The answer with a server-reflexive candidate added for every host candidate a mapping covers:
 * the external address (or the candidate's own) and the external port its internal port maps to.
 * That is how a client outside the network learns where to reach a server behind NAT.
 * @param answer - The SDP answer, with its candidates.
 * @param mappings - The mappings to advertise.
 */
export const withMappedCandidates = (answer: string, mappings: readonly PortMapping[]): string => {
    if (mappings.length === 0) return answer;
    const lines = answer.split(/\r?\n/);
    const output: string[] = [];
    for (const line of lines) {
        output.push(line);
        const candidate = /^a=candidate:(\S+) (\d+) udp (\d+) (\S+) (\d+) typ host/i.exec(line);
        if (candidate === null) continue;
        const [, foundation, component, priority, address, portText] = candidate;
        const port = Number(portText);
        for (const mapping of mappings) {
            if (port < mapping.internal.start || port > mapping.internal.end) continue;
            const externalPort = mapping.external.start + (port - mapping.internal.start);
            // Below the host candidate's priority, so a client on the same network still prefers it.
            const reflexivePriority = Math.max(0, Number(priority) - 1);
            output.push(
                `a=candidate:${foundation}m ${component} udp ${reflexivePriority} ${mapping.address ?? address} ${externalPort} typ srflx raddr ${address} rport ${port}`
            );
        }
    }
    return output.join('\r\n');
};
