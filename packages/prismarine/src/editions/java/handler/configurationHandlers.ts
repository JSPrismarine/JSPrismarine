/**
 * The configuration phase: the brand, the feature flags and the registries the client needs before
 * it can read a play packet, then the step into play.
 */
import {
    AcknowledgeFinishConfiguration,
    brandPayload,
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
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';

import { englishOf } from '../../../chat/ConsoleText';
import { beginPlay } from '../javaPlay';
import { outOfTurn } from './loginHandlers';
import type { JavaContext, JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

/**
 * Opens the configuration phase as a vanilla server does: the brand, the feature flags, and the
 * packs the registries come from, whose answer the `Serverbound Known Packs` handler waits for.
 * @param context - The connection that acknowledged its login.
 */
export const beginConfiguration = ({ connection, services }: JavaContext): void => {
    connection.send(ClientboundPluginMessage, {
        channel: 'minecraft:brand',
        data: brandPayload(services.options.brand)
    });
    connection.send(FeatureFlags, { features: CONFIGURATION.features });
    connection.send(ClientboundKnownPacks, { packs: CONFIGURATION.knownPacks });
};

/** The known packs answer and the step into play. The rest, such as the client's settings, nothing reads yet. */
export const CONFIGURATION_HANDLERS: readonly JavaPacketHandler[] = [
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
        const world = services.options.world;
        if (world === undefined) {
            // The join ends as it reaches play when the server shows Java clients no world.
            connection.send(PlayDisconnect, { reason: englishOf('jsprismarine.disconnect.java_not_taken') });
            return connection.close();
        }
        await beginPlay(context, world);
    })
];
