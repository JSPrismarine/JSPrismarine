/**
 * Linked accounts: one person on a Java Edition account and an Xbox account, so either login is
 * the same player, with one saved record, one set of permissions and one live session
 * ([the plan](../../../../docs/plans/java-multiprotocol.md#linked-accounts)).
 *
 * A link points one account at the account that leads, the primary, so no key changes: at login a
 * linked account's identity becomes the primary's, and everything keyed by it follows. The other
 * account's own record is left alone, so an unlink brings it back as it was.
 *
 * Linking takes both accounts: `/link` on one edition hands out a short code, and `/link <code>`
 * on the other redeems it. Only accounts a sign-in vouched for can link, never an `offline` one,
 * whose name anybody can type.
 */
import { randomInt } from 'node:crypto';

import type { PlayerIdentity } from '../playerIdentity';
import type { Subject } from './Subject';
import { sameSubject } from './Subject';

/** One link: an account, and the account it plays as. */
export interface AccountLink {
    readonly account: Subject;
    readonly primary: Subject;
    /** The name the primary last logged in with, which the linked account is shown by. */
    readonly primaryName: string;
    /** The primary's XUID, or empty for a Java primary. */
    readonly primaryXuid: string;
}

/** Where the links are kept between runs. */
export interface AccountLinkStore {
    load(): Promise<AccountLink[]>;
    save(links: readonly AccountLink[]): Promise<void>;
}

/** Why a link was not made. */
export type LinkRefusal =
    /** Linking is turned off on this server. */
    | 'off'
    /** The account is an offline one, which nobody vouched for. */
    | 'unverified'
    /** The account already plays as another, or another already plays as it. */
    | 'linked'
    /** No code like it was handed out, or it expired. */
    | 'unknown-code'
    /** The code came from an account of the same edition, or from this very account. */
    | 'same-edition';

/** How long a code can be redeemed for. */
export const LINK_CODE_LIFETIME_MS = 5 * 60_000;

/** The letters a code is made of: no 0, O, 1 or I, which read alike. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Whether a sign-in vouched for the account. */
const verified = (subject: Subject): boolean => subject.kind !== 'offline';

/** An identity as the account it logged in with, before any link resolved it. */
const accountOf = (identity: PlayerIdentity): Subject => identity.linkedFrom ?? identity.subject;

/** The server's account links. */
export class AccountLinks {
    private links: AccountLink[] = [];
    private readonly codes = new Map<string, { readonly primary: PlayerIdentity; readonly expires: number }>();

    /**
     * @param store - Where the links are kept.
     * @param enabled - Whether linking is on, as `account-linking` says, read when it matters.
     * @param now - The clock codes expire by.
     * @param letter - Picks one of `count` letters for a code; random unless a test gives another.
     */
    public constructor(
        private readonly store: AccountLinkStore,
        private readonly enabled: () => boolean,
        private readonly now: () => number = Date.now,
        private readonly letter: (count: number) => number = (count) => randomInt(count)
    ) {}

    /** Reads the links kept from the last run. */
    public async load(): Promise<void> {
        this.links = await this.store.load();
    }

    /** The link an account has, as the account that plays as another. */
    public linkOf(account: Subject): AccountLink | undefined {
        return this.links.find((link) => sameSubject(link.account, account));
    }

    /**
     * A login's identity as the player it plays as: the primary's name, XUID and subject for a
     * linked account, with the account it logged in with kept as `linkedFrom`. Unchanged when
     * linking is off or the account has no link.
     */
    public resolve(identity: PlayerIdentity): PlayerIdentity {
        if (!this.enabled()) return identity;
        const link = this.linkOf(identity.subject);
        if (link === undefined) return identity;
        return {
            ...identity,
            name: link.primaryName,
            xuid: link.primaryXuid,
            subject: link.primary,
            linkedFrom: identity.subject
        };
    }

    /**
     * Keeps a primary's name and XUID current as it logs in, so the accounts linked to it are
     * shown by the name it has now.
     */
    public async noteLogin(identity: PlayerIdentity): Promise<void> {
        let changed = false;
        this.links = this.links.map((link) => {
            if (!sameSubject(link.primary, identity.subject)) return link;
            if (link.primaryName === identity.name && link.primaryXuid === identity.xuid) return link;
            changed = true;
            return { ...link, primaryName: identity.name, primaryXuid: identity.xuid };
        });
        if (changed) await this.store.save(this.links);
    }

    /**
     * Hands out a code for another account to link to this one, which leads. A later code for the
     * same account replaces the earlier one.
     * @returns The code, or why there is none.
     */
    public issueCode(identity: PlayerIdentity): { readonly code: string } | { readonly refused: LinkRefusal } {
        if (!this.enabled()) return { refused: 'off' };
        const account = accountOf(identity);
        if (!verified(account)) return { refused: 'unverified' };
        if (this.linkOf(account) !== undefined) return { refused: 'linked' };
        for (const [code, pending] of this.codes) {
            if (sameSubject(pending.primary.subject, account)) this.codes.delete(code);
        }
        let code: string;
        do {
            code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[this.letter(CODE_LETTERS.length)]).join('');
        } while (this.codes.has(code));
        this.codes.set(code, { primary: identity, expires: this.now() + LINK_CODE_LIFETIME_MS });
        return { code };
    }

    /**
     * Links this account to the one that handed out the code.
     * @returns The link, or why there is none.
     */
    public async redeem(
        code: string,
        identity: PlayerIdentity
    ): Promise<{ readonly linked: AccountLink } | { readonly refused: LinkRefusal }> {
        if (!this.enabled()) return { refused: 'off' };
        const account = accountOf(identity);
        if (!verified(account)) return { refused: 'unverified' };
        const pending = this.codes.get(code.toUpperCase());
        if (pending === undefined || pending.expires < this.now()) {
            this.codes.delete(code.toUpperCase());
            return { refused: 'unknown-code' };
        }
        const primary = pending.primary.subject;
        if (primary.kind === account.kind) return { refused: 'same-edition' };
        const leads = this.links.some((link) => sameSubject(link.primary, account));
        if (this.linkOf(account) !== undefined || leads || this.linkOf(primary) !== undefined) {
            return { refused: 'linked' };
        }
        this.codes.delete(code.toUpperCase());
        const linked: AccountLink = {
            account,
            primary,
            primaryName: pending.primary.name,
            primaryXuid: pending.primary.xuid
        };
        this.links = [...this.links, linked];
        await this.store.save(this.links);
        return { linked };
    }

    /**
     * Undoes the link an account has, either side of it: an account that plays as another plays
     * as itself again, and a primary lets go of every account linked to it.
     * @returns Whether there was a link to undo.
     */
    public async unlink(identity: PlayerIdentity): Promise<boolean> {
        const account = accountOf(identity);
        const kept = this.links.filter(
            (link) => !sameSubject(link.account, account) && !sameSubject(link.primary, account)
        );
        if (kept.length === this.links.length) return false;
        this.links = kept;
        await this.store.save(this.links);
        return true;
    }
}
