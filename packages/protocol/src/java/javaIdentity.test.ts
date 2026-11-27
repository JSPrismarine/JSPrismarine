import { describe, expect, it } from 'vitest';

import { offlineUuid, serverHash } from './javaIdentity';

describe('offlineUuid', () => {
    it("gives a name the UUID vanilla's offline mode gives it", () => {
        expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    });
});

describe('serverHash', () => {
    // The protocol page's examples: the SHA-1 of each name, as Java's signed hex digest.
    it.each([
        ['Notch', '4ed1f46bbe04bc756bcb17c0c7ce3e4632f06a48'],
        ['jeb_', '-7c9d5b0044c130109a5d7b5fb5c317c02b4e28c1'],
        ['simon', '88e16a1019277b15d58faf0541e11910eb756f6']
    ])('hashes %s to %s', (name, hash) => {
        expect(serverHash(name, Buffer.alloc(0), Buffer.alloc(0))).toBe(hash);
    });
});
