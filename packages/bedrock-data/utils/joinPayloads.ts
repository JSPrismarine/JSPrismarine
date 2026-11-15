/**
 * Readers for the join packets the `packets` pass of `dump:bedrock` records under
 * `src/jsp/v<protocol>/wire/`, one payload per packet id, exactly as a Bedrock Dedicated Server
 * sent them.
 *
 * Three of those payloads are the tables `utils/build.js` publishes: `ItemRegistryPacket`
 * (`0xa2`) for each item's `Item Version` and `Item Component Data`, `CreativeContentPacket`
 * (`0x91`) for the creative menu, and `AvailableActorIdentifiersPacket` (`0x77`) for the actor
 * list. The server sends each of them to every joining client, and two captures of one server
 * are byte for byte the same.
 *
 * `@jsprismarine/protocol` decodes these packets too, but it depends on this package, and the
 * generator runs from the `prepare` hook before anything is built. So this reads the few
 * layouts it needs itself, and copies every NBT compound as the bytes it arrived as rather
 * than decoding and re-encoding it: a server writes them back to the wire verbatim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The packet ids the generator reads, as `src/jsp/v<protocol>/wire/` names their files. */
export const JOIN_PACKET_IDS = {
    availableActorIdentifiers: 0x77,
    creativeContent: 0x91,
    itemRegistry: 0xa2
} as const;

/** The captured payload of one packet id from a version's capture directory. */
export const readWirePayload = (captureDirectory: string, id: number): Buffer =>
    readFileSync(join(captureDirectory, 'wire', `0x${id.toString(16).padStart(2, '0')}.bin`));

const TAG_END = 0;
const TAG_COMPOUND = 10;

/**
 * Which NBT dialect a compound is written in. `network` is the one packets carry: varint
 * lengths and integers. `littleEndian` is fixed width, which an item stack's user data holds.
 */
type NbtFlavor = 'network' | 'littleEndian';

/** Reads one payload left to right. Every read advances the cursor past what it returned. */
class WireCursor {
    private at = 0;
    private readonly buffer: Buffer;

    public constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    /** Bytes the payload still holds. */
    public get remaining(): number {
        return this.buffer.byteLength - this.at;
    }

    public byte(): number {
        return this.buffer.readUInt8(this.take(1));
    }

    public unsignedShortLE(): number {
        return this.buffer.readUInt16LE(this.take(2));
    }

    public shortLE(): number {
        return this.buffer.readInt16LE(this.take(2));
    }

    public intLE(): number {
        return this.buffer.readInt32LE(this.take(4));
    }

    public varuint(): number {
        let value = 0;
        for (let shift = 0; shift < 35; shift += 7) {
            const byte = this.byte();
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) return value;
        }
        throw new Error('A varuint32 ran past five bytes');
    }

    /** A zigzag varint32. */
    public varint(): number {
        const raw = this.varuint();
        return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
    }

    /** A varuint length, then that many bytes. */
    public bytes(): Buffer {
        const length = this.varuint();
        const from = this.take(length);
        return this.buffer.subarray(from, from + length);
    }

    public string(): string {
        return this.bytes().toString('utf8');
    }

    /** One root NBT compound, type byte and name included, as the bytes it was written in. */
    public compound(flavor: NbtFlavor): Buffer {
        const from = this.at;
        const type = this.byte();
        if (type !== TAG_COMPOUND) throw new Error(`Expected an NBT compound, found tag type ${type}`);
        this.nbtName(flavor);
        this.skipPayload(TAG_COMPOUND, flavor);
        return this.buffer.subarray(from, this.at);
    }

    private take(bytes: number): number {
        const from = this.at;
        if (from + bytes > this.buffer.byteLength) {
            throw new Error(`A payload ended after ${this.buffer.byteLength} bytes with ${bytes} more expected`);
        }
        this.at += bytes;
        return from;
    }

    private nbtLength(flavor: NbtFlavor): number {
        return flavor === 'network' ? this.varint() : this.intLE();
    }

    private nbtName(flavor: NbtFlavor): string {
        if (flavor === 'network') return this.string();
        const length = this.unsignedShortLE();
        const from = this.take(length);
        return this.buffer.toString('utf8', from, from + length);
    }

    private skipPayload(type: number, flavor: NbtFlavor): void {
        const network = flavor === 'network';
        switch (type) {
            case 1:
                this.take(1);
                return;
            case 2:
                this.take(2);
                return;
            case 3:
                if (network) this.varint();
                else this.take(4);
                return;
            case 4:
                // A varint64 is at most ten bytes, each with the high bit set but the last.
                if (network) while ((this.byte() & 0x80) !== 0);
                else this.take(8);
                return;
            case 5:
                this.take(4);
                return;
            case 6:
                this.take(8);
                return;
            case 7:
                this.take(this.nbtLength(flavor));
                return;
            case 8:
                this.nbtName(flavor);
                return;
            case 9: {
                const elementType = this.byte();
                const length = this.nbtLength(flavor);
                for (let i = 0; i < length; i++) this.skipPayload(elementType, flavor);
                return;
            }
            case TAG_COMPOUND:
                for (let child = this.byte(); child !== TAG_END; child = this.byte()) {
                    this.nbtName(flavor);
                    this.skipPayload(child, flavor);
                }
                return;
            case 11:
            case 12: {
                const length = this.nbtLength(flavor);
                for (let i = 0; i < length; i++) this.skipPayload(type === 11 ? 3 : 4, flavor);
                return;
            }
            default:
                throw new Error(`A payload holds NBT tag type ${type}, which this reader does not know`);
        }
    }
}

