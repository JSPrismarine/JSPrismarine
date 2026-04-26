import { beforeEach, describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import { Config } from './Config';

describe('config', () => {
    describe('Config', () => {
        let config: Config;

        beforeEach(async () => {
            config = new Config();
            await config.enable();
        });

        it('should have the default server port', () => {
            expect(config.getServerPort()).toBe(19132);
        });

        it('should have the default server IP', () => {
            expect(config.getServerIp()).toBe('0.0.0.0');
        });

        it('should have the default level name', () => {
            expect(config.getWorldName()).toBe('world');
        });

        it('should have the default worlds', () => {
            expect(config.getWorlds()).toEqual({
                world: {
                    generator: 'Flat',
                    provider: 'Filesystem',
                    seed: expect.any(Number)
                }
            });
        });

        it('should have the default max players', () => {
            expect(config.getMaxPlayers()).toBe(20);
        });

        it('should have the default gamemode', () => {
            expect(config.getGamemode().toLowerCase()).toBe('survival');
        });

        it('should have the default MOTD', () => {
            expect(config.getMotd()).toBe('Another JSPrismarine server!');
        });

        it('should have the default view distance', () => {
            expect(config.getViewDistance()).toBe(10);
        });

        it('should have online mode disabled by default', () => {
            expect(config.getOnlineMode()).toBe(false);
        });

        it('should have the default packet compression level', () => {
            expect(config.getPacketCompressionLevel()).toBe(7);
        });

        it('should set the gamemode', () => {
            config.setGamemode(Gametype.CREATIVE);
            expect(config.getGamemode().toLowerCase()).toBe('creative');
        });

        it('should set the MOTD', () => {
            config.setMotd('Welcome to my server!');
            expect(config.getMotd()).toBe('Welcome to my server!');
        });
    });
});
