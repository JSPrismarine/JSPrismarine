import fs from 'node:fs';

import JSON5 from 'json5';
import type Player from '../Player';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';

export type BannedPlayerEntry = {
    name: string;
    reason: string | '';
};

/**
 * The part of the server the ban manager uses. A test can hand in a logger
 * without building the rest.
 */
export type BanManagerServer = Pick<Server, 'getLogger'>;

/**
 * The part of a player a ban check reads. Bans are keyed by name only.
 */
export type BanSubject = Pick<Player, 'getName'>;

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 */
export default class BanManager {
    private readonly server: BanManagerServer;
    private readonly banned: Map<string, Omit<BannedPlayerEntry, 'name'>> = new Map();

    public constructor(server: BanManagerServer) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.parseBanned();
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.banned.clear();
    }

    private async parseBanned() {
        try {
            const dir = withCwd(FILE_NAME);
            if (!fs.existsSync(dir)) {
                this.server.getLogger().warn(`Failed to load ban list!`);
                fs.writeFileSync(dir, '[]');
            }

            const banned: BannedPlayerEntry[] = JSON5.parse((await fs.promises.readFile(dir)).toString());
            for (const player of banned) this.banned.set(player.name, player);
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    public async setBanned(username: string, reason = '') {
        this.banned.set(username, {
            reason
        });

        await fs.promises.writeFile(
            // FIXME: This overwrites comments in the file.
            withCwd(FILE_NAME),
            JSON.stringify(
                Array.from(this.banned).map((entry) => ({
                    name: entry[0],
                    reason: entry[1].reason
                })),
                null,
                4
            )
        );
        return true;
    }

    public async setUnbanned(username: string) {
        this.banned.delete(username);

        await fs.promises.writeFile(
            // FIXME: This overwrites comments in the file.
            withCwd(FILE_NAME),
            JSON.stringify(
                Array.from(this.banned).map((entry) => ({
                    name: entry[0],
                    reason: entry[1].reason
                })),
                null,
                4
            )
        );
    }

    /**
     * Check if player is banned.
     * @param {BanSubject} player - Player to check.
     * @returns {string | boolean} Reason if banned, false if not banned.
     */
    public isBanned(player: BanSubject): string | boolean {
        if (this.banned.has(player.getName())) {
            return this.banned.get(player.getName())?.reason || true;
        }

        return false;
    }
}
