/**
 * The configuration phase: the brand, the feature flags and the registries the client needs before
 * it can read a play packet, then the step into play.
 */
import {
    AcknowledgeFinishConfiguration,
    brandPayload,
    ConfigurationClientboundKeepAlive,
    ConfigurationClientInformation,
    ConfigurationServerboundKeepAlive,
    ServerboundPluginMessage,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationDisconnect,
    FeatureFlags,
    FinishConfiguration,
    RegistryData,
    ServerboundKnownPacks,
    UpdateTags
} from '@jsprismarine/protocol/java/packet/configuration';
import { PlayDisconnect } from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/newest';

import type { TranslationKey } from '../../../chat/ConsoleText';
import { englishOf } from '../../../chat/ConsoleText';
import { KeepAlive } from '../../../player/KeepAlive';
import { beginPlay, hearPluginMessage } from '../javaPlay';
import { outOfTurn } from './loginHandlers';
import type { JavaContext, JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

/**
 * Opens the configuration phase as a vanilla server does: the brand, the feature flags, and the
 * packs the registries come from, whose answer the `Serverbound Known Packs` handler waits for.
 * Keep-alives start, as they do in play, so a client that stops answering while it configures is
 * dropped too.
 * @param context - The connection that acknowledged its login.
 */
export const beginConfiguration = ({ connection, services }: JavaContext): void => {
    connection.keepAlive = new KeepAlive({
        intervalMs: services.options.keepAliveIntervalMs(),
        ...(services.options.keepAliveTimer === undefined ? {} : { timer: services.options.keepAliveTimer }),
        ping: (id) => connection.send(ConfigurationClientboundKeepAlive, { id }),
        timedOut: () => {
            services.options.log.debug(`Java connection ${connection.transport.id} missed a keep-alive; closing it`);
            connection.send(ConfigurationDisconnect, {
                reason: { translate: 'disconnect.timeout' satisfies TranslationKey }
            });
            void connection.close();
        }
    });
    connection.keepAlive.start();
    connection.send(ClientboundPluginMessage, {
        channel: 'minecraft:brand',
        data: brandPayload(services.options.brand)
    });
    connection.send(FeatureFlags, { features: CONFIGURATION.features });
    connection.send(ClientboundKnownPacks, { packs: CONFIGURATION.knownPacks });
};

/** The client's settings and brand, the keep-alives, the known packs answer and the step into play. */
export const CONFIGURATION_HANDLERS: readonly JavaPacketHandler[] = [
    // Kept for the join: the language and the view distance apply once the player is in the world.
    javaHandler(ConfigurationClientInformation, (information, { connection }) => {
        connection.information = information;
    }),
    javaHandler(ServerboundPluginMessage, (message, context) => hearPluginMessage(message, context)),
    javaHandler(ConfigurationServerboundKeepAlive, ({ id }, { connection }) => {
        connection.keepAlive?.answered(id);
    }),
    /**
     * Sends the registries and tags vanilla sends, once the client says it has the packs they come
     * from. Each entry goes without its data, which the client takes from its own copy of the pack;
     * a client without the pack, such as one of another release, could not read the world, so its
     * join ends here.
     */
    javaHandler(ServerboundKnownPacks, async ({ packs }, { connection }) => {
        const missing = CONFIGURATION.knownPacks.find(
            (needed) =>
                !packs.some(
                    (pack) =>
                        pack.namespace === needed.namespace && pack.id === needed.id && pack.version === needed.version
                )
        );
        if (missing !== undefined) {
            connection.send(ConfigurationDisconnect, {
                reason: `Your client lacks the ${missing.namespace}:${missing.id} ${missing.version} pack this server's world comes from.`
            });
            return connection.close();
        }
        for (const { registry, entries } of CONFIGURATION.registries) {
            connection.send(RegistryData, { registry, entries: entries.map((id) => ({ id, data: null })) });
        }
        connection.send(UpdateTags, { registries: CONFIGURATION.tags });
        connection.send(FinishConfiguration, {});
        connection.configured = true;
    }),

    javaHandler(AcknowledgeFinishConfiguration, async (_acknowledged, context) => {
        const { connection, services } = context;
        // Before the registries, the client could not read a play packet.
        if (connection.configured !== true) throw outOfTurn(connection, AcknowledgeFinishConfiguration);
        connection.phase = 'play';
        // Play has keep-alives of its own, which `beginPlay` starts.
        connection.keepAlive?.stop();
        const world = services.options.world;
        if (world === undefined) {
            // The join ends as it reaches play when the server shows Java clients no world.
            connection.send(PlayDisconnect, { reason: englishOf('jsprismarine.disconnect.java_not_taken') });
            return connection.close();
        }
        await beginPlay(context, world);
    })
];
