import { describe, expect, it } from 'vitest';

import { ServerName } from './ServerName';

/**
 * The MOTD line is positional and the client parses it by index, so the only test worth
 * having is one that pins the whole string. The reference is what gophertunnel broadcasts,
 * which is what a Bedrock Dedicated Server broadcasts.
 * @see https://github.com/Sandertv/gophertunnel/blob/master/minecraft/listener.go (updatePongData)
 */

const build = () =>
    new ServerName(
        {
            getConfig: () => ({
                getMotd: () => 'A JSPrismarine server',
                getGamemode: () => 'Survival',
                getMaxPlayers: () => 20
            })
        },
        { protocolVersion: 2193, minecraftVersions: ['1.26.51'] }
    );

describe('ServerName', () => {
    it('writes the fields in the order a Bedrock Dedicated Server does', () => {
        const name = build();
        name.setServerId(0x0123_4567_89ab_cdefn);
        name.setOnlinePlayerCount(3);
        name.setPort(19_134);
        name.setPortV6(19_135);

        expect(name.toString()).toBe(
            [
                'MCPE', // edition
                'A JSPrismarine server', // motd
                '2193', // protocol
                '1.26.51', // version
                '3', // online players
                '20', // maximum players
                '81985529216486895', // server id
                'JSRakNet', // sub name
                'Survival', // gamemode
                '1', // flag, not a count: a longer line is dropped unless this is exactly 1
                '19134', // ipv4 port
                '19135', // ipv6 port
                '0',
                '0',
                '' // the line is terminated by a separator, not merely separated by them
            ].join(';')
        );
    });

    it('advertises the newest supported game version', () => {
        const name = new ServerName(
            {
                getConfig: () => ({ getMotd: () => 'motd', getGamemode: () => 'Survival', getMaxPlayers: () => 20 })
            },
            { protocolVersion: 2193, minecraftVersions: ['1.26.50', '1.26.51'] }
        );

        // The first entry used to be advertised, so a 1.26.51 client was shown a 1.26.50
        // server even though the protocol it would speak is the same.
        expect(name.getVersion()).toBe('1.26.51');
        expect(name.toString().split(';')[3]).toBe('1.26.51');
    });

    it('advertises the default Bedrock ports until the sockets say otherwise', () => {
        const fields = build().toString().split(';');
        expect(fields[10]).toBe('19132');
        expect(fields[11]).toBe('19133');
    });

    it('falls back to a placeholder motd rather than an empty field', () => {
        const name = new ServerName(
            {
                getConfig: () => ({ getMotd: () => '', getGamemode: () => 'Survival', getMaxPlayers: () => 20 })
            },
            { protocolVersion: 2193, minecraftVersions: ['1.26.51'] }
        );

        expect(name.toString().split(';')[1]).toBe('Example motd');
    });

    it('notifies a worker mirror when advertised fields change', () => {
        const name = build();
        const changes: string[] = [];
        const stop = name.onChange((snapshot) => changes.push(`${snapshot.motd}:${snapshot.port}`));

        name.setMotd('new motd');
        name.setPort(19_140);
        stop();
        name.setGamemode('Creative');

        expect(changes).toEqual(['new motd:19132', 'new motd:19140']);
    });

    it('follows the socket session count until an owner takes the player count over', () => {
        const name = build();

        name.setSessionCount(2);
        expect(name.getOnlinePlayerCount()).toBe(2);

        // A server with players on NetherNet too: RakNet's sessions are only part of the count.
        name.ownPlayerCount();
        name.setOnlinePlayerCount(5);
        name.setSessionCount(1);
        expect(name.getOnlinePlayerCount()).toBe(5);
    });
});
