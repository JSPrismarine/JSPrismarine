import { describe, expect, it } from 'vitest';

import { EyeOfEnderEcho } from './eyeOfEnderEcho';

describe('EyeOfEnderEcho', () => {
    it('takes a click at nothing within the window for the echo of the same entity’s block use', () => {
        const echo = new EyeOfEnderEcho(2);

        echo.usedOnBlock(1n, 400);

        expect(echo.isEcho(1n, 400)).toBe(true);
        expect(echo.isEcho(1n, 402)).toBe(true);
        expect(echo.isEcho(1n, 403)).toBe(false);
    });

    it('does not take one entity’s block use for another entity’s echo', () => {
        const echo = new EyeOfEnderEcho(2);

        echo.usedOnBlock(1n, 400);

        expect(echo.isEcho(2n, 400)).toBe(false);
    });

    it('lets go of a block use once it is outside the window, at the next block use by anyone', () => {
        // A player who leaves right after a click never sends the echo. Its entry has to go
        // without a disconnect hook, or every such click would stay in memory for good.
        const echo = new EyeOfEnderEcho(2);

        echo.usedOnBlock(1n, 400);
        echo.usedOnBlock(2n, 403);

        expect(echo.size).toBe(1);
        expect(echo.isEcho(2n, 403)).toBe(true);
    });

    it('keeps block uses that are still inside the window', () => {
        const echo = new EyeOfEnderEcho(2);

        echo.usedOnBlock(1n, 400);
        echo.usedOnBlock(2n, 402);

        expect(echo.size).toBe(2);
    });
});
