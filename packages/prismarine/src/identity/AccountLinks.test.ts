import { describe, expect, it } from 'vitest';

import type { PlayerIdentity } from '../playerIdentity';
import type { AccountLink, AccountLinkStore } from './AccountLinks';
import { AccountLinks, LINK_CODE_LIFETIME_MS } from './AccountLinks';

const bedrockSteve: PlayerIdentity = {
    name: 'Steve',
    xuid: '2535400000000000',
    uuid: '00000000-0000-0000-0000-000000000001',
    subject: { kind: 'xbox', xuid: '2535400000000000' }
};
const javaSteve: PlayerIdentity = {
    name: 'SteveJava',
    xuid: '',
    uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
    subject: { kind: 'java', uuid: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' }
};
const offlineAlex: PlayerIdentity = {
    name: 'Alex',
    xuid: '',
    uuid: '00000000-0000-0000-0000-000000000002',
    subject: { kind: 'offline', name: 'Alex' }
};

/** Links over a store that keeps what it is given, on a clock the test moves. */
const setUp = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const saved: AccountLink[][] = [];
    const store: AccountLinkStore = { load: async () => [], save: async (links) => void saved.push([...links]) };
    let now = 1_000;
    const links = new AccountLinks(
        store,
        () => enabled,
        () => now,
        () => 0
    );
    return { links, saved, advance: (ms: number) => (now += ms) };
};

describe('AccountLinks', () => {
    it('links a Java account to the Bedrock account that handed out the code, which it then plays as', async () => {
        const { links, saved } = setUp();
        const issued = links.issueCode(bedrockSteve);
        if (!('code' in issued)) throw new Error(`refused: ${issued.refused}`);

        const redeemed = await links.redeem(issued.code.toLowerCase(), javaSteve);

        expect(redeemed).toEqual({
            linked: {
                account: javaSteve.subject,
                primary: bedrockSteve.subject,
                primaryName: 'Steve',
                primaryXuid: bedrockSteve.xuid
            }
        });
        expect(saved).toHaveLength(1);
        expect(links.resolve(javaSteve)).toEqual({
            ...javaSteve,
            name: 'Steve',
            xuid: bedrockSteve.xuid,
            subject: bedrockSteve.subject,
            linkedFrom: javaSteve.subject
        });
        // The primary plays as itself.
        expect(links.resolve(bedrockSteve)).toBe(bedrockSteve);
    });

    it('refuses an offline account, a code of the same edition, and an expired or unknown code', async () => {
        const { links, advance } = setUp();

        expect(links.issueCode(offlineAlex)).toEqual({ refused: 'unverified' });
        const issued = links.issueCode(bedrockSteve);
        if (!('code' in issued)) throw new Error('refused');
        expect(await links.redeem(issued.code, { ...bedrockSteve, subject: { kind: 'xbox', xuid: '1' } })).toEqual({
            refused: 'same-edition'
        });
        advance(LINK_CODE_LIFETIME_MS + 1);
        expect(await links.redeem(issued.code, javaSteve)).toEqual({ refused: 'unknown-code' });
        expect(await links.redeem('NOPE00', javaSteve)).toEqual({ refused: 'unknown-code' });
    });

    it('refuses a second link either side, and unlinks from either side', async () => {
        const { links } = setUp();
        const first = links.issueCode(bedrockSteve);
        if (!('code' in first)) throw new Error('refused');
        await links.redeem(first.code, javaSteve);

        // The linked Java account, logged in as the primary, cannot hand out a code of its own.
        expect(links.issueCode(links.resolve(javaSteve))).toEqual({ refused: 'linked' });

        expect(await links.unlink(links.resolve(javaSteve))).toBe(true);
        expect(links.resolve(javaSteve)).toBe(javaSteve);
        expect(await links.unlink(javaSteve)).toBe(false);
    });

    it('ignores links while linking is off, and keeps them', async () => {
        const on = setUp();
        const issued = on.links.issueCode(bedrockSteve);
        if (!('code' in issued)) throw new Error('refused');
        await on.links.redeem(issued.code, javaSteve);
        const kept = on.saved.at(-1)!;

        const off = new AccountLinks({ load: async () => kept, save: async () => {} }, () => false);
        await off.load();

        expect(off.resolve(javaSteve)).toBe(javaSteve);
        expect(off.issueCode(bedrockSteve)).toEqual({ refused: 'off' });
        expect(off.linkOf(javaSteve.subject)?.primary).toEqual(bedrockSteve.subject);
    });

    it("keeps the primary's name current as it logs in", async () => {
        const { links, saved } = setUp();
        const issued = links.issueCode(bedrockSteve);
        if (!('code' in issued)) throw new Error('refused');
        await links.redeem(issued.code, javaSteve);

        await links.noteLogin({ ...bedrockSteve, name: 'Steve2' });

        expect(links.resolve(javaSteve).name).toBe('Steve2');
        expect(saved).toHaveLength(2);
    });
});
