import { describe, expect, it } from 'vitest';

import { playerKeyOf, sameAccount } from './playerIdentity';

describe('accounts of both editions', () => {
    const java = {
        name: 'Steve',
        xuid: '',
        uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
        subject: { kind: 'java', uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' }
    } as const;
    const bedrock = {
        name: 'Steve',
        xuid: '2535400000000000',
        uuid: '00000000-0000-0000-0000-000000000001',
        subject: { kind: 'xbox', xuid: '2535400000000000' }
    } as const;

    it('keys a verified Java account by its UUID, so it never shares a record with a namesake', () => {
        expect(playerKeyOf(java)).toBe('java:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
        expect(playerKeyOf({ name: 'Steve', xuid: '' })).toBe('Steve');
    });

    it('lets a Java player and a Bedrock player of the same name both play', () => {
        expect(sameAccount(java, bedrock)).toBe(false);
        expect(sameAccount(java, { ...java, uuid: '00000000-0000-0000-0000-00000000000f' })).toBe(true);
    });

    describe('on an offline-mode server', () => {
        // Java's `UUID.nameUUIDFromBytes("OfflinePlayer:Alex")`, the UUID vanilla gives an offline Alex.
        const alexUuid = '36532b5e-c442-3dbb-a24c-c7e55d0f979a';
        const javaAlex = {
            name: 'Alex',
            xuid: '',
            uuid: alexUuid,
            subject: { kind: 'offline', name: 'Alex', edition: 'java' }
        } as const;
        const bedrockAlex = {
            name: 'Alex',
            xuid: '',
            uuid: '00000000-0000-0000-0000-000000000002',
            subject: { kind: 'offline', name: 'Alex' }
        } as const;

        it("keys a Java player by the UUID vanilla derives from the name, apart from a Bedrock namesake's", () => {
            expect(playerKeyOf(javaAlex)).toBe('java:36532b5e-c442-3dbb-a24c-c7e55d0f979a');
            expect(playerKeyOf(bedrockAlex)).toBe('Alex');
        });

        it('lets a Java player and a Bedrock player of the same name both play', () => {
            expect(sameAccount(javaAlex, bedrockAlex)).toBe(false);
            expect(sameAccount(bedrockAlex, javaAlex)).toBe(false);
        });

        it('still replaces a second login of the same name from the same edition', () => {
            expect(sameAccount(javaAlex, { ...javaAlex })).toBe(true);
            expect(sameAccount(bedrockAlex, { ...bedrockAlex, uuid: '00000000-0000-0000-0000-000000000003' })).toBe(
                true
            );
        });

        it("replaces a Bedrock login that claims a Java player's UUID or record key", () => {
            expect(sameAccount(javaAlex, { ...bedrockAlex, name: 'Mallory', uuid: javaAlex.uuid })).toBe(true);
            expect(sameAccount(javaAlex, { ...bedrockAlex, name: 'Mallory', xuid: playerKeyOf(javaAlex) })).toBe(true);
        });
    });
});
