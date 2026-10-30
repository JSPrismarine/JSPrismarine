import { layoutAt, resourcePackStackPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

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
 * The wire layout is the `resourcePackStackPacket` definition in `@jsprismarine/protocol`.
 * There is a single pack list; the behavior pack list that older protocols sent ahead of it
 * is gone.
 */
export default class ResourcePackStackPacket extends FieldNetworkPacket {
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

    /** Reads the layout's payload and maps each entry's `uuid` onto `packId`. */
    public decodePayload(): void {
        const read = layoutAt(resourcePackStackPacket, this.codecProtocol).decode(this);
        this.texturePackRequired = read.texturePackRequired;
        this.texturePackList = read.texturePacks.map((pack) => ({
            packId: pack.uuid,
            version: pack.version,
            subPackName: pack.subPackName
        }));
        this.baseGameVersion = read.gameVersion;
        this.experiments = read.experiments;
        this.experimentsAlreadyEnabled = read.experimentsAlreadyEnabled;
        this.includeEditorPacks = read.includeEditorPacks;
    }

    /** Writes the packet's fields through the layout, mapping `packId` back onto `uuid`. */
    public encodePayload(): void {
        layoutAt(resourcePackStackPacket, this.codecProtocol).encode(this, {
            texturePackRequired: this.texturePackRequired,
            texturePacks: this.texturePackList.map((pack) => ({
                uuid: pack.packId,
                version: pack.version,
                subPackName: pack.subPackName
            })),
            gameVersion: this.baseGameVersion,
            experiments: this.experiments,
            experimentsAlreadyEnabled: this.experimentsAlreadyEnabled,
            includeEditorPacks: this.includeEditorPacks
        });
    }
}
