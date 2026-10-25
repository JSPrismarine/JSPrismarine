import fs from 'node:fs';

import { PlayerNotFoundError } from '@jsprismarine/errors';
import Console from '../Console';
import type { Player, Server, Service } from '../';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { OpEntry, PlayerPermissions } from '../config/JsonConfigTypes';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from '../config/JsonFile';
import { withCwd } from '../utils/cwd';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');
const isOpEntry = (value: unknown): value is OpEntry =>
    isRecord(value) && typeof value.name === 'string' && typeof value.uuid === 'string';
const isPlayerPermissions = (value: unknown): value is PlayerPermissions =>
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.uuid === 'string' &&
    isStringList(value.permissions);

/**
 * The parts of the server the permission manager uses. A test can hand in these alone.
 */
export type PermissionManagerServer = Pick<Server, 'getLogger' | 'getSessionManager' | 'post'>;

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
    private readonly server: PermissionManagerServer;
    /** UUIDs of players currently recognized as operators. */
    private readonly ops: Set<string> = new Set();
    /** Additional permission grants keyed by player UUID. */
    private readonly permissions: Map<string, string[]> = new Map();
    private defaultPermissions: string[] = [];
    private defaultOperatorPermissions: string[] = [];

    /**
     * Create a new permission manager.
     * @param {PermissionManagerServer} server - The server instance.
     */
    public constructor(server: PermissionManagerServer) {
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
            ...(this.permissions.get(player.getUUID().toString()) ?? []),
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
        this.permissions.set(player.getUUID().toString(), permissions);
    }

    private async parsePermissions(): Promise<void> {
        const file = withCwd(PERMISSION_FILE_NAME);
        try {
            if (!fs.existsSync(file)) {
                this.server.getLogger().warn(`Failed to load permissions list!`);
                await writeJsonFile(file, PermissionManager.defaultPermissionsFile());
            }

            const document = await readJsonFile(file, '{}');
            const permissions = document.get([]);
            if (!isRecord(permissions)) throw new Error(`${PERMISSION_FILE_NAME} must hold an object`);

            this.defaultPermissions = isStringList(permissions.defaultPermissions)
                ? permissions.defaultPermissions
                : [];
            this.defaultOperatorPermissions = isStringList(permissions.defaultOperatorPermissions)
                ? permissions.defaultOperatorPermissions
                : ['*'];
            if (Array.isArray(permissions.players)) {
                for (const player of permissions.players) {
                    if (isPlayerPermissions(player)) this.permissions.set(player.uuid, player.permissions);
                }
            }
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid ${PERMISSION_FILE_NAME} file.`);
        }
    }

    /**
     * What a server without a `permissions.json` starts with, each key explained in the file.
     */
    private static defaultPermissionsFile() {
        const document = parseConfigDocument('json', '{}');
        document.set(
            ['defaultPermissions'],
            [
                'minecraft.command.help',
                'minecraft.command.list',
                'minecraft.command.me',
                'jsprismarine.command.plugins',
                'jsprismarine.command.version',
                'jsprismarine.command.tps'
            ],
            'Permissions every player has. A permission names a command, and `namespace.scope.*` grants a whole scope.'
        );
        document.set(
            ['defaultOperatorPermissions'],
            ['*'],
            'Permissions every operator has on top of the defaults. `*` is all of them.'
        );
        document.set(
            ['players'],
            [{ name: 'filfat', uuid: 'fbf8646c-652c-38c4-96ff-a29d86cb5943', permissions: ['*'] }],
            'Permissions granted to one player by UUID, on top of the defaults.'
        );
        return document;
    }

    private async parseOps(): Promise<void> {
        const file = withCwd(OPS_FILE_NAME);
        try {
            if (!fs.existsSync(file)) {
                this.server.getLogger().warn(`Failed to load operators list!`);
                await writeJsonFile(file, await readJsonFile(file, '[]'));
            }

            const ops = (await readJsonFile(file, '[]')).get([]);
            if (!Array.isArray(ops)) throw new Error(`${OPS_FILE_NAME} must hold a list of operators`);
            for (const op of ops) {
                if (isOpEntry(op)) this.ops.add(op.uuid);
            }
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new Error(`Invalid ${OPS_FILE_NAME} file.`);
        }
    }

    /**
     * Adds or removes one player's line in `ops.json`, leaving the other lines and any comments
     * as they are.
     */
    private async writeOp(uuid: string, username: string, op: boolean): Promise<void> {
        const file = withCwd(OPS_FILE_NAME);
        const document = await readJsonFile(file, '[]');
        const samePlayer = (entry: unknown) => isOpEntry(entry) && entry.uuid === uuid;

        if (op) upsertListEntry(document, samePlayer, { name: username, uuid, level: 4 });
        else removeListEntries(document, samePlayer);

        await writeJsonFile(file, document);
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

        const uuid = target.getUUID().toString();
        if (op) this.ops.add(uuid);
        else this.ops.delete(uuid);

        try {
            await this.writeOp(uuid, username, op);

            await target.sendSettings();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a player is an operator.
     *
     * @param {string} uuid - The player's UUID.
     * @returns {boolean} Whether the player is an operator.
     */
    public isOp(uuid: string): boolean {
        return this.ops.has(uuid);
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
