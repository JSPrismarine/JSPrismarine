import { describe, expect, it } from 'vitest';

import { ServerName } from './ServerName';

/**
 * The MOTD line is positional and the client parses it by index, so the only test worth
 * having is one that pins the whole string. The reference is what gophertunnel broadcasts,
 * which is what a Bedrock Dedicated Server broadcasts.
 * @see https://github.com/Sandertv/gophertunnel/blob/master/minecraft/listener.go (updatePongData)
 */

const build = () =>
    new ServerName({
        getConfig: () => ({
            getMotd: () => 'A JSPrismarine server',
            getGamemode: () => 'Survival',
            getMaxPlayers: () => 20
        }),
        getIdentifiers: () => ({ Protocol: 2193, MinecraftVersions: ['1.26.51'] })
    });

describe('ServerName', () => {
    it('writes the fields in the order a Bedrock Dedicated Server does', () => {
        const name = build();
        name.setServerId(0x0123_4567_89ab_cdefn);
        name.setOnlinePlayerCount(3);
        name.setPort(19_133);

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
                '19133', // ipv4 port
                '19133', // ipv6 port
                '0',
                '0',
                '' // the line is terminated by a separator, not merely separated by them
            ].join(';')
        );
    });

    it('advertises the newest supported game version', () => {
        const name = new ServerName({
            getConfig: () => ({ getMotd: () => 'motd', getGamemode: () => 'Survival', getMaxPlayers: () => 20 }),
            getIdentifiers: () => ({ Protocol: 2193, MinecraftVersions: ['1.26.50', '1.26.51'] })
        });

        // The first entry used to be advertised, so a 1.26.51 client was shown a 1.26.50
        // server even though the protocol it would speak is the same.
        expect(name.getVersion()).toBe('1.26.51');
        expect(name.toString().split(';')[3]).toBe('1.26.51');
    });

    it('advertises the default Bedrock port until the socket says otherwise', () => {
        expect(build().toString().split(';')[10]).toBe('19132');
    });

    it('falls back to a placeholder motd rather than an empty field', () => {
        const name = new ServerName({
            getConfig: () => ({ getMotd: () => '', getGamemode: () => 'Survival', getMaxPlayers: () => 20 }),
            getIdentifiers: () => ({ Protocol: 2193, MinecraftVersions: ['1.26.51'] })
        });

        expect(name.toString().split(';')[1]).toBe('Example motd');
    });
});
