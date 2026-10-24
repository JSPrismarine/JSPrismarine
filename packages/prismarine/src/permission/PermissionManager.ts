import fs from 'node:fs';

import JSON5 from 'json5';

import { PlayerNotFoundError } from '@jsprismarine/errors';
import Console from '../Console';
import type { Player, Server, Service } from '../';
import { withCwd } from '../utils/cwd';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';

interface OpType {
    name: string;
}

const PERMISSION_FILE_NAME = 'permissions.json';
const OPS_FILE_NAME = 'ops.json';

/**
 * Anything that can be checked for command permissions: the console or a player-like object
 * exposing operator status and granted permissions.
 */
export type PermissionSubject = Console | Pick<Player, 'isOp' | 'getPermissions'>;

/**
 * Build a permission check for an executer. The console always passes; operators and holders
 * of `*` always pass; otherwise the permission matches when the subject holds it, a parent
 * scope of it, or a parent scope wildcard such as `namespace.scope.*`.
 *
 * @param executer - The console or player to check.
 * @returns An object whose `execute` method takes a permission string and reports whether the executer may run it. `not().execute` negates the result. A missing permission string always passes.
 * @throws Error when `execute` is called and the executer is undefined.
 */
export function canExecute(executer?: PermissionSubject) {
    const execute = (permission?: string) => {
        if (!executer) throw new Error(`Executer can't be undefined or null`);

        if (!permission) return true;
        if (executer instanceof Console) return true;
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
    };

    return {
        execute,
        not: () => {
            return {
                execute: (permission?: string) => !execute(permission)
            };
        }
    };
}

/**
 * Permission manager.
 */
export class PermissionManager implements Service {
    private readonly server: Server;
    private readonly ops: Set<string> = new Set();
    private readonly permissions: Map<string, string[]> = new Map();
    private defaultPermissions: string[] = [];
    private defaultOperatorPermissions: string[] = [];

    /**
     * Create a new permission manager.
     * @param {Server} server - The server instance.
     */
    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * Enable the manager and load all permissions.
     * @returns {Promise<void>} A promise that resolves when the manager is enabled.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.parseOps();
        await this.parsePermissions();
    }

    /**
     * Signifies that the manager is being disabled and all permissions should be unloaded.
     * @returns {Promise<void>} A promise that resolves when the manager is disabled.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.ops.clear();
        this.permissions.clear();
        this.defaultPermissions = [];
    }

    /**
     * Get the default permissions.
     * @returns {string[]} The default permissions.
     */
    public getDefaultPermissions(): string[] {
        return this.defaultPermissions;
    }

    /**
     * Get a player's permissions.
     * @param {Player} player - The player to get permissions for.
     * @returns {Promise<string[]>} A promise that resolves with the player's permissions.
     */
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
            if (!fs.existsSync(withCwd(PERMISSION_FILE_NAME))) {
                this.server.getLogger().warn(`Failed to load permissions list!`);
                fs.writeFileSync(
                    // FIXME: This overwrites comments in the file.
                    withCwd(PERMISSION_FILE_NAME),
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

            const permissionsObject: Partial<{
                defaultPermissions: string[];
                defaultOperatorPermissions: string[];
                players: Array<{
                    name: string;
                    permissions: string[];
                }>;
            }> = JSON5.parse((await fs.promises.readFile(withCwd(PERMISSION_FILE_NAME))).toString());

            this.defaultPermissions = permissionsObject.defaultPermissions || [];
            this.defaultOperatorPermissions = permissionsObject.defaultOperatorPermissions || ['*'];
            permissionsObject.players?.map((player) =>
                this.permissions.set(player.name, player.permissions.length <= 0 ? [] : player.permissions)
            );
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid ${PERMISSION_FILE_NAME} file.`);
        }
    }

    private async parseOps(): Promise<void> {
        try {
            if (!fs.existsSync(withCwd(OPS_FILE_NAME))) {
                this.server.getLogger().warn(`Failed to load operators list!`);
                fs.writeFileSync(withCwd(OPS_FILE_NAME), '[]');
            }
            const ops: OpType[] = JSON5.parse((await fs.promises.readFile(withCwd(OPS_FILE_NAME))).toString());

            ops.map((op) => this.ops.add(op.name));
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid ${OPS_FILE_NAME} file.`);
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
        if (!target) throw new PlayerNotFoundError(username);
        const event = new playerToggleOperatorEvent(target, op);
        this.server.post(['playerToggleOperator', event]);
        if (event.isCanceled()) return false;

        await target.getNetworkSession().sendAvailableCommands();

        if (op) this.ops.add(username);
        else this.ops.delete(username);

        try {
            await fs.promises.writeFile(
                // FIXME: This overwrites comments in the file.
                withCwd(OPS_FILE_NAME),
                JSON.stringify(
                    Array.from(this.ops.values()).map((name) => ({
                        name,
                        level: 4
                    })),
                    null,
                    4
                )
            );

            await target.sendSettings();
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
     * @param executer - The player or console to check.
     * @returns An object with an execute method that takes a permission string and returns whether the executer can execute the command.
     */
    public can(executer?: PermissionSubject) {
        return canExecute(executer);
    }
}
