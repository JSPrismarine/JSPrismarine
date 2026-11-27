import { describe, expect, it } from 'vitest';

import type { ServerStatusSnapshot } from './ServerStatus';
import { ServerStatus } from './ServerStatus';

const BASE: ServerStatusSnapshot = {
    motd: 'A JSPrismarine server',
    levelName: 'JSPrismarine',
    onlinePlayers: 0,
    maxPlayers: 20,
    protocol: 2193,
    version: '1.26.51',
    gamemode: 'survival'
};

describe('ServerStatus', () => {
    it("shows the base under an owner's changes, and the base again once they are cleared", () => {
        const status = new ServerStatus(BASE);
        const owner = {};

        status.override(owner, { motd: '§aLobby', maxPlayers: 100 });
        expect(status.current()).toStrictEqual({ ...BASE, motd: '§aLobby', maxPlayers: 100 });
        expect([status.getMotd(), status.getOnlinePlayerCount(), status.getMaxPlayerCount()]).toStrictEqual([
            '§aLobby',
            0,
            100
        ]);

        status.clear(owner);
        expect(status.current()).toStrictEqual(BASE);
    });

    it("merges an owner's changes with its earlier ones", () => {
        const status = new ServerStatus(BASE);
        const owner = {};

        status.override(owner, { motd: 'one' });
        status.override(owner, { onlinePlayers: 7 });

        expect(status.current()).toMatchObject({ motd: 'one', onlinePlayers: 7 });
    });

    it('shows the owner that changed a field last, and the other again once that one clears', () => {
        const status = new ServerStatus(BASE);
        const first = {};
        const second = {};

        status.override(first, { motd: 'first', maxPlayers: 50 });
        status.override(second, { motd: 'second' });
        expect(status.current()).toMatchObject({ motd: 'second', maxPlayers: 50 });

        status.override(first, { motd: 'first again' });
        expect(status.getMotd()).toBe('first again');

        status.clear(first);
        expect(status.current()).toMatchObject({ motd: 'second', maxPlayers: 20 });
    });

    it('keeps an owner over the base it changes while the base moves under it', () => {
        const status = new ServerStatus(BASE);
        const owner = {};

        status.override(owner, { onlinePlayers: 99 });
        status.setBase({ onlinePlayers: 3 });
        expect(status.getOnlinePlayerCount()).toBe(99);

        status.clear(owner);
        expect(status.getOnlinePlayerCount()).toBe(3);
    });

    it('tells its listeners of each change of what it shows, and of nothing else', () => {
        const status = new ServerStatus(BASE);
        const owner = {};
        const heard: string[] = [];
        const stop = status.onChange(({ motd, onlinePlayers }) => heard.push(`${motd}:${onlinePlayers}`));

        status.override(owner, { motd: 'changed' });
        status.override(owner, { motd: 'changed' });
        status.setBase({ motd: 'hidden under the owner' });
        status.setBase({ onlinePlayers: 1 });
        status.clear({});
        stop();
        status.clear(owner);

        expect(heard).toStrictEqual(['changed:0', 'changed:1']);
    });
});
