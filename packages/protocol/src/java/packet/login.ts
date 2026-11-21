/** The login phase. */
import { javaString } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** `Disconnect (login)` (clientbound): refuses a join, with the reason as a JSON text component. */
export const LoginDisconnect = defineJavaPacket('Disconnect (login)', 0x00, { reason: javaString(262_144) });
