import BinaryStream from './BinaryStream';

describe('Test binary r/w', () => {
    it('Buffer', () => {
        const dummyBuffer = Buffer.from('lorem', 'utf-8');
        const writeStream = new BinaryStream();
        writeStream.write(dummyBuffer);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.read(dummyBuffer.byteLength)).toStrictEqual(
            dummyBuffer
        );

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned byte', () => {
        // >= 0 and <= 255
        const writeStream = new BinaryStream();
        writeStream.writeByte(0);
        writeStream.writeByte(255);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readByte()).toBe(0);
        expect(readStream.readByte()).toBe(255);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Signed byte', () => {
        // >= -128 and <= 127
        const writeStream = new BinaryStream();
        writeStream.writeSignedByte(-128);
        writeStream.writeSignedByte(127);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readSignedByte()).toBe(-128);
        expect(readStream.readSignedByte()).toBe(127);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Boolean', () => {
        // true or false
        const writeStream = new BinaryStream();
        writeStream.writeBoolean(true);
        writeStream.writeBoolean(false);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readBoolean()).toBe(true);
        expect(readStream.readBoolean()).toBe(false);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Signed short BE', () => {
        // >= -32768 and <= 32767
        const writeStream = new BinaryStream();
        writeStream.writeShort(-32768);
        writeStream.writeShort(32767);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readShort()).toBe(-32768);
        expect(readStream.readShort()).toBe(32767);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Signed short LE', () => {
        // >= -32768 and <= 32767
        const writeStream = new BinaryStream();
        writeStream.writeShortLE(-32768);
        writeStream.writeShortLE(32767);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readShortLE()).toBe(-32768);
        expect(readStream.readShortLE()).toBe(32767);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned short BE', () => {
        // >= 0 and <= 65535
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedShort(0);
        writeStream.writeUnsignedShort(65535);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedShort()).toBe(0);
        expect(readStream.readUnsignedShort()).toBe(65535);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned short LE', () => {
        // >= 0 and <= 65535
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedShortLE(0);
        writeStream.writeUnsignedShortLE(65535);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedShortLE()).toBe(0);
        expect(readStream.readUnsignedShortLE()).toBe(65535);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Triad BE', () => {
        // >= −8,388,608 and <= 8,388,607
        const writeStream = new BinaryStream();
        writeStream.writeTriad(-8_338_608);
        writeStream.writeTriad(8_388_607);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readTriad()).toBe(-8_338_608);
        expect(readStream.readTriad()).toBe(8_388_607);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Triad LE', () => {
        // >= −8,388,608 and <= 8,388,607
        const writeStream = new BinaryStream();
        writeStream.writeTriadLE(-8_338_608);
        writeStream.writeTriadLE(8_388_607);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readTriadLE()).toBe(-8_338_608);
        expect(readStream.readTriadLE()).toBe(8_388_607);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Triad BE', () => {
        // >= 0 <= 16,777,215
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedTriad(0);
        writeStream.writeUnsignedTriad(16_777_215);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedTriad()).toBe(0);
        expect(readStream.readUnsignedTriad()).toBe(16_777_215);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Triad LE', () => {
        // >= 0 <= 16,777,215
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedTriadLE(0);
        writeStream.writeUnsignedTriadLE(16_777_215);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedTriadLE()).toBe(0);
        expect(readStream.readUnsignedTriadLE()).toBe(16_777_215);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Signed Integer BE', () => {
        // >= -2,147,483,648 <= 2,147,483,647
        const writeStream = new BinaryStream();
        writeStream.writeInt(-2_147_483_648);
        writeStream.writeInt(2_147_483_647);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readInt()).toBe(-2_147_483_648);
        expect(readStream.readInt()).toBe(2_147_483_647);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Signed Integer LE', () => {
        // >= -2,147,483,648 <= 2,147,483,647
        const writeStream = new BinaryStream();
        writeStream.writeIntLE(-2_147_483_648);
        writeStream.writeIntLE(2_147_483_647);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readIntLE()).toBe(-2_147_483_648);
        expect(readStream.readIntLE()).toBe(2_147_483_647);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Integer BE', () => {
        // >= 0 <= 4,294,967,295
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedInt(0);
        writeStream.writeUnsignedInt(4_294_967_295);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedInt()).toBe(0);
        expect(readStream.readUnsignedInt()).toBe(4_294_967_295);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Integer LE', () => {
        // >= 0 <= 4,294,967,295
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedIntLE(0);
        writeStream.writeUnsignedIntLE(4_294_967_295);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedIntLE()).toBe(0);
        expect(readStream.readUnsignedIntLE()).toBe(4_294_967_295);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Float BE', () => {
        // >= -3.4E+38 <= +3.4E+38
        const writeStream = new BinaryStream();
        writeStream.writeFloat(-3.4e38);
        writeStream.writeFloat(+3.4e38);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readFloat()).toBeGreaterThanOrEqual(-3.4e38);
        expect(readStream.readFloat()).toBeLessThanOrEqual(+3.4e38);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Float LE', () => {
        // >= -3.4E+38 <= +3.4E+38
        const writeStream = new BinaryStream();
        writeStream.writeFloatLE(-3.4e38);
        writeStream.writeFloatLE(+3.4e38);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readFloatLE()).toBeGreaterThanOrEqual(-3.4e38);
        expect(readStream.readFloatLE()).toBeLessThanOrEqual(+3.4e38);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Double BE', () => {
        // >= -1.7976931348623157E+308 <= 1.7976931348623157E+308
        const writeStream = new BinaryStream();
        writeStream.writeDouble(-1.7976931348);
        writeStream.writeDouble(1.79769313486);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readDouble()).toBeGreaterThanOrEqual(-1.7976931348);
        expect(readStream.readDouble()).toBeLessThanOrEqual(1.79769313486);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Double LE', () => {
        // >= -1.7976931348623157E+308 <= 1.7976931348623157E+308
        const writeStream = new BinaryStream();
        writeStream.writeDoubleLE(-1.7976931348);
        writeStream.writeDoubleLE(1.79769313486);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readDoubleLE()).toBeGreaterThanOrEqual(-1.7976931348);
        expect(readStream.readDoubleLE()).toBeLessThanOrEqual(1.79769313486);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Singed Long BE', () => {
        // >= -9,223,372,036,854,775,808 <= 9,223,372,036,854,775,807
        const writeStream = new BinaryStream();
        writeStream.writeLong(-9_223_372_036_854_775_808n);
        writeStream.writeLong(9_223_372_036_854_775_807n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readLong()).toBe(-9_223_372_036_854_775_808n);
        expect(readStream.readLong()).toBe(9_223_372_036_854_775_807n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Singed Long LE', () => {
        // >= -9,223,372,036,854,775,808 <= 9,223,372,036,854,775,807
        const writeStream = new BinaryStream();
        writeStream.writeLongLE(-9_223_372_036_854_775_808n);
        writeStream.writeLongLE(9_223_372_036_854_775_807n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readLongLE()).toBe(-9_223_372_036_854_775_808n);
        expect(readStream.readLongLE()).toBe(9_223_372_036_854_775_807n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Long BE', () => {
        // >= 0 <= 4,294,967,295
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedLong(0n);
        writeStream.writeUnsignedLong(4_294_967_295n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedLong()).toBe(0n);
        expect(readStream.readUnsignedLong()).toBe(4_294_967_295n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned Long LE', () => {
        // >= 0 <= 4,294,967,295
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedLongLE(0n);
        writeStream.writeUnsignedLongLE(4_294_967_295n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedLongLE()).toBe(0n);
        expect(readStream.readUnsignedLongLE()).toBe(4_294_967_295n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('VarInt', () => {
        const writeStream = new BinaryStream();
        writeStream.writeVarInt(1000);
        writeStream.writeVarInt(1000000);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readVarInt()).toBe(1000);
        expect(readStream.readVarInt()).toBe(1000000);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned VarInt', () => {
        const writeStream = new BinaryStream();
        writeStream.writeVarInt(-1000);
        writeStream.writeVarInt(-1000000);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readVarInt()).toBe(-1000);
        expect(readStream.readVarInt()).toBe(-1000000);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('VarLong', () => {
        const writeStream = new BinaryStream();
        writeStream.writeVarLong(422212465606656n);
        writeStream.writeVarLong(20n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readVarLong()).toBe(422212465606656n);
        expect(readStream.readVarLong()).toBe(20n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });

    it('Unsigned VarLong', () => {
        const writeStream = new BinaryStream();
        writeStream.writeUnsignedVarLong(20n);
        writeStream.writeUnsignedVarLong(10n);

        const readStream = new BinaryStream(writeStream.getWriteBuffer());
        expect(readStream.readUnsignedVarLong()).toBe(20n);
        expect(readStream.readUnsignedVarLong()).toBe(10n);

        expect(readStream.readRemaining().byteLength).toBe(0);
    });
});
