/** The play phase. Ids come from the release's generated table. */
import { PACKETS } from '../versions/26.3/packets';
import { textComponent } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Disconnect (play)` (clientbound): ends the connection, with the reason as a text component. */
export const PlayDisconnect = defineJavaPacket('Disconnect (play)', PACKETS.play.clientbound.disconnect, {
    reason: textComponent
});
