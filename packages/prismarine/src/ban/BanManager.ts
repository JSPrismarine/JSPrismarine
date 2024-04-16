import fs from 'node:fs';

import minifyJson from 'strip-json-comments';
import type Player from '../Player';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';

const FILE_NAME = 'banned-players.json';

/**
 * Ban manager.
 */
export default class BanManager {
    private readonly server: Server;
    private readonly banned: Map<
        string,
        {
            reason: string;
        }
    > = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    public async enable() {
        await this.parseBanned();
    }

    public async disable() {
        this.banned.clear();
    }

    private async parseBanned() {
        try {
            const dir = withCwd(FILE_NAME);
            if (!fs.existsSync(dir)) {
                this.server.getLogger().warn(`Failed to load ban list!`);
                fs.writeFileSync(dir, '[]');
            }
            const banned: any[] = JSON.parse(minifyJson((await fs.promises.readFile(dir)).toString()));

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

    public isBanned(player: Player) {
        if (this.banned.has(player.getName())) return this.banned.get(player.getName())?.reason;

        return false;
    }
}
