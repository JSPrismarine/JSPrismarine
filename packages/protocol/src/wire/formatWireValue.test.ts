import { describe, expect, it } from 'vitest';

import { formatWireValue } from './formatWireValue';

describe('formatWireValue', () => {
    it('preserves readable Unicode and distinguishes quotes and literal escapes', () => {
        const value = 'Sandström "command" \\n';
        expect(formatWireValue(value)).toBe('"Sandström \\"command\\" \\\\n"');
        expect(JSON.parse(formatWireValue(value))).toBe(value);
    });

    it('escapes every C0, DEL and C1 control and both Unicode line separators', () => {
        const codes = [
            ...Array.from({ length: 32 }, (_, index) => index),
            ...Array.from({ length: 33 }, (_, index) => index + 127),
            0x2028,
            0x2029
        ];
        for (const code of codes) {
            const value = `before${String.fromCharCode(code)}after`;
            const formatted = formatWireValue(value);
            expect(formatted).not.toContain(String.fromCharCode(code));
            expect(JSON.parse(formatted)).toBe(value);
        }
    });
});
