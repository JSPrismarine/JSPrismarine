import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import type Player from '../Player';
import type Server from '../Server';
import { cwd } from '../utils/cwd';
import minifyJson from 'strip-json-comments';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';

interface OpType {
    name: string;
}

/**
 * Permission manager.
 *
 * @public
 */
export class PermissionManager {
    private readonly server: Server;
    private readonly ops: Set<string> = new Set();
    private readonly permissions: Map<string, string[]> = new Map();
    private defaultPermissions: string[] = [];
    private defaultOperatorPermissions: string[] = [];

    /**
     * Create a new permission manager.
     * @constructor
     * @param {Server} server - The server instance.
     */
    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * Enable the manager and load all permissions.
     * @returns {Promise<void>} A promise that resolves when the manager is enabled.
     */
    public async onEnable(): Promise<void> {
        await this.parseOps();
        await this.parsePermissions();
    }

    /**
     * Signifies that the manager is being disabled and all permissions should be unloaded.
     * @returns {Promise<void>} A promise that resolves when the manager is disabled.
     */
    public async onDisable(): Promise<void> {
        this.ops.clear();
        this.permissions.clear();
        this.defaultPermissions = [];
    }

    public getDefaultPermissions(): string[] {
        return this.defaultPermissions;
    }

    public async getPermissions(player: Player): Promise<string[]> {
        return [
            ...this.defaultPermissions,
            ...(this.permissions.get(player.getName()) ?? []),
            ...(player.isOp() ? this.defaultOperatorPermissions : [])
        ];
    }

    /**
     * Set a player's permissions.
     *
     * @remarks
     * This will not be saved to the permissions.json file.
     *
     * @param {Player} player - The player to set permissions for.
     * @param {string[]} [permissions=[]] - The permissions to set.
     */
    public setPermissions(player: Player, permissions: string[] = []) {
        this.permissions.set(player.getName(), permissions);
    }

    private async parsePermissions(): Promise<void> {
        try {
            if (!fs.existsSync(path.join(cwd(), '/permissions.json'))) {
                this.server.getLogger().warn(`Failed to load permissions list!`);
                fs.writeFileSync(
                    path.join(cwd(), '/permissions.json'),
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
            } = JSON.parse(minifyJson((await readFile(path.join(cwd(), '/permissions.json'))).toString()));

            this.defaultPermissions = permissionsObject.defaultPermissions || [];
            this.defaultOperatorPermissions = permissionsObject.defaultOperatorPermissions || ['*'];
            permissionsObject.players.map((player) =>
                this.permissions.set(player.name, player.permissions.length <= 0 ? [] : player.permissions)
            );
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid permissions.json file.`);
        }
    }

    private async parseOps(): Promise<void> {
        try {
            if (!fs.existsSync(path.join(cwd(), '/ops.json'))) {
                this.server.getLogger().warn(`Failed to load operators list!`);
                fs.writeFileSync(path.join(cwd(), '/ops.json'), '[]');
            }

            const readFile = util.promisify(fs.readFile);
            const ops: OpType[] = JSON.parse(minifyJson((await readFile(path.join(cwd(), '/ops.json'))).toString()));

            ops.map((op) => this.ops.add(op.name));
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid ops.json file.`);
        }
    }

    /**
     * Set a player as an operator.
     *
     * @param {string} username - The player to set as an operator.
     * @param {boolean} op - Whether the player should be an operator.
     * @returns {Promise<boolean>} A promise that resolves with a boolean indicating whether the operation was successful.
     */
    public async setOp(username: string, op: boolean): Promise<boolean> {
        const target = this.server.getSessionManager().getPlayerByExactName(username); // TODO: by name not exact
        if (target) {
            const event = new playerToggleOperatorEvent(target, op);
            this.server.post(['playerToggleOperator', event]);
            if (event.isCancelled()) return false;

            await target.getNetworkSession().sendAvailableCommands();
        }

        if (op) this.ops.add(username);
        else this.ops.delete(username);

        const writeFile = util.promisify(fs.writeFile);
        try {
            await writeFile(
                path.join(cwd(), '/ops.json'),
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

    /**
     * Check if a player is an operator.
     *
     * @param {string} username - The player to check.
     * @returns {boolean} Whether the player is an operator.
     */
    public isOp(username: string): boolean {
        return this.ops.has(username);
    }

    /**
     * Check if a player can execute a command.
     *
     * @param {Player} executer - The player to check.
     * @returns {object} An object with an execute method that takes a permission string and returns whether the player can execute the command.
     */
    public can(executer: Player) {
        return {
            execute: (permission?: string) => {
                if (!executer) throw new Error(`Executer can't be undefined or null`);

                if (!permission) return true;
                if (executer.isConsole()) return true;
                if (executer.isOp()) return true;
                if (executer.getPermissions().includes(permission)) return true;
                if (executer.getPermissions().includes('*')) return true;

                const split = permission.split('.');
                let scope = '';
                for (const action of split) {
                    if (scope) scope = `${scope}.${action}`;
                    else scope = action;

                    if (executer.getPermissions().includes(scope)) return true;
                    if (executer.getPermissions().includes(`${scope}.*`)) return true;
                }

                return false;
            }
        };
    }
}
