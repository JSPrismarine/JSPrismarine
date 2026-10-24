import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class UpdateAdventureSettingsPacket extends DataPacket {
    public static NetID = Identifiers.UpdateAdventureSettingsPacket;

    public noAttackingMobs!: boolean;
    public noAttackingPlayers!: boolean;
    public worldImmutable!: boolean;
    public showNameTags!: boolean;
    public autoJump!: boolean;

    public encodePayload(): void {
        this.writeBoolean(this.noAttackingMobs);
        this.writeBoolean(this.noAttackingPlayers);
        this.writeBoolean(this.worldImmutable);
        this.writeBoolean(this.showNameTags);
        this.writeBoolean(this.autoJump);
    }

    public decodePayload(): void {
        this.noAttackingMobs = this.readBoolean();
        this.noAttackingPlayers = this.readBoolean();
        this.worldImmutable = this.readBoolean();
        this.showNameTags = this.readBoolean();
        this.autoJump = this.readBoolean();
    }
}
