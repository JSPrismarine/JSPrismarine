import { describe, expect, it } from 'vitest';

import { ScriptHandle, TransferBuffer, ValueReader, ValueTag, ValueWriter } from './values';
import type { ScriptValue } from './values';

describe('the value encoding', () => {
    it('reads back every kind of value it writes', () => {
        const buffer = new TransferBuffer(64, () => {});
        const values: ScriptValue[] = [undefined, null, false, true, -0.5, 2 ** 53, '', 'héllo ✓', new ScriptHandle(7)];
        const writer = new ValueWriter(buffer).list(values);

        const reader = new ValueReader(buffer.bytes, writer.length);
        expect(reader.list()).toEqual(values);
        expect(reader.done).toBe(true);
    });

    it('lays a string out as its tag, a little-endian byte length and UTF-8', () => {
        const buffer = new TransferBuffer(64, () => {});
        const writer = new ValueWriter(buffer).string('é');

        expect([...buffer.bytes.subarray(0, writer.length)]).toEqual([ValueTag.String, 2, 0, 0, 0, 0xc3, 0xa9]);
    });

    it('grows the buffer, keeps what it held, and hands the new memory over once per growth', () => {
        const handed: SharedArrayBuffer[] = [];
        const buffer = new TransferBuffer(64, (memory) => handed.push(memory));
        const writer = new ValueWriter(buffer).value(1).string('x'.repeat(1000));

        expect(handed).toHaveLength(1);
        expect(buffer.memory).toBe(handed[0]);
        const reader = new ValueReader(buffer.bytes, writer.length);
        expect(reader.value()).toBe(1);
        expect(reader.value()).toBe('x'.repeat(1000));
    });

    it('refuses bytes that run past their length', () => {
        const buffer = new TransferBuffer(64, () => {});
        const writer = new ValueWriter(buffer).string('abc');

        expect(() => new ValueReader(buffer.bytes, writer.length - 1).value()).toThrow(RangeError);
    });
});
