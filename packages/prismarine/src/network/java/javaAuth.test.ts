import { describe, expect, it } from 'vitest';

import { hasJoined, serverHash } from './javaAuth';

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

describe('hasJoined', () => {
    it('asks for the name and the hash, and reads the profile Mojang answers with', async () => {
        const urls: string[] = [];
        const profile = await hasJoined('Notch', '-7c9d', async (url) => {
            urls.push(url);
            return {
                status: 200,
                json: async () => ({
                    id: '069a79f444e94726a5befca90e38aaf5',
                    name: 'Notch',
                    properties: [{ name: 'textures', value: 'e30=', signature: 'c2ln' }]
                })
            };
        });

        expect(urls).toEqual([
            'https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch&serverId=-7c9d'
        ]);
        expect(profile).toEqual({
            id: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'Notch',
            properties: [{ name: 'textures', value: 'e30=', signature: 'c2ln' }]
        });
    });

    it('reads no profile from an empty answer', async () => {
        expect(await hasJoined('Notch', '0', async () => ({ status: 204, json: async () => null }))).toBeUndefined();
    });
});
