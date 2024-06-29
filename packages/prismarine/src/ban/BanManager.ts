import fs from 'node:fs';

import minifyJson from 'strip-json-comments';
import type Player from '../Player';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';

export type BannedPlayerEntry = {
    name: string;
    reason: string | '';
};

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 */
export default class BanManager {
    private readonly server: Server;
    private readonly banned: Map<string, Omit<BannedPlayerEntry, 'name'>> = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     * @async
     */
    public async enable(): Promise<void> {
        await this.parseBanned();
    }

    /**
     * On disable hook.
     * @group Lifecycle
     * @async
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

            const banned: BannedPlayerEntry[] = JSON.parse(minifyJson((await fs.promises.readFile(dir)).toString()));
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
     * @param {Player} player - Player to check.
     * @returns {string | boolean} Reason if banned, false if not banned.
     */
    public isBanned(player: Player): string | boolean {
        if (this.banned.has(player.getName())) {
            return this.banned.get(player.getName())?.reason || true;
        }

        return false;
    }
}
