import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class ModalFormResponsePacket extends DataPacket {
    public static NetID = Identifiers.ModalFormResponsePacket;

    public formId!: number;
    public formData!: string;
    public cancelReason!: number;

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.formId);
        McpeUtil.writeString(this, this.formData);
    }

    public decodePayload(): void {
        this.formId = this.readUnsignedVarInt();
        const hasData = this.readBoolean();
        if (hasData) this.formData = McpeUtil.readString(this);
        const isCancelled = this.readBoolean();
        if (isCancelled) this.cancelReason = this.readByte();
    }
}
