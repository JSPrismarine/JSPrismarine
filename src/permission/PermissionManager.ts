import CommandExecuter from '../command/CommandExecuter';
import Player from '../player/Player';
import type Server from '../Server';
import fs from 'fs';
import path from 'path';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import util from 'util';

interface OpType {
    name: string;
}

export default class PermissionManager {
    private readonly server: Server;
    private readonly ops: Set<string> = new Set();
    private readonly permissions: Map<string, string[]> = new Map();
    private defaultPermissions: string[] = [];
    private defaultOperatorPermissions: string[] = [];

    public constructor(server: Server) {
        this.server = server;
    }

    public async onEnable(): Promise<void> {
        await this.parseOps();
        await this.parsePermissions();
    }

    public async onDisable(): Promise<void> {
        this.ops.clear();
        this.permissions.clear();
        this.defaultPermissions = [];
    }

    public async getPermissions(player: Player): Promise<string[]> {
        return [
            ...this.defaultPermissions,
            ...(this.permissions.get(player.getUsername()) ?? []),
            ...(player.isOp() ? this.defaultOperatorPermissions : [])
        ];
    }

    /**
     * Set player permissions.
     *
     * NOTE: This will not be saved to the permissions.json
     * file as that is to be handled by the plugin author in a plugin-specific file.
     */
    public setPermissions(player: Player, permissions: string[]) {
        this.permissions.set(player.getUsername(), permissions ?? []);
    }

    private async parsePermissions(): Promise<void> {
        try {
            if (!fs.existsSync(path.join(process.cwd(), '/permissions.json'))) {
                this.server
                    .getLogger()
                    .warn(
                        `Failed to load permissions list!`,
                        'PermissionManager/parsePermissions'
                    );
                fs.writeFileSync(
                    path.join(process.cwd(), '/permissions.json'),
                    JSON.stringify(
                        {
                            defaultPermissions: [
                                'minecraft.command.help',
                                'minecraft.command.list',
                                'minecraft.command.me',
                                'jsprismarine.command.plugins',
                                'jsprismarine.command.version',
                                'jsprismarine.command.tps'
                            ],
                            defaultOperatorPermissions: ['*'],
                            players: [
                                {
                                    name: 'filfat',
                                    permissions: ['*']
                                }
                            ]
                        },
                        null,
                        4
                    )
                );
            }

            const readFile = util.promisify(fs.readFile);
            const permissionsObject: {
                defaultPermissions: string[];
                defaultOperatorPermissions: string[];
                players: Array<{
                    name: string;
                    permissions: string[];
                }>;
            } = JSON.parse(
                (
                    await readFile(
                        path.join(process.cwd(), '/permissions.json')
                    )
                ).toString()
            );

            this.defaultPermissions =
                permissionsObject.defaultPermissions || [];
            this.defaultOperatorPermissions = permissionsObject.defaultOperatorPermissions || [
                '*'
            ];
            permissionsObject.players.map((player) =>
                this.permissions.set(
                    player.name,
                    player.permissions.length <= 0 ? [] : player.permissions
                )
            );
        } catch (error) {
            this.server
                .getLogger()
                .error(error, 'PermissionManager/parsePermissions');
            throw new Error(`Invalid permissions.json file.`);
        }
    }

    private async parseOps(): Promise<void> {
        try {
            if (!fs.existsSync(path.join(process.cwd(), '/ops.json'))) {
                this.server
                    .getLogger()
                    .warn(
                        `Failed to load operators list!`,
                        'PermissionManager/parseOps'
                    );
                fs.writeFileSync(path.join(process.cwd(), '/ops.json'), '[]');
            }

            const readFile = util.promisify(fs.readFile);
            const ops: OpType[] = JSON.parse(
                (
                    await readFile(path.join(process.cwd(), '/ops.json'))
                ).toString()
            );

            ops.map((op) => this.ops.add(op.name));
        } catch (error) {
            this.server.getLogger().error(error, 'PermissionManager/parseOps');
            throw new Error(`Invalid ops.json file.`);
        }
    }

    public async setOp(username: string, op: boolean): Promise<boolean> {
        const target = this.server.getPlayerManager().getPlayerByName(username);
        if (target) {
            const event = new playerToggleOperatorEvent(target, op);
            this.server.getEventManager().post(['playerToggleOperator', event]);
            if (event.cancelled) return false;

            await target.getConnection().sendAvailableCommands();
        }

        if (op) this.ops.add(username);
        else this.ops.delete(username);

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

            if (target) await target.sendSettings();
            return true;
        } catch {
            return false;
        }
    }

    public isOp(username: string): boolean {
        return this.ops.has(username);
    }

    public can(executer: CommandExecuter) {
        return {
            execute: (permission?: string | string[]) => {
                if (!permission) return true;
                if (!executer.isPlayer()) return true;
                if (executer.isOp()) return true;

                permission = typeof permission === 'string' ? [ permission ] : permission;
                for (let perm of permission) {
                    if ((executer as Player).getPermissions().includes(perm))
                    return true;
                    if ((executer as Player).getPermissions().includes('*'))
                        return true;

                    const split = perm.split('.');
                    let scope = '';
                    for (const action of split) {
                        if (scope) scope = `${scope}.${action}`;
                        else scope = action;

                        if ((executer as Player).getPermissions().includes(scope))
                            return true;
                        if (
                            (executer as Player)
                                .getPermissions()
                                .includes(`${scope}.*`)
                        )
                            return true;
                    }

                    return false;
                }
            }
        };
    }
}
