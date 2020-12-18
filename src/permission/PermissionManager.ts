import fs from 'fs';
import path from 'path';
import util from 'util';
import type Prismarine from '../Prismarine';
import type Player from '../player/Player';

interface OpType {
    name: string;
}

export default class PermissionManager {
    private server: Prismarine;
    private ops: Set<string> = new Set();
    private permissions: Map<string, string> = new Map();

    public constructor(server: Prismarine) {
        this.server = server;
    }

    public async onEnable(): Promise<void> {
        await this.parseOps();
    }

    public async onDisable(): Promise<void> {
        this.ops.clear();
        this.permissions.clear();
    }

    private async parseOps(): Promise<void> {
        try {
            if (!fs.existsSync(path.join(process.cwd(), '/ops.json'))) {
                this.server.getLogger().warn(`Failed to load operators list!`);
                fs.writeFileSync(path.join(process.cwd(), '/ops.json'), '[]');
            }

            const readFile = util.promisify(fs.readFile);
            const ops: Array<OpType> = JSON.parse(
                (
                    await readFile(path.join(process.cwd(), '/ops.json'))
                ).toString()
            );

            ops.map((op) => this.ops.add(op.name));
        } catch (err) {
            this.server.getLogger().error(err);
            throw new Error(`Invalid ops.json file.`);
        }
    }

    public async setOp(username: string, op: boolean): Promise<boolean> {
        if (!op) this.ops.delete(username);
        else this.ops.add(username);

        const writeFile = util.promisify(fs.writeFile);

        try {
            await writeFile(
                path.join(process.cwd(), '/ops.json'),
                JSON.stringify(
                    Array.from(this.ops.values()).map((name) => ({
                        name,
                        level: 4
                    })),
                    null,
                    4
                )
            );
            return true;
        } catch {
            return false;
        }
    }

    public isOp(player: Player): boolean {
        return !player.isPlayer() ?? this.ops.has(player.getUsername());
    }

    public can(player: Player): any {
        return {
            execute: async (permission?: string) => {
                if (!player.isPlayer()) return true; // We're the console or a plugin

                if (!permission) return true;

                if (this.ops.has(player.getUsername())) return true;

                // TODO: handle permissions
            }
        };
    }
}
