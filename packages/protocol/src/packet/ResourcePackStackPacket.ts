import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { Experiment } from '@jsprismarine/minecraft';

export type { Experiment };

/** One entry of the `Texture Pack List`, as the docs' `PackInstanceId`. */
export interface ResourcePackStackEntry {
    /** `Pack ID`, the pack's UUID. */
    uuid: string;
    /** `Version`, the pack's SemVer version. */
    version: string;
    /** `Sub Pack Name`, empty when the pack has no sub pack selected. */
    subPackName: string;
}

/** The fields of `ResourcePackStackPacket`, in wire order. */
export interface ResourcePackStack {
    /** `Texture Pack Required`. When true the client must download the packs or leave. */
    texturePackRequired: boolean;
    /** `Texture Pack List`, applied in order with the first entry on top. */
    texturePacks: ResourcePackStackEntry[];
    /** `Base Game Version`, the game version the stack applies to. Vanilla sends `*`. */
    gameVersion: string;
    /** `Experiments` toggles: active toggles followed by always-on ones. */
    experiments: Experiment[];
    /** `ExperimentsEverToggled`, whether any experiment was ever toggled in this world. */
    experimentsAlreadyEnabled: boolean;
    /** `Include Editor Packs`, whether an Editor world adds the vanilla editor packs to the stack. */
    includeEditorPacks: boolean;
}

/**
 * The order the packs are applied in, sent once the client says it has them all.
 *
 * Protocol 2193 layout, in wire order: `Texture Pack Required` boolean, `Texture Pack List`
 * as a varuint count of `PackInstanceId` entries (`Pack ID`, `Version`, `Sub Pack Name`
 * strings), `Base Game Version` string, `Experiments` (`Toggles` as a uint32 little endian
 * count of `Name` string and `Enabled` boolean pairs, then `ExperimentsEverToggled` boolean),
 * and `Include Editor Packs` boolean. The experiments count is the one field in this packet
 * that is not a varint.
 *
 * One list, not two. 748 sent the behavior packs ahead of the texture packs, and a reader
 * that still expects them takes the texture pack count for the behavior pack count and every
 * field after it is read from the wrong place, which on an empty stack means running off the
 * end of an eleven byte packet.
 */
export default class ResourcePackStackPacket extends NetworkPacket<ResourcePackStack> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACK_STACK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePackStack): void {
        stream.writeBoolean(data.texturePackRequired);

        stream.writeUnsignedVarInt(data.texturePacks.length);
        for (const entry of data.texturePacks) {
            stream.writeString(entry.uuid);
            stream.writeString(entry.version);
            stream.writeString(entry.subPackName);
        }

        stream.writeString(data.gameVersion);

        // Little endian 32 bits, unlike every other count in this packet, which are varints.
        stream.writeUnsignedIntLE(data.experiments.length);
        for (const experiment of data.experiments) {
            stream.writeString(experiment.name);
            stream.writeBoolean(experiment.enabled);
        }

        stream.writeBoolean(data.experimentsAlreadyEnabled);
        stream.writeBoolean(data.includeEditorPacks);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ResourcePackStack {
        const texturePackRequired = stream.readBoolean();

        const texturePacks: ResourcePackStackEntry[] = [];
        let packCount = stream.readUnsignedVarInt();
        while (packCount-- > 0) {
            texturePacks.push({
                uuid: stream.readString(),
                version: stream.readString(),
                subPackName: stream.readString()
            });
        }

        const gameVersion = stream.readString();

        const experiments: Experiment[] = [];
        let experimentCount = stream.readUnsignedIntLE();
        while (experimentCount-- > 0) {
            experiments.push({ name: stream.readString(), enabled: stream.readBoolean() });
        }

        return {
            texturePackRequired,
            texturePacks,
            gameVersion,
            experiments,
            experimentsAlreadyEnabled: stream.readBoolean(),
            includeEditorPacks: stream.readBoolean()
        };
    }
}
