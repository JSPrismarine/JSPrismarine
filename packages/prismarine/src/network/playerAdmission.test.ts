import { describe, expect, it } from 'vitest';

import type { PlayerIdentity } from '../playerIdentity';
import { stub } from '../testing/stub.test.helper';
import type PlayerSession from './PlayerSession';
import { loginRefusalOf } from './playerAdmission';

const steve: PlayerIdentity = {
    name: 'Steve',
    xuid: '',
    uuid: '00000000-0000-0000-0000-000000000001',
    subject: { kind: 'java', uuid: '00000000-0000-0000-0000-000000000001' }
};

/** The lists and sessions of a server, with what each answers for Steve. */
const login = ({ banned = false as string | boolean, allowed = true, players = 0, ignoresLimit = false } = {}) => {
    const claimed: string[] = [];
    return {
        claimed,
        services: {
            sessions: {
                getSessions: () => Array.from({ length: players }, () => stub<PlayerSession>({})),
                reserveIdentity: () => {},
                holdsIdentity: () => true,
                claimIdentity: () => []
            },
            bans: {
                isBanned: () => banned,
                claimLegacy: async () => {
                    claimed.push('ban');
                    return false;
                }
            },
            allowList: { allows: () => allowed, ignoresPlayerLimit: () => ignoresLimit },
            permissions: {
                claimLegacy: () => {
                    claimed.push('operator');
                    return false;
                }
            }
        }
    };
};

describe('loginRefusalOf', () => {
    it('lets in an account no list keeps out on a server with room, claiming its legacy entries', async () => {
        const { services, claimed } = login();

        expect(await loginRefusalOf(services, steve, 20)).toBeUndefined();
        expect(claimed).toEqual(['operator', 'ban']);
    });

    it('refuses a banned account with the ban reason, or none', async () => {
        expect(await loginRefusalOf(login({ banned: 'griefing' }).services, steve, 20)).toEqual({
            kind: 'banned',
            reason: 'griefing'
        });
        expect(await loginRefusalOf(login({ banned: true }).services, steve, 20)).toEqual({
            kind: 'banned',
            reason: ''
        });
    });

    it('refuses an account the allow list leaves out', async () => {
        expect(await loginRefusalOf(login({ allowed: false }).services, steve, 20)).toEqual({ kind: 'notInvited' });
    });

    it('refuses a login to a full server, unless the account ignores the limit', async () => {
        expect(await loginRefusalOf(login({ players: 2 }).services, steve, 2)).toEqual({ kind: 'full' });
        expect(await loginRefusalOf(login({ players: 2, ignoresLimit: true }).services, steve, 2)).toBeUndefined();
    });
});
