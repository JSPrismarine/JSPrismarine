import type Player from '../player/Player';
import type Server from '../Server';
import fs from 'fs';
import path from 'path';
import util from 'util';

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
            if (
                !fs.existsSync(path.join(process.cwd(), '/banned-players.json'))
            ) {
                this.server
                    .getLogger()
                    .warn(`Failed to load ban list!`, 'BanManager/parseBanned');
                fs.writeFileSync(
                    path.join(process.cwd(), '/banned-players.json'),
                    '[]'
                );
            }

            const readFile = util.promisify(fs.readFile);
            const banned: any[] = JSON.parse(
                (
                    await readFile(
                        path.join(process.cwd(), '/banned-players.json')
                    )
                ).toString()
            );

            for (const player of banned) this.banned.set(player.name, player);
        } catch (error) {
            this.server.getLogger().error(error, 'BanManager/parseBanned');
            throw new Error(`Invalid banned-players.json file.`);
        }
    }

    public async setBanned(username: string, reason = '') {
        this.banned.set(username, {
            reason
        });

        const writeFile = util.promisify(fs.writeFile);
        await writeFile(
            path.join(process.cwd(), '/banned-players.json'),
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
            path.join(process.cwd(), '/banned-players.json'),
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
        if (this.banned.has(player.getUsername()))
            return this.banned.get(player.getUsername())?.reason;

        return false;
    }
}
