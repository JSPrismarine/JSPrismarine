import { NetworkStructure } from '../';
import NetworkBinaryStream from '../NetworkBinaryStream';
import { Experiment } from '@jsprismarine/minecraft';

/**
 * Represents the network structure for experiments.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/Experiments.html}
 */
export default class Experiments extends NetworkStructure {
    public toggled: Array<Experiment> = [];
    public wereEverAlreadyToggled = false;

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedIntLE(this.toggled.length);
        stream.writeBoolean(this.wereEverAlreadyToggled);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        const length = stream.readUnsignedIntLE();
        for (let i = 0; i < length; i++) {
            this.toggled.push(<Experiment>{
                name: stream.readString(),
                enabled: stream.readBoolean()
            });
        }
        this.wereEverAlreadyToggled = stream.readBoolean();
    }
}
