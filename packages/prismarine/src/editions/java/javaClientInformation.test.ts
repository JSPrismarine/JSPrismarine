import { describe, expect, it } from 'vitest';

import { javaLocaleOf, javaViewDistanceOf } from './javaClientInformation';

describe("a Java client's settings", () => {
    it('name the language as the locale a Bedrock login does', () => {
        expect(javaLocaleOf('en_us')).toBe('en_US');
        expect(javaLocaleOf('sv_se')).toBe('sv_SE');
        expect(javaLocaleOf('lol')).toBe('lol');
    });

    it("send chunks within the client's view distance, raised to 2 and capped at the server's", () => {
        expect(javaViewDistanceOf(6, 10)).toBe(6);
        expect(javaViewDistanceOf(32, 10)).toBe(10);
        expect(javaViewDistanceOf(0, 10)).toBe(2);
        expect(javaViewDistanceOf(0, 1)).toBe(1);
    });
});
