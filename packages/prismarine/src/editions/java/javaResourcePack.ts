/**
 * The resource pack exchange with a Java client: the server pushes its converted pack during
 * configuration and waits for the client's answer before it finishes, as vanilla's
 * `ServerResourcePackConfigurationTask` does, and pushes a new pack in play when the installed
 * packs change.
 */
import {
    ConfigurationDisconnect,
    ConfigurationResourcePackPush,
    ConfigurationResourcePackResponse,
    FinishConfiguration,
    isTerminalResourcePackAction,
    JavaResourcePackAction
} from '@jsprismarine/protocol/java/packet/configuration';
import {
    PlayDisconnect,
    PlayResourcePackPop,
    PlayResourcePackPush,
    PlayResourcePackResponse
} from '@jsprismarine/protocol/java/packet/play';

import type { JavaResourcePack } from '../../resourcePacks/JavaResourcePacks';
import type { JavaConnection } from './JavaConnection';
import type { JavaContext, JavaPacketHandler } from './handler/JavaPacketHandler';
import { javaHandler } from './handler/JavaPacketHandler';

/** Where a client reached the server, as its handshake names it: the address and port it dialed. */
export interface JavaServerAddress {
    readonly host: string;
    readonly port: number;
}

/** The converted resource pack a server offers its Java clients. */
export interface JavaResourcePackOffer {
    /** The pack to offer now, or undefined for none. */
    current(): Promise<JavaResourcePack | undefined>;
    /** The URL a client that reached the server at an address downloads a pack from. */
    urlOf(pack: JavaResourcePack, address: JavaServerAddress | undefined): string;
    /** Whether a player must take the pack, which `texturepack-required` says for both editions. */
    required(): boolean;
}

/** What a connection's client has of the server's pack: the one it loaded, and the one it is answering. */
export interface JavaResourcePackState {
    loaded?: JavaResourcePack;
    pending?: JavaResourcePack;
}

/** The key the vanilla client words a declined required pack with. */
const DECLINED_REQUIRED = { translate: 'multiplayer.requiredTexturePrompt.disconnect' } as const;

/** Sends `Finish Configuration`, after which the client acknowledges and enters play. */
const finishConfiguration = (connection: JavaConnection): void => {
    connection.send(FinishConfiguration, {});
    connection.configured = true;
};

/**
 * Ends configuration, pushing the server's pack first when it has one, so the client downloads it
 * before it joins. The answer then finishes the configuration.
 */
export const offerResourcePackOrFinish = async ({ connection, services }: JavaContext): Promise<void> => {
    const offer = services.options.resourcePacks;
    const pack = await offer?.current().catch((error: unknown) => {
        services.options.log.warn(`No Java resource pack to offer: ${String(error)}`);
        return undefined;
    });
    if (offer === undefined || pack === undefined) {
        finishConfiguration(connection);
        return;
    }
    connection.resourcePack = { ...connection.resourcePack, pending: pack };
    connection.send(ConfigurationResourcePackPush, {
        id: pack.id,
        url: offer.urlOf(pack, connection.address),
        hash: pack.sha1,
        required: offer.required(),
        prompt: null
    });
};

/**
 * Applies the client's final answer about the pack it was pushed: a loaded pack becomes the one it
 * has. A declined pack the server requires ends the connection, as vanilla's server does; any other
 * answer, a failed download included, lets the player go on without it.
 *
 * @returns Whether the connection stays open.
 */
const answered = (
    connection: JavaConnection,
    pack: JavaResourcePack,
    action: JavaResourcePackAction,
    { services }: JavaContext
): boolean => {
    const state = connection.resourcePack ?? {};
    state.pending = undefined;
    connection.resourcePack = state;
    if (action === JavaResourcePackAction.SuccessfullyLoaded) {
        state.loaded = pack;
        return true;
    }
    services.options.log.debug(
        `${connection.profile?.name ?? `Java connection ${connection.transport.id}`} answered resource pack ${pack.id} with ${JavaResourcePackAction[action]}`
    );
    return !(action === JavaResourcePackAction.Declined && services.options.resourcePacks?.required() === true);
};

/** The answers to the pushed pack, in both phases. */
export const RESOURCE_PACK_HANDLERS: readonly JavaPacketHandler[] = [
    javaHandler(ConfigurationResourcePackResponse, async ({ id, action }, context) => {
        const { connection } = context;
        const pack = connection.resourcePack?.pending;
        if (pack === undefined || pack.id !== id || !isTerminalResourcePackAction(action)) return;
        if (!answered(connection, pack, action, context)) {
            connection.send(ConfigurationDisconnect, { reason: DECLINED_REQUIRED });
            return connection.close();
        }
        finishConfiguration(connection);
    }),
    javaHandler(PlayResourcePackResponse, async ({ id, action }, context) => {
        const { connection } = context;
        const pack = connection.resourcePack?.pending;
        if (pack === undefined || pack.id !== id || !isTerminalResourcePackAction(action)) return;
        const before = connection.resourcePack?.loaded;
        if (!answered(connection, pack, action, context)) {
            connection.send(PlayDisconnect, { reason: DECLINED_REQUIRED });
            return connection.close();
        }
        // The old pack drew what the player saw while the new one loaded; only now does it go.
        if (action === JavaResourcePackAction.SuccessfullyLoaded && before !== undefined && before.id !== pack.id)
            connection.send(PlayResourcePackPop, { id: before.id });
    })
];

/**
 * Brings a client in play up to the server's current pack: pushes the new one, keeping the old one
 * loaded until the client answers, or removes the old one when the server has none left.
 */
export const updateResourcePack = async (connection: JavaConnection, offer: JavaResourcePackOffer): Promise<void> => {
    const pack = await offer.current();
    const state = connection.resourcePack ?? {};
    connection.resourcePack = state;
    // A pack the client is still downloading that the server no longer wants goes now, before the
    // reference to it is replaced: its answer would match nothing, and nothing would remove it.
    const pending = state.pending;
    if (pending !== undefined && pending.id !== pack?.id && pending.id !== state.loaded?.id) {
        connection.send(PlayResourcePackPop, { id: pending.id });
        state.pending = undefined;
    }
    if (pack === undefined) {
        if (state.loaded !== undefined) connection.send(PlayResourcePackPop, { id: state.loaded.id });
        state.loaded = undefined;
        return;
    }
    if (state.loaded?.id === pack.id || state.pending?.id === pack.id) return;
    state.pending = pack;
    connection.send(PlayResourcePackPush, {
        id: pack.id,
        url: offer.urlOf(pack, connection.address),
        hash: pack.sha1,
        required: offer.required(),
        prompt: null
    });
};
