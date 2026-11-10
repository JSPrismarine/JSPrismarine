import type { SealedTick } from './ChangeLog';
import type { PlainData } from './PlainData';

/**
 * What one sealed tick costs the change log, in counts rather than time, for reporting
 * through `reportProgress`.
 */
export type ChangeLogCost = {
    /** The number of entries the tick appended. */
    readonly entries: number;
    /** An estimate of the bytes the entries hold, from {@link estimatePlainBytes}. */
    readonly bytes: number;
};

/**
 * Counts one sealed tick's entries and estimates their bytes. The result depends only on the
 * entries, so it is the same on every host.
 * @param {SealedTick} sealed - The tick to count.
 * @returns {ChangeLogCost} Its entry count and estimated bytes.
 */
export function changeLogCost(sealed: SealedTick): ChangeLogCost {
    let bytes = 0;
    for (const entry of sealed.entries) bytes += estimatePlainBytes(entry);
    return { entries: sealed.entries.length, bytes };
}

/**
 * Estimates the payload bytes of a plain value: 8 for a number or bigint, 1 for a boolean,
 * nothing for null, 2 for each UTF-16 code unit of a string or property name, the byte length
 * of a typed array, and the sum of the parts for an array or object.
 *
 * It is a logical size for comparing ticks and changes, not the heap size an engine allocates.
 * @param {PlainData} value - The value to measure.
 * @returns {number} Its estimated size in bytes.
 */
export function estimatePlainBytes(value: PlainData): number {
    if (value === null) return 0;
    switch (typeof value) {
        case 'number':
        case 'bigint':
            return 8;
        case 'boolean':
            return 1;
        case 'string':
            return value.length * 2;
    }
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (isPlainArray(value)) {
        let bytes = 0;
        for (const item of value) bytes += estimatePlainBytes(item);
        return bytes;
    }
    let bytes = 0;
    for (const [key, item] of Object.entries(value)) bytes += key.length * 2 + estimatePlainBytes(item);
    return bytes;
}

// `Array.isArray` does not narrow a `readonly` array type out of a union.
function isPlainArray(value: PlainData): value is readonly PlainData[] {
    return Array.isArray(value);
}
