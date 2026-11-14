/**
 * `BookEditPacket`: a player's edit to a book and quill.
 *
 * The payload is the inventory slot of the book, then the operation: a varuint32 selector
 * followed by the fields that selector names. Page indices are ZigZag varint32 values; text
 * fields are varuint32-length-prefixed UTF-8 strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/book-edit-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The book edit operation, numbered as the packet's `oneOf` selector. */
export enum BookEditAction {
    ReplacePage = 0,
    AddPage = 1,
    DeletePage = 2,
    SwapPages = 3,
    Finalize = 4
}

/** Fields carried by one action in a book edit. */
export type BookEditOperation =
    | {
          action: BookEditAction.ReplacePage | BookEditAction.AddPage;
          pageIndex: number;
          pageText: string;
          photoName: string;
      }
    | { action: BookEditAction.DeletePage; pageIndex: number }
    | { action: BookEditAction.SwapPages; pageIndex: number; swapWithIndex: number }
    | { action: BookEditAction.Finalize; title: string; author: string; xuid: string };

/**
 * `Operation`: a varuint32 action selector, then the fields that action carries.
 *
 * Which fields follow depends on the selector's value, and an unknown selector is a decode
 * error, so the union is one wire type.
 */
const bookEditOperation = t.custom<BookEditOperation>(
    'BookEditOperation',
    (s, operation) => {
        t.varuint32.write(s, operation.action);

        switch (operation.action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                t.varint32.write(s, operation.pageIndex);
                t.string.write(s, operation.pageText);
                t.string.write(s, operation.photoName);
                break;
            case BookEditAction.DeletePage:
                t.varint32.write(s, operation.pageIndex);
                break;
            case BookEditAction.SwapPages:
                t.varint32.write(s, operation.pageIndex);
                t.varint32.write(s, operation.swapWithIndex);
                break;
            case BookEditAction.Finalize:
                t.string.write(s, operation.title);
                t.string.write(s, operation.author);
                t.string.write(s, operation.xuid);
                break;
        }
    },
    (s) => {
        const action = t.varuint32.read(s);

        switch (action) {
            case BookEditAction.ReplacePage:
            case BookEditAction.AddPage:
                return {
                    action,
                    pageIndex: t.varint32.read(s),
                    pageText: t.string.read(s),
                    photoName: t.string.read(s)
                };
            case BookEditAction.DeletePage:
                return { action, pageIndex: t.varint32.read(s) };
            case BookEditAction.SwapPages:
                return { action, pageIndex: t.varint32.read(s), swapWithIndex: t.varint32.read(s) };
            case BookEditAction.Finalize:
                return {
                    action,
                    title: t.string.read(s),
                    author: t.string.read(s),
                    xuid: t.string.read(s)
                };
            default:
                throw new Error(`Unknown book edit action ${action}`);
        }
    }
);

/** The fields sent when a player edits a book and quill. */
export const bookEditPacket = definePacket('BookEditPacket', {
    /** `Book Slot`: the inventory slot containing the book, written as a ZigZag varint32. */
    bookSlot: t.varint32,
    /** `Operation`: the selected edit and the fields specific to that action. */
    operation: bookEditOperation
});

/** Data in a player edit to a book and quill. */
export type BookEditPayload = PayloadOf<typeof bookEditPacket>;
