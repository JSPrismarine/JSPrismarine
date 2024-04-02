import { assert } from 'vitest';

interface Equalable {
    equals(o: any): boolean;
}

export default function testEquality(a: Equalable, b: Equalable) {
    if (a.equals(b) === false) assert.fail();
}
