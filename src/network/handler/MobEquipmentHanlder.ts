<<<<<<< HEAD
import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
=======
import Player from "../../player";
import Prismarine from "../../Prismarine";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
import Identifiers from "../Identifiers";

export default class MobEquipmentHandler {
    static NetID = Identifiers.MobEquipmentPacket;

    static handle(packet: any, server: Prismarine, player: Player): void {
        // TODO
    }
}
