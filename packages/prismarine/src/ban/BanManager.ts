import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import type Player from '../Player';
import type Server from '../Server';
import { cwd } from '../utils/cwd';
import minifyJson from 'strip-json-comments';

/**
 * Ban manager.
 *
 * @public
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

    public async onEnable() {
        await this.parseBanned();
    }

    public async onDisable() {
        this.banned.clear();
    }

    private async parseBanned() {
        try {
            const dir = path.resolve(cwd(), '/banned-players.json');
            if (!fs.existsSync(dir)) {
                this.server.getLogger().warn(`Failed to load ban list!`);
                fs.writeFileSync(dir, '[]');
            }

            const readFile = util.promisify(fs.readFile);
            const banned: any[] = JSON.parse(minifyJson((await readFile(dir)).toString()));

            for (const player of banned) this.banned.set(player.name, player);
        } catch (error: unknown) {
            this.server.getLogger().error(error);
        }
    }

    public async setBanned(username: string, reason = '') {
        this.banned.set(username, {
            reason
        });

        const writeFile = util.promisify(fs.writeFile);
        await writeFile(
            path.join(cwd(), '/banned-players.json'),
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

        const writeFile = util.promisify(fs.writeFile);
        await writeFile(
            path.join(cwd(), '/banned-players.json'),
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
