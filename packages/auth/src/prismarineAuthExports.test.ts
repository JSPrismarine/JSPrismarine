import { describe, expect, it } from 'vitest';

import { prismarineAuthExports } from './prismarineAuthExports';

/** prismarine-auth's two exports in their simplest shape. */
const exportsOf = () => ({
    Titles: { MinecraftNintendoSwitch: 'switch-title' },
    Authflow: class {
        public getMinecraftBedrockToken() {
            return Promise.resolve({ chain: [] });
        }
    }
});

describe('prismarineAuthExports', () => {
    it('reads the named exports a namespace carries', () => {
        const named = exportsOf();

        expect(prismarineAuthExports(named)).toBe(named);
    });

    it('reads the exports under default, as tsx loads the CommonJS module', () => {
        const named = exportsOf();

        expect(prismarineAuthExports({ default: named })).toBe(named);
    });

    it('refuses a module without Authflow and Titles', () => {
        expect(() => prismarineAuthExports({ default: {} })).toThrow('exports no Authflow and Titles');
    });
});
