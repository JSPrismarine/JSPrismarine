import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type EmoteListPacket from '../packet/emote-list';

export default class EmoteListHandler {
    static NetID = Identifiers.EmoteListPacket;

    static handle(
        packet: EmoteListPacket,
        server: Prismarine,
        player: Player
    ) {}
}
