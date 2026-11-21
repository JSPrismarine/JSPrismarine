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
});
