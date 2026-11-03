import { describe, expect, it } from 'vitest';

import { xxHash64 } from './xxHash64';

describe('xxHash64', () => {
    it('matches the standard empty, short, and long input vectors', () => {
        expect(xxHash64(Buffer.alloc(0))).toBe(0xef46_db37_51d8_e999n);
        expect(xxHash64(Buffer.from('a'))).toBe(0xd24e_c4f1_a98c_6e5bn);
        expect(xxHash64(Buffer.from('abc'))).toBe(0x44bc_2cf5_ad77_0999n);
        expect(xxHash64(Buffer.from('abcdefghijklmnopqrstuvwxyz'))).toBe(0xcfe1_f278_fa89_835cn);
    });
});
