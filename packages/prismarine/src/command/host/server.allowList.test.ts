/**
 * `/allowlist` reaches the server's allow list through the command host. The command's replies are
 * compared with Bedrock Dedicated Server's in the parity suite's `commands.answers` rows; this is
 * what the host does to the list itself.
 */
import { describe, expect, it } from 'vitest';

import type AllowList from '../../allowlist/AllowList';
import type { AllowListEntry, AllowListPlayer } from '../../allowlist/AllowList';
import type { Config } from '../../config/Config';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { serverSideCommandHost } from './server';

/** A server whose allow list lives in memory, with online authentication on or off. */
const serverWith = (onlineMode: boolean) => {
    let entries: AllowListEntry[] = [];
    let enabled = false;
    const same = (entry: AllowListEntry, player: AllowListPlayer): boolean => entry.name === player.name;
    const list = stub<AllowList>({
        add: (entry) => {
            if (entries.some((listed) => same(listed, entry))) return false;
            entries = [...entries, entry];
            return true;
        },
        remove: (player) => {
            const kept = entries.filter((listed) => !same(listed, player));
            const removed = kept.length < entries.length;
            entries = kept;
            return removed;
        },
        getEntries: () => entries,
        setEnabled: (value) => {
            enabled = value;
        },
        isEnabled: () => enabled
    });
    const server = stub<Server>({
        getAllowList: () => list,
        getConfig: () => stub<Config>({ getOnlineMode: () => onlineMode })
    });
    return { host: serverSideCommandHost(server, () => {}).allowList, list };
};

describe('the command host’s allow list', () => {
    it('adds a name once and takes it off again', () => {
        const { host } = serverWith(true);

        expect(host.add('Steve')).toBe(true);
        expect(host.add('Steve')).toBe(false);
        expect(host.entries()).toEqual([{ name: 'Steve', ignoresPlayerLimit: false }]);
        expect(host.remove('Steve')).toBe(true);
        expect(host.remove('Steve')).toBe(false);
    });

    it('turns the list on only where players are authenticated online, as BDS does', () => {
        const offline = serverWith(false);
        expect(offline.host.setEnabled(true)).toBe(false);
        expect(offline.list.isEnabled()).toBe(false);
        expect(offline.host.setEnabled(false)).toBe(true);

        const online = serverWith(true);
        expect(online.host.setEnabled(true)).toBe(true);
        expect(online.list.isEnabled()).toBe(true);
    });
});
