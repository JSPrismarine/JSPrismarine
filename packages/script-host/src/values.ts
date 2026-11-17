/**
 * The byte form values take between TypeScript and the engine, as the header
 * `native/include/jsp_script_host.h` lays it out: a tag byte and a little-endian payload per
 * value, and a `uint32` count before a list.
 */

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** The tag bytes of the value encoding. */
export const ValueTag = {
    Undefined: 0,
    Null: 1,
    False: 2,
    True: 3,
    Number: 4,
    String: 5,
    Handle: 6
} as const;

/**
 * A JavaScript value that stays in its engine, such as an object or a function. The host refers to
 * it by handle until it frees it.
 */
export class ScriptHandle {
    /** The engine's handle, a positive integer. */
    public readonly id: number;

    public constructor(id: number) {
        this.id = id;
    }
}

/** A value as it crosses between the host and a script. */
export type ScriptValue = undefined | null | boolean | number | string | ScriptHandle;

/**
 * An engine's transfer buffer: shared memory whose address the engine holds. Growing it moves the
 * bytes written so far into a new buffer and hands that buffer to the engine.
 */
export class TransferBuffer {
    private memoryValue: SharedArrayBuffer;
    private bytesValue: Buffer;
    private readonly replaced: (memory: SharedArrayBuffer) => void;

    /**
     * @param capacity - The first buffer's size in bytes.
     * @param replaced - Hands a new buffer to the engine. It runs after every growth.
     */
    public constructor(capacity: number, replaced: (memory: SharedArrayBuffer) => void) {
        this.memoryValue = new SharedArrayBuffer(capacity);
        this.bytesValue = Buffer.from(this.memoryValue);
        this.replaced = replaced;
    }

    /** The current shared memory. */
    public get memory(): SharedArrayBuffer {
        return this.memoryValue;
    }

    /** A view of the current memory, which growth replaces. */
    public get bytes(): Buffer {
        return this.bytesValue;
    }

    /** The buffer's size in bytes. */
    public get capacity(): number {
        return this.memoryValue.byteLength;
    }

    /**
     * Makes room for `needed` bytes, keeping what the buffer already holds.
     * @param needed - The size the buffer must have, in bytes.
     */
    public reserve(needed: number): void {
        if (needed <= this.capacity) return;
        const memory = new SharedArrayBuffer(Math.max(needed, this.capacity * 2));
        const bytes = Buffer.from(memory);
        this.bytesValue.copy(bytes);
        this.memoryValue = memory;
        this.bytesValue = bytes;
        this.replaced(memory);
    }
}

/** Writes values into a transfer buffer from its start. */
export class ValueWriter {
    /** How many bytes the writer has written. */
    public length = 0;
    private readonly buffer: TransferBuffer;

    public constructor(buffer: TransferBuffer) {
        this.buffer = buffer;
    }

    /** Writes a list: its count, then each value. */
    public list(values: readonly ScriptValue[]): this {
        this.buffer.reserve(this.length + 4);
        this.buffer.bytes.writeUInt32LE(values.length, this.length);
        this.length += 4;
        for (const value of values) this.value(value);
        return this;
    }

    /**
     * Writes one value.
     * @throws {TypeError} For a bigint, a symbol, a function or a host object, which have no byte form.
     */
    public value(value: ScriptValue): this {
        if (value === undefined) return this.tag(ValueTag.Undefined);
        if (value === null) return this.tag(ValueTag.Null);
        if (typeof value === 'boolean') return this.tag(value ? ValueTag.True : ValueTag.False);
        if (typeof value === 'number') {
            this.tag(ValueTag.Number);
            this.buffer.reserve(this.length + 8);
            this.buffer.bytes.writeDoubleLE(value, this.length);
            this.length += 8;
            return this;
        }
        if (typeof value === 'string') return this.string(value);
        if (value instanceof ScriptHandle) {
            this.tag(ValueTag.Handle);
            this.buffer.reserve(this.length + 4);
            this.buffer.bytes.writeUInt32LE(value.id, this.length);
            this.length += 4;
            return this;
        }
        throw new ScriptHostErrors.ValueCannotCrossIntoScript({ type: typeof value });
    }

    /** Writes one string value. */
    public string(text: string): this {
        const size = Buffer.byteLength(text, 'utf8');
        this.tag(ValueTag.String);
        this.buffer.reserve(this.length + 4 + size);
        this.buffer.bytes.writeUInt32LE(size, this.length);
        this.buffer.bytes.write(text, this.length + 4, size, 'utf8');
        this.length += 4 + size;
        return this;
    }

    private tag(tag: number): this {
        this.buffer.reserve(this.length + 1);
        this.buffer.bytes[this.length] = tag;
        this.length += 1;
        return this;
    }
}

/** Reads values out of a transfer buffer, copying every string. */
export class ValueReader {
    private position = 0;
    private readonly bytes: Buffer;
    private readonly length: number;

    /**
     * @param bytes - The buffer's current view.
     * @param length - How many bytes are valid.
     */
    public constructor(bytes: Buffer, length: number) {
        this.bytes = bytes;
        this.length = length;
    }

    /** Whether every valid byte has been read. */
    public get done(): boolean {
        return this.position === this.length;
    }

    /** Reads a list: its count, then each value. */
    public list(): ScriptValue[] {
        const count = this.u32();
        return Array.from({ length: count }, () => this.value());
    }

    /**
     * Reads one value.
     * @throws {RangeError} When the bytes are not a value.
     */
    public value(): ScriptValue {
        const tag = this.u8();
        switch (tag) {
            case ValueTag.Undefined:
                return undefined;
            case ValueTag.Null:
                return null;
            case ValueTag.False:
                return false;
            case ValueTag.True:
                return true;
            case ValueTag.Number: {
                this.need(8);
                const number = this.bytes.readDoubleLE(this.position);
                this.position += 8;
                return number;
            }
            case ValueTag.String: {
                const size = this.u32();
                this.need(size);
                const text = this.bytes.toString('utf8', this.position, this.position + size);
                this.position += size;
                return text;
            }
            case ValueTag.Handle:
                return new ScriptHandle(this.u32());
            default:
                throw new ScriptHostErrors.UnknownValueTag({ tag });
        }
    }

    /** Reads one string value. */
    public string(): string {
        const value = this.value();
        if (typeof value !== 'string') throw new ScriptHostErrors.ExpectedStringValue();
        return value;
    }

    private u8(): number {
        this.need(1);
        const value = this.bytes[this.position] ?? 0;
        this.position += 1;
        return value;
    }

    private u32(): number {
        this.need(4);
        const value = this.bytes.readUInt32LE(this.position);
        this.position += 4;
        return value;
    }

    private need(size: number): void {
        if (this.length - this.position < size) throw new ScriptHostErrors.ValueRunsPastBytes();
    }
}
