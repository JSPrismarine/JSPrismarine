import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import type { Experiment } from '@jsprismarine/minecraft';

/**
 * The experiment toggles of a world, as LevelSettings (field 25) and ResourcePackStackPacket
 * carry them.
 *
 * Protocol 2193 wire order:
 * 0. Toggles: the count as a uint32 LE (the docs mark it "no size compression", so not a
 *    varuint), then per toggle a Name string and an Enabled boolean.
 * 1. ExperimentsEverToggled: boolean, whether any experiment was ever switched on in this world.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/experiments/}
 */
export default class Experiments extends NetworkStructure {
    /** `Toggles`: the active experiments followed by the always-on ones. */
    public toggled: Array<Experiment> = [];
    /** `ExperimentsEverToggled`: whether any experiment was ever switched on in this world. */
    public wereEverAlreadyToggled = false;

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedIntLE(this.toggled.length);
        for (const experiment of this.toggled) {
            stream.writeString(experiment.name);
            stream.writeBoolean(experiment.enabled);
        }
        stream.writeBoolean(this.wereEverAlreadyToggled);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        const length = stream.readUnsignedIntLE();
        for (let i = 0; i < length; i++) {
            this.toggled.push({
                name: stream.readString(),
                enabled: stream.readBoolean()
            });
        }
        this.wereEverAlreadyToggled = stream.readBoolean();
    }
}
