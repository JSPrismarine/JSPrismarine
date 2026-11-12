import { describe, expect, it } from 'vitest';

import { isPublicAddress, sameAddress, unmapped } from './addresses';

describe('isPublicAddress', () => {
    it.each(['79.193.98.226', '::ffff:79.193.98.226', '2a02:3037:666:6fb6::1'])('takes %s', (address) => {
        expect(isPublicAddress(address)).toBe(true);
    });

    it.each(['172.21.0.15', '::ffff:192.168.2.52', '100.122.230.7', 'fd7a:115c:a1e0::1', '::1', 'example.com', ''])(
        'refuses %j',
        (address) => {
            expect(isPublicAddress(address)).toBe(false);
        }
    );
});

describe('sameAddress', () => {
    it('compares addresses, not their spelling', () => {
        expect(sameAddress('2001:db8::7', '2001:DB8:0:0:0:0:0:7')).toBe(true);
        expect(sameAddress('203.0.113.9', '203.0.113.10')).toBe(false);
        expect(sameAddress('203.0.113.9', 'example.com')).toBe(false);
    });
});

describe('unmapped', () => {
    it('reads an IPv4-mapped address as IPv4 and leaves the rest', () => {
        expect(unmapped('::ffff:203.0.113.9')).toBe('203.0.113.9');
        expect(unmapped('2001:db8::7')).toBe('2001:db8::7');
    });
});
