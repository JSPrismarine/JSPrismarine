/**
 * The configuration phase, between login and play: the client learns the registries, the tags and
 * the enabled features it needs before it can read a play packet. Ids come from the release's
 * generated table.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { bool, custom, enumOf, int8, list, record, uint8 } from '../../wire/fieldTypes';
import { javaString, long, textComponent, varInt } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Identifier`: a namespaced id, such as `minecraft:overworld`. */
export const identifier = javaString(32_767);

/**
 * `Disconnect (configuration)` (clientbound): ends the connection, with the reason as a text component.
 * @javaSource ClientboundDisconnectPacket.STREAM_CODEC
 */
export const ConfigurationDisconnect = defineJavaPacket(
    'Disconnect (configuration)',
    'configuration/clientbound/disconnect',
    { reason: textComponent }
);

/** One data pack, as the known packs exchange names it. */
const knownPack = record({ namespace: javaString(32_767), id: javaString(32_767), version: javaString(32_767) });

/**
 * `Clientbound Known Packs`: the packs the server's registries come from.
 * @javaSource ClientboundSelectKnownPacks.STREAM_CODEC
 */
export const ClientboundKnownPacks = defineJavaPacket(
    'Clientbound Known Packs',
    'configuration/clientbound/select_known_packs',
    { packs: list(knownPack) }
);

/**
 * `Serverbound Known Packs`: the ones of those the client has, so their contents need not be sent.
 * @javaSource ServerboundSelectKnownPacks.STREAM_CODEC
 */
export const ServerboundKnownPacks = defineJavaPacket(
    'Serverbound Known Packs',
    'configuration/serverbound/select_known_packs',
    { packs: list(knownPack) }
);

/**
 * An entry's data, which this server never sends: every entry it lists is in a pack the client
 * has, so the client takes the data from its own copy. Reading one with data is refused.
 */
const noEntryData: WireType<null> = custom<null>(
    'Prefixed Optional NBT',
    (s) => s.writeBoolean(false),
    (s) => {
        if (s.readBoolean()) throw new ProtocolWireErrors.JavaRegistryEntryHasData();
        return null;
    }
);

/**
 * `Registry Data`: one registry's entries, in the order their network ids follow.
 * @javaSource ClientboundRegistryDataPacket.STREAM_CODEC
 */
export const RegistryData = defineJavaPacket('Registry Data', 'configuration/clientbound/registry_data', {
    registry: identifier,
    entries: list(record({ id: identifier, data: noEntryData }))
});

/**
 * `Update Tags (configuration)`: each registry's tags, as lists of network ids.
 * @javaSource ClientboundUpdateTagsPacket.STREAM_CODEC
 */
export const UpdateTags = defineJavaPacket('Update Tags (configuration)', 'configuration/clientbound/update_tags', {
    registries: list(record({ registry: identifier, tags: list(record({ name: identifier, entries: list(varInt) })) }))
});

/**
 * `Feature Flags`: the features the server turned on, such as `minecraft:vanilla`.
 * @javaSource ClientboundUpdateEnabledFeaturesPacket.STREAM_CODEC
 */
export const FeatureFlags = defineJavaPacket('Feature Flags', 'configuration/clientbound/update_enabled_features', {
    features: list(identifier)
});

/**
 * A plugin message's bytes: whatever is left of the packet, which only the channel's owner reads.
 */
