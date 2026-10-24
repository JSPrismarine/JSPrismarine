import BinaryStream from '@jsprismarine/binaryutils';
import InetAddress from '../utils/InetAddress';

/**
 * The `sin6_family` RakNet copies off a `sockaddr_in6` on the Windows build the Bedrock
 * client ships with. RakNet writes the struct raw and in host byte order, so the family is
 * little-endian while the port that follows it is already in network order.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/BitStream.h#L1142
 */
const AF_INET6_WINDOWS = 23;

const IPV6_BYTE_LENGTH = 16;

/**
 * Parses an IPv6 address in any textual form Node hands out, including `::` compression,
 * an IPv4 tail (`::ffff:192.0.2.1`) and a zone id, which is dropped because the scope goes
 * in its own field on the wire.
 */
const parseIPv6 = (text: string): Buffer => {
    const invalid = (): Error => new Error(`Invalid IPv6 address: ${text}`);

    let address = text.split('%', 1)[0]!;

    const lastColon = address.lastIndexOf(':');
    const tail = address.slice(lastColon + 1);
    if (tail.includes('.')) {
        const octets = parseIPv4(tail);
        if (octets === null) throw invalid();
        const high = ((octets[0]! << 8) | octets[1]!).toString(16);
        const low = ((octets[2]! << 8) | octets[3]!).toString(16);
        address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
    }

    const halves = address.split('::');
    if (halves.length > 2) throw invalid();
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - rest.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0)) throw invalid();

    const groups = [...head, ...new Array<string>(missing).fill('0'), ...rest];
    const bytes = Buffer.alloc(IPV6_BYTE_LENGTH);
    groups.forEach((group, index) => {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) throw invalid();
        bytes.writeUInt16BE(Number.parseInt(group, 16), index * 2);
    });

    return bytes;
};

/**
 * Formats 16 address bytes the way Node's `dgram` reports a remote address: lowercase hex,
 * the longest run of zero groups collapsed to `::` (RFC 5952), and an IPv4-mapped address
 * with its dotted tail.
 */
const formatIPv6 = (bytes: Buffer): string => {
    const groups: number[] = [];
    for (let offset = 0; offset < IPV6_BYTE_LENGTH; offset += 2) {
        groups.push(bytes.readUInt16BE(offset));
    }

    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
        return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    }

    let runStart = -1;
    let runLength = 0;
    for (let index = 0; index < groups.length;) {
        if (groups[index] !== 0) {
            index++;
            continue;
        }
        let end = index;
        while (end < groups.length && groups[end] === 0) end++;
        if (end - index > runLength) {
            runStart = index;
            runLength = end - index;
        }
        index = end;
    }

    const hex = (part: number[]): string => part.map((group) => group.toString(16)).join(':');
    if (runLength < 2) return hex(groups);
    return `${hex(groups.slice(0, runStart))}::${hex(groups.slice(runStart + runLength))}`;
};

/** Returns the four octets of a dotted IPv4 address, or null when the text is not one. */
const parseIPv4 = (text: string): number[] | null => {
    const octets = text.split('.');
    if (octets.length !== 4) return null;
    const values = octets.map((octet) => (/^\d{1,3}$/.test(octet) ? Number.parseInt(octet, 10) : Number.NaN));
    return values.every((value) => value <= 255) ? values : null;
};

/**
 * The base class for all packets.
 */
export default class Packet extends BinaryStream {
    private readonly id: number;

    /**
     * Create a new packet.
     */
    public constructor(id: number, buffer?: Buffer) {
        super(buffer);
        this.id = id;
    }

    /**
     * Get the packet ID.
     * @returns The packet's ID.
     */
    public getId(): number {
        return this.id;
    }

    public decode(): void {
        this.readByte();
        this.decodePayload();
    }

    protected decodePayload(): void {}

    public encode(): void {
        this.writeByte(this.getId());
        this.encodePayload();
    }

    protected encodePayload(): void {}

    /**
     * Reads a RakNet string: an unsigned 16 bit big-endian byte length, then the bytes.
     *
     * Unsigned to match {@link writeString}, which has always written the length with
     * `writeUnsignedShort`. Read signed, any string of 32768 bytes or more came back with a
     * negative length, and `read` then walked the cursor backwards over data it had already
     * consumed instead of failing.
     */
    public readString(): string {
        return this.read(this.readUnsignedShort()).toString('utf-8');
    }

    public writeString(v: string): void {
        const data = Buffer.from(v, 'utf-8');
        this.writeUnsignedShort(data.byteLength);
        this.write(data);
    }

    /**
     * Reads a RakNet `SystemAddress`.
     *
     * A version byte, then for IPv4 the four complemented octets and the port as an
     * unsigned big-endian short. Anything else is IPv6, which RakNet writes as the raw
     * `sockaddr_in6`: family, port, flow info, the 16 address bytes, then the scope id.
     * The port is unsigned because RakNet serializes it as `unsigned short`; read signed,
     * every ephemeral port from 32768 up came back negative.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/BitStream.h#L1494
     */
    public readAddress(): InetAddress {
        const version = this.readByte();
        if (version === 4) {
            const octets = this.read(4);
            const address = `${~octets[0]! & 0xff}.${~octets[1]! & 0xff}.${~octets[2]! & 0xff}.${~octets[3]! & 0xff}`;
            const port = this.readUnsignedShort();
            return new InetAddress(address, port, 4);
        }

        this.readUnsignedShortLE(); // sin6_family
        const port = this.readUnsignedShort();
        this.readUnsignedInt(); // sin6_flowinfo
        const address = formatIPv6(this.read(IPV6_BYTE_LENGTH));
        this.readUnsignedInt(); // sin6_scope_id
        return new InetAddress(address, port, 6);
    }

    /**
     * Writes a RakNet `SystemAddress`, the mirror of {@link readAddress}.
     *
     * The flow info and scope id of an IPv6 address are written as zero: Bedrock does the
     * same, and the peer has no use for a scope that only means something on our host.
     * @throws When the address text is not a valid address of its version.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/BitStream.h#L1142
     */
    public writeAddress(address: InetAddress): void {
        if (address.getVersion() === 6) {
            this.writeByte(6);
            this.writeUnsignedShortLE(AF_INET6_WINDOWS);
            this.writeUnsignedShort(address.getPort());
            this.writeUnsignedInt(0); // sin6_flowinfo
            this.write(parseIPv6(address.getAddress()));
            this.writeUnsignedInt(0); // sin6_scope_id
            return;
        }

        const octets = parseIPv4(address.getAddress());
        if (octets === null) {
            throw new Error(`Invalid IPv4 address: ${address.getAddress()}`);
        }

        this.writeByte(4);
        // Complemented so a NAT rewriting what looks like an address leaves it alone.
        for (const octet of octets) {
            this.writeByte(~octet & 0xff);
        }
        this.writeUnsignedShort(address.getPort());
    }
}
