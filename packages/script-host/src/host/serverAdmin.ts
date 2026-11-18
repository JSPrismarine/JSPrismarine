/**
 * The behavior of `@minecraft/server-admin` for one pack: `variables` and `secrets`, which read the
 * pack's `config/<script module uuid>/variables.json` and `secrets.json` ({@link readScriptConfig}),
 * `SecretString`, and `transferPlayer`. The allow list, the level storage, the async join event
 * and the operator and kick functions are present and throw `NotImplementedError`
 * ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * The `admin-config` scenario of the parity suite's `scripting.admin` family recorded what the
 * pinned Bedrock Dedicated Server does: `variables.get` returns a copy whose object keys are in
 * byte order, `secrets.get` returns a new `SecretString` each time, and a script never reads a
 * secret's text, which only an HTTP header sends.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import { isRecord } from '../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { FormPlayer } from './minecraftServerUi';
import type { ScriptModuleConfig } from './pack';
import { COMMON } from './serverObjects';
import type { ScriptTransferTarget, ScriptWorld } from './world';

/** The module the implementations here belong to. */
export const SERVER_ADMIN = '@minecraft/server-admin';

/** The tags of the objects this module's members make. */
export const ADMIN_TAG = {
    /** A `SecretString`; its state is {@link secretState} of its text. */
    secret: 40
} as const;

/** What one pack's `@minecraft/server-admin` reaches of the runtime and the world. */
export interface AdminPackHost {
    /** What the pack's `config/` folder says about its script module. */
    readonly config: ScriptModuleConfig;
    readonly world: ScriptWorld;
    /** Makes an instance of one of this module's classes, which the caller frees or releases. */
    create(className: string, tag: number, state: string): ScriptHandle;
    /**
     * Makes a value in the pack's realm from JSON text, with the realm's own `JSON.parse` as it
     * was before any of the pack's code ran. A handle it returns belongs to the caller.
     */
    parse(json: string): ScriptValue;
    /**
     * The player a `Player` argument stands for, by the entity its object carries, or undefined
     * for a value that is not one of the host's players.
     */
    player(value: ScriptValue): FormPlayer | undefined;
}

/** The state of a `SecretString`, which only the host reads. */
export const secretState = (text: string): string => JSON.stringify({ secret: text });

/**
 * The text of a `SecretString`, from its state.
 * @returns Undefined for a state no `SecretString` carries.
 */
export const secretText = (state: string): string | undefined => {
    if (state === '') return undefined;
    // The host wrote every state with JSON.stringify.
    const parsed: unknown = JSON.parse(state);
    return isRecord(parsed) && typeof parsed.secret === 'string' ? parsed.secret : undefined;
};

/** A JSON value with each object's keys in byte order, as BDS's JSON values keep them. */
const sortedJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortedJson);
    if (!isRecord(value)) return value;
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(keys.map((key) => [key, sortedJson(value[key])]));
};

/** A JSON primitive as the engine takes it: a string, a number, a boolean or null. */
const primitive = (value: unknown): ScriptValue =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;

/** The type `transferPlayer`'s options take, as BDS names it in its conversion error. */
const TRANSFER_OPTIONS = 'TransferPlayerIpPortOptions | TransferPlayerNetherNetOptions';

/**
 * Reads `transferPlayer`'s options, which BDS converts as a whole: an object with a hostname and a
 * port in range, or one with a NetherNet id, and nothing else.
 * @throws {TypeError} BDS's conversion error for anything else.
 */
const transferTarget = (call: ScriptCall): ScriptTransferTarget => {
    const json = call.stringify(call.args[1]);
    // The binding wrote it with the engine's JSON.stringify.
    const options: unknown = json === undefined ? undefined : JSON.parse(json);
    if (isRecord(options)) {
        const { hostname, port, netherNetId } = options;
        if (typeof hostname === 'string' && Number.isInteger(port) && typeof port === 'number') {
            if (port >= 0 && port <= 0xffff) return { hostname, port };
        } else if (typeof netherNetId === 'string') {
            return { netherNetId };
        }
    }
    throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: 1, type: TRANSFER_OPTIONS });
};

/**
 * Registers the behavior of one pack's `@minecraft/server-admin` on its implementations.
 * @param implementations - The pack's implementations, which `@minecraft/server`'s are on too.
 */
export const serverAdminImplementations = (
    implementations: ScriptApiImplementations,
    host: AdminPackHost
): ScriptApiImplementations => {
    const { variables, secrets } = host.config;

    return implementations
        .implement(SERVER_ADMIN, 'ServerVariables', 'get', (call) => {
            const name = String(call.args[0]);
            if (!Object.hasOwn(variables, name)) return undefined;
            const value = variables[name];
            if (value === null || typeof value !== 'object') return primitive(value);
            const parsed = host.parse(JSON.stringify(sortedJson(value)));
            return parsed instanceof ScriptHandle ? call.engine.release(parsed) : parsed;
        })
        .implement(SERVER_ADMIN, 'ServerVariables', 'names', { get: () => JSON.stringify(Object.keys(variables)) })
        .implement(SERVER_ADMIN, 'ServerSecrets', 'get', (call) => {
            const name = String(call.args[0]);
            const text = Object.hasOwn(secrets, name) ? secrets[name] : undefined;
            if (text === undefined) return undefined;
            return call.engine.release(host.create('SecretString', ADMIN_TAG.secret, secretState(text)));
        })
        .implement(SERVER_ADMIN, 'ServerSecrets', 'names', { get: () => JSON.stringify(Object.keys(secrets)) })
        .implement(SERVER_ADMIN, 'SecretString', 'constructor', (call) => secretState(String(call.args[0])))
        .implement(
            SERVER_ADMIN,
            '',
            'transferPlayer',
            (call) => {
                const player = host.player(call.args[0]);
                if (player === undefined) {
                    throw new ScriptApiError(
                        COMMON,
                        'InvalidArgumentError',
                        'Invalid type passed to argument [0]. Expected type: Player'
                    );
                }
                const target = transferTarget(call);
                if (player.present) host.world.transferPlayer?.(player.id, target);
                return undefined;
            },
            { converts: ['player', 'options'] }
        );
};
