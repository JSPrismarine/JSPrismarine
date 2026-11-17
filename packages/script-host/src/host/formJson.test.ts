import { describe, expect, it } from 'vitest';

import { bdsFloat, BdsFloat, writeBdsJson } from './formJson';

describe('writing JSON as BDS writes form JSON', () => {
    it('writes keys in byte order and ends the document with a newline', () => {
        expect(writeBdsJson({ type: 'form', content: '', elements: null, title: 'T' })).toBe(
            '{"content":"","elements":null,"title":"T","type":"form"}\n'
        );
    });

    it('escapes quotes, backslashes and control characters, and leaves the rest as it is', () => {
        // The pinned BDS's own output, from the form-json golden's escapes form.
        expect(
            writeBdsJson('tab\t cr\r bs\b ff\f one\u0001 us\u001f del\u007f backslash\\ emoji \u{1F600} "q" / é')
        ).toBe('"tab\\t cr\\r bs\\b ff\\f one\\u0001 us\\u001F del\u007f backslash\\\\ emoji \u{1F600} \\"q\\" / é"\n');
    });

    it('writes integers, booleans, null and arrays as they are', () => {
        expect(writeBdsJson([1, -7, 2147483647, true, false, null, []])).toBe('[1,-7,2147483647,true,false,null,[]]\n');
    });

    it.each([
        // Each pair is a float the pinned BDS wrote in a slider, as the form-json golden holds it.
        [0, '0.0'],
        [-0, '-0.0'],
        [10, '10.0'],
        [2.5, '2.50'],
        [-2.5, '-2.50'],
        [0.5, '0.50'],
        [3.25, '3.250'],
        [12.75, '12.750'],
        [100.5, '100.50'],
        [1000000, '1000000.0'],
        [0.1, '0.1000000014901161'],
        [0.2, '0.2000000029802322'],
        [1 / 3, '0.3333333432674408'],
        [0.30000001192092896, '0.3000000119209290'],
        [123456789, '123456792.0'],
        [16777217, '16777216.0'],
        [1e-7, '1.000000011686097e-07'],
        [1e21, '1.000000020040877e+21'],
        [1e-45, '1.401298464324817e-45'],
        [3.4028234663852886e38, '3.402823466385289e+38']
    ])('writes the float %d as %s', (value, written) => {
        expect(bdsFloat(Math.fround(value))).toBe(written);
        expect(writeBdsJson(new BdsFloat(value))).toBe(`${written}\n`);
    });
});
