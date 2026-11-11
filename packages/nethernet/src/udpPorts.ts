import { isIPv4, isIPv6 } from 'node:net';

/** An inclusive range of UDP ports. */
export interface PortRange {
    readonly start: number;
    readonly end: number;
}

/** A NAT or port-forwarding mapping: clients reach `internal` through `external`. */
export interface PortMapping {
    readonly external: PortRange;
    readonly internal: PortRange;
}

/** What `server-udp-ports` and `server-public-ip` say together. */
export interface UdpPorts {
    /** The one continuous range of local ports, or undefined when the setting is unset or empty. */
    readonly local?: PortRange;
    /** Mappings to advertise in answers, in the order they were written. */
    readonly mappings: readonly PortMapping[];
    /** The address to advertise, from `server-public-ip` or a deprecated IP prefix. */
    readonly publicIp?: string;
    /** What the setting does that is deprecated, one sentence each, for the log. */
    readonly warnings: readonly string[];
}

/** Bedrock Dedicated Server's message for a port that is not one. */
const INVALID_PORT = 'Invalid Port. Port must be in the range [ 1, 65535 ]';

/** Bedrock Dedicated Server's message for an address that is not a raw IP literal. */
const NOT_AN_IP =
    'expected an IPv4 literal, raw or [bracketed] IPv6 literal, or empty; do not include a port or hostname.';

/** Thrown for a setting Bedrock Dedicated Server 1.26.70.24 refuses, with its message. */
export class UdpPortsError extends Error {
    public override readonly name = 'UdpPortsError';
}

const fail = (message: string): never => {
    throw new UdpPortsError(`server-udp-ports: ${message}`);
};

/** A port, or the setting's invalid-port error. */
const portOf = (text: string): number => {
    if (!/^\d{1,5}$/.test(text)) fail(INVALID_PORT);
    const port = Number(text);
    if (port < 1 || port > 65_535) fail(INVALID_PORT);
    return port;
};

/** One port or `start-end`, refused when reversed. */
const rangeOf = (text: string): PortRange => {
    const dash = text.indexOf('-');
    if (dash < 0) {
        const port = portOf(text);
        return { start: port, end: port };
    }
    const start = portOf(text.slice(0, dash));
    const end = portOf(text.slice(dash + 1));
    if (start > end) fail(`reversed port range '${text}'.`);
    return { start, end };
};

const sizeOf = ({ start, end }: PortRange): number => end - start + 1;

/**
 * An address as `server-public-ip` takes it: a raw IPv4, or a raw or bracketed IPv6.
 * @param text - The address.
 * @returns The address without brackets, or undefined when it is not one.
 */
const ipLiteral = (text: string): string | undefined => {
    const unbracketed = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
    if (unbracketed !== text && isIPv6(unbracketed)) return unbracketed;
    if (unbracketed === text && (isIPv4(text) || isIPv6(text))) return text;
    return undefined;
};

/**
 * Reads `server-public-ip` as Bedrock Dedicated Server 1.26.70.24 does: empty, a raw IPv4, or a
 * raw or bracketed IPv6. A hostname or a port is an error.
 * @param setting - The setting.
 * @returns The address, or undefined when it is empty.
 * @throws {UdpPortsError} For anything else, with Bedrock Dedicated Server's message.
 */
export const parsePublicIp = (setting: string): string | undefined => {
    const text = setting.trim();
    if (text === '') return undefined;
    const address = ipLiteral(text);
    if (address === undefined) throw new UdpPortsError(`Invalid value '${text}' for server-public-ip: ${NOT_AN_IP}`);
    return address;
};

/**
 * Splits an entry into its IP prefix and the rest: `IP:public:local` with a raw IPv4, or
 * `[IPv6]:public:local`. An entry without one has two parts at most.
 */
const splitPrefix = (entry: string): { prefix?: string; ports: string } => {
    if (entry.startsWith('[')) {
        const close = entry.indexOf(']');
        if (close < 0 || entry[close + 1] !== ':') fail(NOT_AN_IP);
        const prefix = ipLiteral(entry.slice(0, close + 1));
        if (prefix === undefined) fail(NOT_AN_IP);
        return { prefix, ports: entry.slice(close + 2) };
    }
    const parts = entry.split(':');
    if (parts.length <= 2) return { ports: entry };
    const prefix = parts.length === 3 ? ipLiteral(parts[0]!) : undefined;
    if (prefix === undefined) fail(NOT_AN_IP);
    return { prefix, ports: parts.slice(1).join(':') };
};

/**
 * Reads `server-udp-ports` with `server-public-ip` as Bedrock Dedicated Server 1.26.70.24 does
 * (docs/research/bds-server-udp-ports.md):
 *
 * - Entries are separated by commas; spaces around them and empty entries are ignored, and a
 *   repeated entry is fine.
 * - Each is a port, `start-end`, or a `public:local` mapping of a port or a range onto one of the
 *   same length.
 * - The local ports of every entry must form one continuous range: adjacent and overlapping
 *   ranges merge, and a gap is an error.
 * - A deprecated `IP:public:local` or `[IPv6]:public:local` prefix still sets the public address,
 *   with a warning that names `server-public-ip`. Two different prefixes, or one that differs
 *   from `server-public-ip`, is an error.
 * @param setting - `server-udp-ports`; empty for unset.
 * @param publicIpSetting - `server-public-ip`; empty for unset.
 * @returns What the two say.
 * @throws {UdpPortsError} For a value Bedrock Dedicated Server refuses, with its message.
 */
