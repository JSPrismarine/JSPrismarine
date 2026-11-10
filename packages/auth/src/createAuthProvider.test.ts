import { describe, expect, it } from 'vitest';

import { createAuthProvider } from './createAuthProvider';
import OfflineAuthProvider from './OfflineAuthProvider';
import XboxAuthProvider from './XboxAuthProvider';

describe('createAuthProvider', () => {
    it('builds the provider a setting names, with its options', async () => {
        const offline = createAuthProvider({ provider: 'offline', displayName: 'Steve' });
        const xbox = createAuthProvider({
            provider: 'xbox',
            tokens: { getMinecraftBedrockToken: async () => ({ chain: [] }) }
        });

        expect(offline).toBeInstanceOf(OfflineAuthProvider);
        expect((await offline.getIdentity()).displayName).toBe('Steve');
        expect(xbox).toBeInstanceOf(XboxAuthProvider);
        expect(xbox.name).toBe('xbox');
    });
});