/** Throws unless a reader consumed the whole payload, so a layout change fails loudly. */
const assertConsumed = (cursor: WireCursor, packet: string): void => {
    if (cursor.remaining !== 0) throw new Error(`${packet} has ${cursor.remaining} bytes after its last field`);
};

/** One entry of `ItemRegistryPacket`. */
export interface ItemRegistryEntry {
    name: string;
    runtimeId: number;
    componentBased: boolean;
    /** `Item Version`: 0 `Legacy`, 1 `DataDriven`, 2 `None`. */
    version: number;
    /** `Item Component Data`, the network NBT compound as the server sent it. */
    componentData: Buffer;
}

/**
 * Reads an `ItemRegistryPacket` payload: a varuint count, then per item its name, its id as a
 * little endian int16, the component flag, the version as a varint and the component data.
 */
export const readItemRegistry = (payload: Buffer): ItemRegistryEntry[] => {
    const cursor = new WireCursor(payload);
    const entries: ItemRegistryEntry[] = [];
    for (let count = cursor.varuint(); count > 0; count--) {
        entries.push({
            name: cursor.string(),
            runtimeId: cursor.shortLE(),
            componentBased: cursor.byte() !== 0,
            version: cursor.varint(),
            componentData: cursor.compound('network')
        });
    }
    assertConsumed(cursor, 'ItemRegistryPacket');
    return entries;
};

/** One item stack as the creative menu carries it, with no stack net id. */
export interface CreativeStack {
    runtimeId: number;
    count: number;
    meta: number;
    /** The hashed block runtime id the entry places, 0 when it places none. */
    blockRuntimeId: number;
    /** The stack's own NBT as a little endian compound, when its user data carries any. */
    nbt?: Buffer;
}

/** One heading of `CreativeContentPacket`. */
export interface CreativeGroupPayload {
    /** `Creative Category`, 1 through 5. */
    category: number;
    name: string;
    icon: CreativeStack;
}

/** One entry of `CreativeContentPacket`. */
export interface CreativeEntryPayload {
    /** The one-based `Creative Net Id`. */
    creativeNetId: number;
    item: CreativeStack;
    /** An index into the groups. */
    group: number;
}

/**
 * The NBT a stack's user data carries, if any.
 *
 * The user data opens with an int16: 0 for no NBT, or -1 followed by a version byte and a
 * little endian compound. The can-place-on and can-destroy lists and a shield's blocking tick
 * follow, and the creative menu carries nothing in them that the published catalog keeps.
 */
const userDataNbt = (userData: Buffer): Buffer | undefined => {
    if (userData.byteLength === 0) return undefined;
    const cursor = new WireCursor(userData);
    const marker = cursor.shortLE();
    if (marker === 0) return undefined;
    if (marker !== -1) throw new Error(`An item's user data opens with ${marker}, not a NBT marker`);
    const version = cursor.byte();
    if (version !== 1) throw new Error(`An item's user data is version ${version}, not 1`);
    return cursor.compound('littleEndian');
};

const readCreativeStack = (cursor: WireCursor): CreativeStack => {
    const runtimeId = cursor.varint();
    const count = cursor.unsignedShortLE();
    const meta = cursor.varuint();
    const blockRuntimeId = cursor.varint();
    const nbt = userDataNbt(cursor.bytes());
    return { runtimeId, count, meta, blockRuntimeId, ...(nbt === undefined ? {} : { nbt }) };
};

/**
 * Reads a `CreativeContentPacket` payload: the groups, each a category byte, a name and an icon
 * stack, then the entries, each a creative net id, a stack and a group index.
 */
export const readCreativeContent = (
    payload: Buffer
): { groups: CreativeGroupPayload[]; entries: CreativeEntryPayload[] } => {
    const cursor = new WireCursor(payload);
    const groups: CreativeGroupPayload[] = [];
    for (let count = cursor.varuint(); count > 0; count--) {
        groups.push({ category: cursor.byte(), name: cursor.string(), icon: readCreativeStack(cursor) });
    }
    const entries: CreativeEntryPayload[] = [];
    for (let count = cursor.varuint(); count > 0; count--) {
        entries.push({ creativeNetId: cursor.varuint(), item: readCreativeStack(cursor), group: cursor.varuint() });
    }
    assertConsumed(cursor, 'CreativeContentPacket');
    return { groups, entries };
};

/**
 * Checks an `AvailableActorIdentifiersPacket` payload is one network NBT compound and nothing
 * else. The server replays it verbatim, so the check is all the generator needs.
 */
export const assertActorIdentifiers = (payload: Buffer): Buffer => {
    const cursor = new WireCursor(payload);
    cursor.compound('network');
    assertConsumed(cursor, 'AvailableActorIdentifiersPacket');
    return payload;
};
