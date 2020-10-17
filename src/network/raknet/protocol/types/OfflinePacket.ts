import { MAGIC } from "../../server/RakNetCostants";
import Packet from "./Packet";

export default class OfflinePacket extends Packet {
    private magic!: Buffer;

    protected decodeMagic(): void {
        if (!this.inputStream) {
            throw new Error("No given InputStream");
        } 
        this.magic = this.inputStream.getBuffer().slice(
            this.inputStream.getOffset(), this.inputStream.addOffset(16, true)
        )
    }

    protected encodeMagic(): void {
        this.outputStream.append(MAGIC);
    }

    public isMagicValid(): boolean {
        return this.magic.equals(MAGIC);
    }
}