export const pluginData = custom<Buffer>(
    'Byte Array',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/**
 * `Clientbound Plugin Message (configuration)`: a channel and its bytes, such as `minecraft:brand`.
 * @javaSource ClientboundCustomPayloadPacket.CONFIG_STREAM_CODEC
 */
export const ClientboundPluginMessage = defineJavaPacket(
    'Clientbound Plugin Message (configuration)',
    'configuration/clientbound/custom_payload',
    {
        channel: identifier,
        data: pluginData
    }
);

/**
 * `Serverbound Plugin Message (configuration)`: a channel and its bytes, such as the client's
 * `minecraft:brand`.
 * @javaSource ServerboundCustomPayloadPacket.STREAM_CODEC
 */
export const ServerboundPluginMessage = defineJavaPacket(
    'Serverbound Plugin Message (configuration)',
    'configuration/serverbound/custom_payload',
    { channel: identifier, data: pluginData }
);

/** Who the chat shows: every message, only the server's and the commands' own, or none. */
export enum JavaChatVisibility {
    Full = 0,
    System = 1,
    Hidden = 2
}

/** The hand a player holds their main item in. */
export enum JavaMainHand {
    Left = 0,
    Right = 1
}

/** How many particles the client draws. */
export enum JavaParticleStatus {
    All = 0,
    Decreased = 1,
    Minimal = 2
}

/**
 * Vanilla's `ClientInformation`: the client's settings, which it sends as it configures and again
 * whenever the player changes one.
 * @javaSee ClientInformation.write
 */
export const CLIENT_INFORMATION = {
    /** The language, such as `en_us`. */
    language: javaString(16),
    /** The view distance in the client's options, in chunks. */
    viewDistance: int8,
    chatVisibility: enumOf<JavaChatVisibility>(varInt),
    chatColors: bool,
    /** The skin parts shown, one bit each: cape, jacket, sleeves, trouser legs and hat. */
    modelCustomisation: uint8,
    mainHand: enumOf<JavaMainHand>(varInt),
    textFilteringEnabled: bool,
    /** Whether the player may be listed in the server list's sample of online players. */
    allowsListing: bool,
    particleStatus: enumOf<JavaParticleStatus>(varInt)
};

/**
 * `Client Information (configuration)`: the client's settings, before it joins.
 * @javaSource ServerboundClientInformationPacket.STREAM_CODEC
 */
export const ConfigurationClientInformation = defineJavaPacket(
    'Client Information (configuration)',
    'configuration/serverbound/client_information',
    CLIENT_INFORMATION
);

/**
 * `Clientbound Keep Alive (configuration)`: a number the client has to send back, which checks it
 * is still there while it configures.
 * @javaSource ClientboundKeepAlivePacket.STREAM_CODEC
 */
export const ConfigurationClientboundKeepAlive = defineJavaPacket(
    'Clientbound Keep Alive (configuration)',
    'configuration/clientbound/keep_alive',
    { id: long }
);

/**
 * `Serverbound Keep Alive (configuration)`: the number the server sent.
 * @javaSource ServerboundKeepAlivePacket.STREAM_CODEC
 */
export const ConfigurationServerboundKeepAlive = defineJavaPacket(
    'Serverbound Keep Alive (configuration)',
    'configuration/serverbound/keep_alive',
    { id: long }
);

/**
 * `Finish Configuration` (clientbound): the server has sent everything; the client acknowledges and enters play.
 * @javaSource ClientboundFinishConfigurationPacket.STREAM_CODEC
 */
export const FinishConfiguration = defineJavaPacket(
    'Finish Configuration',
    'configuration/clientbound/finish_configuration',
    {}
);

/**
 * `Acknowledge Finish Configuration` (serverbound): the client has switched to play.
 * @javaSource ServerboundFinishConfigurationPacket.STREAM_CODEC
 */
export const AcknowledgeFinishConfiguration = defineJavaPacket(
    'Acknowledge Finish Configuration',
    'configuration/serverbound/finish_configuration',
    {}
);

/**
 * The `minecraft:brand` payload: the server's name as a string.
 * @param brand - The name the client's debug screen shows.
 * @returns The bytes.
 */
export const brandPayload = (brand: string): Buffer => {
    const stream = new BinaryStream();
    javaString(32_767).write(stream, brand);
    return stream.getBuffer();
};

/**
 * Reads a `minecraft:brand` payload, as {@link brandPayload} writes it.
 * @param payload - The plugin message's bytes.
 * @returns The name the server or client goes by.
 */
export const brandOf = (payload: Buffer): string => javaString(32_767).read(new BinaryStream(payload));
