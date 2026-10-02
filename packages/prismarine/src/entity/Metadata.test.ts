import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';
import { FlagType, MAX_AIR_TICKS, Metadata, MetadataFlag, MetadataWriter } from './Metadata';

describe('MetadataWriter', () => {
    it('should set and get property values correctly', () => {
        const metadata = new MetadataWriter();
        metadata.setLong(1, 123n);
        metadata.setShort(2, 456);
        metadata.setString(3, 'hello');
        metadata.setFloat(4, 3.14);

        expect(metadata.getPropertyValue(1)).toBe(123n);
        expect(metadata.getPropertyValue(2)).toBe(456);
        expect(metadata.getPropertyValue(3)).toBe('hello');
        expect(metadata.getPropertyValue(4)).toBe(3.14);
    });

    // The typed getters used to return the whole [type, value] pair the map stores, cast
    // through `any` so nothing complained. It only showed up once a value reached a
    // template literal and stringified: a player called HerryYT was rendered as
    // "4,HerryYT", the 4 being FlagType.STRING.
    describe('typed getters return the value, not the [type, value] pair', () => {
        it('getString gives back the string it was given', () => {
            const metadata = new MetadataWriter();
            metadata.setString(3, 'HerryYT');

            expect(metadata.getString(3)).toBe('HerryYT');
            expect(`<${metadata.getString(3)}>`).toBe('<HerryYT>');
            expect(metadata.getString(3)).not.toContain(String(FlagType.STRING));
        });

        it('getFloat gives back a number, usable in arithmetic', () => {
            const metadata = new MetadataWriter();
            metadata.setFloat(4, 2.5);

            expect(metadata.getFloat(4)).toBe(2.5);
            expect(metadata.getFloat(4) * 2).toBe(5);
        });

        it('nameTag reads back what setNameTag wrote', () => {
            // The path the player name actually takes: Player.getName() -> metadata.nameTag.
            const metadata = new Metadata();
            metadata.setNameTag('HerryYT');

            expect(metadata.nameTag).toBe('HerryYT');
        });

        it('answers with an empty string for a name that was never set', () => {
            expect(new MetadataWriter().getString(99)).toBe('');
        });
    });
});

describe('Metadata', () => {
    describe('breath', () => {
        it('starts with full lungs', () => {
            const metadata = new Metadata();

            expect(metadata.air).toBe(MAX_AIR_TICKS);
            expect(metadata.maxAir).toBe(MAX_AIR_TICKS);
        });

        // Air alone is not what the client draws the bubble bar from - it draws it for
        // anything not breathing, so an entity that never set the flag drowned on screen
        // while standing in a field.
        it('starts breathing', () => {
            expect(new Metadata().breathing).toBe(true);
        });

        it('can be told it is out of air, and back again', () => {
            const metadata = new Metadata();

            metadata.setBreathing(false);
            metadata.setAir(0);
            expect(metadata.breathing).toBe(false);
            expect(metadata.air).toBe(0);

            metadata.setBreathing(true);
            metadata.setAir();
            expect(metadata.breathing).toBe(true);
            expect(metadata.air).toBe(MAX_AIR_TICKS);
        });

        it('never claims more air than it can hold', () => {
            const metadata = new Metadata();
            metadata.setAir(10_000);

            expect(metadata.air).toBe(MAX_AIR_TICKS);
        });
    });

    // Every generic flag lives in one 64-bit field. Writing it as a BYTE - which sprinting,
    // flying and climbing each used to do - truncated the field, so setting any of them
    // silently dropped the ones set before it.
    describe('flags share one field', () => {
        it('keeps collision and gravity when the player starts sprinting', () => {
            const metadata = new Metadata();
            metadata.setSprinting(true);

            expect(metadata.sprinting).toBe(true);
            expect(metadata.collidable).toBe(true);
            expect(metadata.affectedByGravity).toBe(true);
            expect(metadata.breathing).toBe(true);
        });

        it('writes the flags as a long whatever has been set', () => {
            const metadata = new Metadata();
            metadata.setSprinting(true);
            metadata.setCanFly(true);
            metadata.setCanClimb(true);

            expect(metadata.getData().get(MetadataFlag.INDEX)?.[0]).toBe(FlagType.LONG);
        });
    });
});

/**
 * What `networkSerialize` can put on the wire.
 *
 * Five of the nine types were written and the rest raised. That is fine for a type nothing
 * sets and fatal for one something does: a falling block carries its own block state as an
 * `INT`, so every sand or gravel that started to fall threw instead of appearing - and threw
 * again for every player who came near it, since spawning is attempted per viewer.
 */
describe('Metadata.networkSerialize', () => {
    const serialized = (build: (metadata: Metadata) => void): BinaryStream => {
        const metadata = new Metadata();
        build(metadata);

        const stream = new BinaryStream();
        metadata.networkSerialize(stream);

        return new BinaryStream(stream.getBuffer());
    };

    /** Walks the entries, returning the value of the first one of the given type. */
    const valueOfType = (stream: BinaryStream, wanted: FlagType): unknown => {
        let found: unknown;

        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            stream.readUnsignedVarInt(); // The key.

            // The type arrives twice: a varint selecting the alternative, then the same type
            // as a byte because that is the alternative's own first field. A reader that
            // takes only one of them reads the value as the other.
            const selector = stream.readUnsignedVarInt();
            const type = stream.readSignedByte();
            expect(type).toBe(selector);
            const value =
                type === FlagType.BYTE
                    ? stream.readByte()
                    : type === FlagType.SHORT
                      ? stream.readUnsignedShortLE()
                      : type === FlagType.INT
                        ? stream.readVarInt()
                        : type === FlagType.FLOAT
                          ? stream.readFloatLE()
                          : type === FlagType.LONG
                            ? stream.readVarLong()
                            : type === FlagType.STRING
                              ? stream.read(stream.readUnsignedVarInt()).toString()
                              : (() => {
                                    throw new Error(`unread type ${type}`);
                                })();

            if (type === wanted) found = value;
        }

        return found;
    };

    it('writes an int, which a falling block needs and which used to throw', () => {
        const metadata = new Metadata();
        expect(() => metadata.setInt(MetadataFlag.VARIANT, 138639715)).not.toThrow();

        const stream = serialized((m) => m.setInt(MetadataFlag.VARIANT, 138639715));

        expect(valueOfType(stream, FlagType.INT)).toBe(138639715);
        // Nothing left over: a varint, not four bytes, and the entries after it depend on that.
        expect(stream.feof()).toBe(true);
    });

    it('writes a falling block whole, flags and all', () => {
        const stream = serialized((metadata) => {
            metadata.setInt(MetadataFlag.VARIANT, 4);
            metadata.setAffectedByGravity(true);
            metadata.setCollidable(false);
        });

        expect(valueOfType(stream, FlagType.INT)).toBe(4);
        expect(stream.feof()).toBe(true);
    });

    it('names the type it cannot write, rather than only numbering it', () => {
        const metadata = new Metadata();
        (metadata as any).setPropertyValue(1, FlagType.ITEM, null);

        expect(() => metadata.networkSerialize(new BinaryStream())).toThrow(/ITEM/);
    });
});
