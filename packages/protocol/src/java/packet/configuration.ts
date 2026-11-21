/**
 * The configuration phase, between login and play: the client learns the registries, the tags and
 * the enabled features it needs before it can read a play packet. Ids come from the release's
 * generated table.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { custom, list, record } from '../../wire/fieldTypes';
import { PACKETS } from '../versions/26.3/packets';
import { javaString, textComponent, varInt } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Identifier`: a namespaced id, such as `minecraft:overworld`. */
export const identifier = javaString(32_767);

/** `Disconnect (configuration)` (clientbound): ends the connection, with the reason as a text component. */
export const ConfigurationDisconnect = defineJavaPacket(
    'Disconnect (configuration)',
    PACKETS.configuration.clientbound.disconnect,
    { reason: textComponent }
);

/** One data pack, as the known packs exchange names it. */
const knownPack = record({ namespace: javaString(32_767), id: javaString(32_767), version: javaString(32_767) });

/** `Clientbound Known Packs`: the packs the server's registries come from. */
export const ClientboundKnownPacks = defineJavaPacket(
    'Clientbound Known Packs',
    PACKETS.configuration.clientbound.select_known_packs,
    { packs: list(knownPack) }
);

/** `Serverbound Known Packs`: the ones of those the client has, so their contents need not be sent. */
export const ServerboundKnownPacks = defineJavaPacket(
    'Serverbound Known Packs',
    PACKETS.configuration.serverbound.select_known_packs,
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

/** `Registry Data`: one registry's entries, in the order their network ids follow. */
export const RegistryData = defineJavaPacket('Registry Data', PACKETS.configuration.clientbound.registry_data, {
    registry: identifier,
    entries: list(record({ id: identifier, data: noEntryData }))
});

/** `Update Tags (configuration)`: each registry's tags, as lists of network ids. */
export const UpdateTags = defineJavaPacket(
    'Update Tags (configuration)',
    PACKETS.configuration.clientbound.update_tags,
    {
        registries: list(
            record({ registry: identifier, tags: list(record({ name: identifier, entries: list(varInt) })) })
        )
    }
);

/** `Feature Flags`: the features the server turned on, such as `minecraft:vanilla`. */
export const FeatureFlags = defineJavaPacket(
    'Feature Flags',
    PACKETS.configuration.clientbound.update_enabled_features,
    { features: list(identifier) }
);

/** `Clientbound Plugin Message (configuration)`: a channel and its bytes, such as `minecraft:brand`. */
export const ClientboundPluginMessage = defineJavaPacket(
    'Clientbound Plugin Message (configuration)',
    PACKETS.configuration.clientbound.custom_payload,
    {
        channel: identifier,
        data: custom<Buffer>(
            'Byte Array',
            (s, v) => s.write(v),
            (s) => s.readRemaining()
        )
    }
);

/** `Finish Configuration` (clientbound): the server has sent everything; the client acknowledges and enters play. */
export const FinishConfiguration = defineJavaPacket(
    'Finish Configuration',
    PACKETS.configuration.clientbound.finish_configuration,
    {}
);

/** `Acknowledge Finish Configuration` (serverbound): the client has switched to play. */
export const AcknowledgeFinishConfiguration = defineJavaPacket(
    'Acknowledge Finish Configuration',
    PACKETS.configuration.serverbound.finish_configuration,
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
