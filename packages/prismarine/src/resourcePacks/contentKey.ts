/**
 * An encrypted resource pack and the key a client decrypts it with.
 *
 * An encrypted pack keeps a cleartext `manifest.json` beside a binary `contents.json`: four bytes
 * of version, the magic `FC B9 CF 9B`, eight bytes of padding, a one-byte length and the content
 * id, the UUID the server must send as the pack's `Content Identity`, then the encrypted file list
 * from offset 256. The client decrypts it with the 32-byte content key the server sends as
 * `Content Key` (docs/research/bedrock-addons-and-custom-content.md, "Encryption and content
 * keys").
 *
 * A Bedrock Dedicated Server takes content keys only from Marketplace entitlements, and sends an
 * empty key for any pack on its disk, so it cannot serve a pack encrypted by anyone else. This
 * server reads the key from a file beside the pack's folder, `<pack folder>.key`, as Geyser reads
 * `<pack>.zip.key` beside a pack.
 */
import { readFileIfPresent } from '../utils/readFileIfPresent';

/** The file at a pack's root that says the pack is encrypted. */
export const CONTENTS_FILE = 'contents.json';

/** The four bytes at offset 4 of an encrypted pack's `contents.json`. */
const CONTENTS_MAGIC = [0xfc, 0xb9, 0xcf, 0x9b] as const;

/** Where the content id's length sits in the header; the id follows it. */
const CONTENT_ID_LENGTH_OFFSET = 16;

/** How long a content key is: AES-256 takes 32 bytes. */
export const CONTENT_KEY_LENGTH = 32;

/**
 * The content id an encrypted pack's `contents.json` names, or undefined when the pack is not
 * encrypted: it has no `contents.json`, or one without the encrypted header.
 * @param contents - The bytes of the pack's `contents.json`, when it has one.
 */
export const encryptedContentId = (contents: Uint8Array | undefined): string | undefined => {
    if (contents === undefined || contents.byteLength <= CONTENT_ID_LENGTH_OFFSET) return undefined;
    if (!CONTENTS_MAGIC.every((byte, index) => contents[4 + index] === byte)) return undefined;
    const length = contents[CONTENT_ID_LENGTH_OFFSET]!;
    const start = CONTENT_ID_LENGTH_OFFSET + 1;
    if (length === 0 || contents.byteLength < start + length) return undefined;
    return new TextDecoder('latin1').decode(contents.subarray(start, start + length));
};

/** The file a pack's content key is read from: `<pack folder>.key`, beside the folder. */
export const contentKeyFileOf = (packDirectory: string): string => `${packDirectory}.key`;

/** A content key as it was read, or why it could not be. */
export type ContentKeyRead = { readonly key: string } | { readonly missing: true } | { readonly invalid: string };

/**
 * Reads the content key of a pack from beside its folder. The file holds the 32 key bytes, which
 * the encryption tools write as text; a line ending after them is ignored.
 * @param packDirectory - The pack's folder on disk.
 */
export const readContentKey = async (packDirectory: string): Promise<ContentKeyRead> => {
    const bytes = await readFileIfPresent(contentKeyFileOf(packDirectory));
    if (bytes === undefined) return { missing: true };
    const key = new TextDecoder('latin1').decode(bytes).replace(/\r?\n$/, '');
    if (key.length !== CONTENT_KEY_LENGTH)
        return { invalid: `it holds ${key.length} bytes, and a content key is ${CONTENT_KEY_LENGTH}` };
    return { key };
};