export const parseUdpPorts = (setting: string, publicIpSetting = ''): UdpPorts => {
    const publicIp = parsePublicIp(publicIpSetting);
    const locals: PortRange[] = [];
    const mappings: PortMapping[] = [];
    let prefixIp: string | undefined;

    for (const entry of setting
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '')) {
        const { prefix, ports } = splitPrefix(entry);
        const colon = ports.indexOf(':');
        // A prefix needs both ports, even when they are the same.
        if (prefix !== undefined && colon < 0) fail(INVALID_PORT);
        if (prefix !== undefined) {
            if (prefixIp !== undefined && prefixIp !== prefix) {
                fail(`conflicting UDP IP prefixes '${prefixIp}' and '${prefix}'; only one public IP is supported.`);
            }
            prefixIp = prefix;
        }
        if (colon < 0) {
            locals.push(rangeOf(ports));
            continue;
        }
        const external = rangeOf(ports.slice(0, colon));
        const internal = rangeOf(ports.slice(colon + 1));
        if (sizeOf(external) !== sizeOf(internal)) fail(`entry '${entry}' has mismatched range lengths.`);
        mappings.push({ external, internal });
        locals.push(internal);
    }

    if (prefixIp !== undefined && publicIp !== undefined && prefixIp !== publicIp) {
        fail(
            `server-public-ip '${publicIp}' conflicts with UDP IP prefix '${prefixIp}'; configure only one public IP.`
        );
    }
    const warnings =
        prefixIp === undefined
            ? []
            : [
                  `IP prefixes in server-udp-ports are deprecated. Set server-public-ip=${prefixIp} and use port mappings without IP prefixes.`
              ];
    const advertised = publicIp ?? prefixIp;
    const base = {
        mappings,
        warnings,
        ...(advertised === undefined ? {} : { publicIp: advertised })
    };
    if (locals.length === 0) return base;

    const sorted = [...locals].sort((a, b) => a.start - b.start);
    const start = sorted[0]!.start;
    let end = sorted[0]!.end;
    for (const range of sorted.slice(1)) {
        if (range.start > end + 1) {
            fail('disjoint UDP port ranges are not supported; configure one continuous internal port range.');
        }
        end = Math.max(end, range.end);
    }
    return { ...base, local: { start, end } };
};

/** A server-reflexive candidate's type preference, the top byte of its priority (RFC 8445 section 5.1.2.1). */
const REFLEXIVE_PREFERENCE = 100;

/**
 * The answer with a server-reflexive candidate after each host candidate that clients outside
 * the network reach another way, as Bedrock Dedicated Server 1.26.70.24 answers: for a host on a
 * mapped local port, the public port it maps to; at the public address when there is one and the
 * host is of its family, else at the host's own address. With a public address and no mapping for
 * the port, the public port is the local one. A host of the other family than the public address
 * gets nothing added, and its related address and port name the host.
 * @param answer - The SDP answer, with its candidates.
 * @param mappings - The mappings to advertise.
 * @param publicIp - The public address, when there is one.
 * @returns The answer.
 */
export const withMappedCandidates = (answer: string, mappings: readonly PortMapping[], publicIp?: string): string => {
    if (mappings.length === 0 && publicIp === undefined) return answer;
    const publicFamily = publicIp === undefined ? undefined : isIPv4(publicIp) ? 4 : 6;
    const lines = answer.split(/\r?\n/);
    const output: string[] = [];
    for (const line of lines) {
        output.push(line);
        const candidate = /^a=candidate:(\S+) (\d+) (udp) (\d+) (\S+) (\d+) typ host(.*)$/i.exec(line);
        if (candidate === null) continue;
        const [, foundation, component, protocol, priority, address, portText, rest] = candidate;
        const port = Number(portText);
        const family = isIPv4(address!) ? 4 : 6;
        const mapping = mappings.find((entry) => port >= entry.internal.start && port <= entry.internal.end);
        const externalPort = mapping === undefined ? port : mapping.external.start + (port - mapping.internal.start);
        if (mapping === undefined && publicIp === undefined) continue;
        if (publicFamily !== undefined && publicFamily !== family) continue;
        // The host's local preference and component under a server-reflexive type preference.
        const reflexivePriority = (Number(priority) & 0x00ff_ffff) + REFLEXIVE_PREFERENCE * 0x0100_0000;
        output.push(
            `a=candidate:${foundation}m ${component} ${protocol} ${reflexivePriority} ${publicIp ?? address} ${externalPort} typ srflx raddr ${address} rport ${port}${rest}`
        );
    }
    return output.join('\r\n');
};
