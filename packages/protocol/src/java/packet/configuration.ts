/** The configuration phase, between login and play. Ids come from the release's generated table. */
import { PACKETS } from '../versions/26.3/packets';
import { textComponent } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Disconnect (configuration)` (clientbound): ends the connection, with the reason as a text component. */
export const ConfigurationDisconnect = defineJavaPacket(
    'Disconnect (configuration)',
    PACKETS.configuration.clientbound.disconnect,
    { reason: textComponent }
);
