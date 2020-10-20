import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";

export default class MobEquipmentHandler {
    static NetID = Identifiers.MobEquipmentPacket;

    static handle(packet: any, server: Prismarine, player: Player): void {
        // TODO
    }
}
