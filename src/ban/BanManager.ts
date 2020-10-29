import fs from "fs";
import path from "path";
import util from "util";
import type Prismarine from "../Prismarine";
import type Player from '../player/Player'

export default class BanManager {
    private server: Prismarine;
    private banned: Map<string, {
        name: string,
        reason: string
    }> = new Map();

    constructor(server: Prismarine) {
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
            if (!fs.existsSync(path.join(process.cwd(), '/banned-players.json')))
                fs.writeFileSync(path.join(process.cwd(), '/banned-players.json'), '[]');

            const readFile = util.promisify(fs.readFile);
            const banned: Array<any> = JSON.parse((await readFile(path.join(process.cwd(), '/banned-players.json'))).toString())

            for (const player of banned)
                this.banned.set(player.uuid, player);
        } catch (err) {
            this.server.getLogger().error(err);
            throw new Error(`Invalid banned-players.json file.`);
        }
    }

    public async setBanned(player: Player, reason = '') {
        if (!player || !player.isPlayer())
            return false;

        this.banned.set(player.getUUID(), {
            reason,
            name: player.getUsername()
        });

        const writeFile = util.promisify(fs.writeFile);
        try {
            await writeFile(path.join(process.cwd(), '/banned-players.json'), JSON.stringify(Array.from(this.banned).map(entry => ({
                uuid: entry[0],
                name: entry[1].name,
                reason: entry[1].reason
            })), null, 4));
        } catch {
            return false;
        }
    }

    public async setUnbanned(username: string) {
        const uuid = Array.from(this.banned).filter(a => a[1].name === username)?.[0]?.[0];
        if (!uuid)
            return false;

        this.banned.delete(uuid);

        const writeFile = util.promisify(fs.writeFile);
        try {
            await writeFile(path.join(process.cwd(), '/banned-players.json'), JSON.stringify(Array.from(this.banned).map(entry => ({
                uuid: entry[0],
                name: entry[1].name,
                reason: entry[1].reason
            })), null, 4));
        } catch {
            return false;
        }
    }


    public isBanned(player: Player) {
        if (this.banned.has(player.getUUID()))
            return this.banned.get(player.getUUID())?.reason;

        return false;
    }
};
