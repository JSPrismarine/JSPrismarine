import Player from "../../player/Player";
import Prismarine from "../../Prismarine";
import Identifiers from "../identifiers";

export default class MobEquipmentHandler {
    static NetID = Identifiers.MobEquipmentPacket;

    static handle(packet: any, server: Prismarine, player: Player): void {
        // TODO
    }
}