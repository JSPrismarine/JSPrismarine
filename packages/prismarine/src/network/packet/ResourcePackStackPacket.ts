import { NetworkUtil } from '../../network/NetworkUtil';
import DataPacket from './DataPacket';

import type { Experiment } from '@jsprismarine/minecraft';

/** One entry of the `Texture Pack List`, as the docs' `PackInstanceId`. */
export interface PackInstanceId {
    /** `Pack ID`, the pack's UUID. */
    packId: string;
    /** `Version`, the pack's SemVer version. */
    version: string;
    /** `Sub Pack Name`, empty when the pack has no sub pack selected. */
    subPackName: string;
}

/**
 * Sent in response to `ResourcePackClientResponsePacket` with the order the client applies
 * the packs in.
 *
 * Protocol 2193 layout, in wire order: `Texture Pack Required` boolean, `Texture Pack List`
 * as a varuint count of `PackInstanceId` entries (`Pack ID`, `Version`, `Sub Pack Name`
 * strings), `Base Game Version` string, `Experiments` (`Toggles` as a uint32 little endian
 * count of `Name` string and `Enabled` boolean pairs, then `ExperimentsEverToggled` boolean),
 * and `Include Editor Packs` boolean. The experiments count is the one field in this packet
 * that is not a varint. There is a single pack list; the behavior pack list that older
 * protocols sent ahead of it is gone.
 */
export default class ResourcePackStackPacket extends DataPacket {
    /** `Texture Pack Required`. When true the client must download the packs or leave. */
    public texturePackRequired = false;
    /** `Texture Pack List`, applied in order with the first entry on top. */
    public texturePackList: PackInstanceId[] = [];
    /** `Base Game Version`. Vanilla sends `*`. */
    public baseGameVersion = '*';
    /** `Experiments` toggles: active toggles followed by always-on ones. */
    public experiments: Experiment[] = [];
    /** `ExperimentsEverToggled`, whether any experiment was ever toggled in this world. */
    public experimentsAlreadyEnabled = false;
    /** `Include Editor Packs`, whether an Editor world adds the vanilla editor packs to the stack. */
    public includeEditorPacks = false;

    /** Writes the fields in the protocol 2193 order described on the class. */
    public encodePayload(): void {
        this.writeBoolean(this.texturePackRequired);

        this.writeUnsignedVarInt(this.texturePackList.length);
        for (const pack of this.texturePackList) {
            NetworkUtil.writeString(this, pack.packId);
            NetworkUtil.writeString(this, pack.version);
            NetworkUtil.writeString(this, pack.subPackName);
        }

        NetworkUtil.writeString(this, this.baseGameVersion);

        // The docs mark this count "No size compression": uint32 little endian, not a varint.
        this.writeUnsignedIntLE(this.experiments.length);
        for (const experiment of this.experiments) {
            NetworkUtil.writeString(this, experiment.name);
            this.writeBoolean(experiment.enabled);
        }

        this.writeBoolean(this.experimentsAlreadyEnabled);
        this.writeBoolean(this.includeEditorPacks);
    }

    /** Reads the fields in the protocol 2193 order described on the class. */
    public decodePayload(): void {
        this.texturePackRequired = this.readBoolean();

        this.texturePackList = [];
        let packCount = this.readUnsignedVarInt();
        while (packCount-- > 0) {
            this.texturePackList.push({
                packId: NetworkUtil.readString(this),
                version: NetworkUtil.readString(this),
                subPackName: NetworkUtil.readString(this)
            });
        }

        this.baseGameVersion = NetworkUtil.readString(this);

        this.experiments = [];
        let experimentCount = this.readUnsignedIntLE();
        while (experimentCount-- > 0) {
            this.experiments.push({ name: NetworkUtil.readString(this), enabled: this.readBoolean() });
        }

        this.experimentsAlreadyEnabled = this.readBoolean();
        this.includeEditorPacks = this.readBoolean();
    }
}
