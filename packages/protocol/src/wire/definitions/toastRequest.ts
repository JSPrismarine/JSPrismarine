/**
 * `ToastRequestPacket`: Asks the client to show a toast notification, the small overlay the game
 * uses for achievements and friend activity.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ToastRequestPacket` field list. */
export const toastRequestPacket = definePacket('ToastRequestPacket', {
    /** `Title`: the heading of the toast. */
    title: t.string,
    /** `Content`: the body text of the toast. */
    content: t.string
});

/** Asks the client to show a toast notification, the small overlay the game uses for achievements and friend activity. */
export type ToastRequestPayload = PayloadOf<typeof toastRequestPacket>;
