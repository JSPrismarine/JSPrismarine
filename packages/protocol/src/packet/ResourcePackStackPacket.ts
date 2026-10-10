import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ResourcePackStackEntry {
    uuid: string;
    version: string;
    subPackName: string;
}

export interface Experiment {
    name: string;
    enabled: boolean;
}

export interface ResourcePackStack {
    texturePackRequired: boolean;
    texturePacks: ResourcePackStackEntry[];
    /** The game version the stack applies to. Vanilla sends `*`. */
    gameVersion: string;
    experiments: Experiment[];
    experimentsAlreadyEnabled: boolean;
    includeEditorPacks: boolean;
}

/**
 * The order the packs are applied in, sent once the client says it has them all.
 *
 * One list, not two. 748 sent the behaviour packs ahead of the texture packs, and a reader
 * that still expects them takes the texture pack count for the behaviour pack count and every
 * field after it is read from the wrong place - which on an empty stack means running off the
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

        const readList = (): ResourcePackStackEntry[] => {
            const entries: ResourcePackStackEntry[] = [];
            let count = stream.readUnsignedVarInt();
            while (count-- > 0) {
                entries.push({
                    uuid: stream.readString(),
                    version: stream.readString(),
                    subPackName: stream.readString()
                });
            }
            return entries;
        };

        const texturePacks = readList();
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
