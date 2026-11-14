/**
 * The data that backs a packet test where the code departs from Mojang's protocol docs: raw
 * payloads a real Bedrock Dedicated Server sent, and Mojang's pinned enum dump.
 *
 * Packet tests read both through this module so the paths and the dump's parsing have one home.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The pinned 1.26.40 `enums.html` that datagen keeps, which Mojang generated from the game. */
export const ENUM_DUMP_PATH = fileURLToPath(
    new URL('../../../minecraft/datagen/snapshot/0e00fe80f4f3-enums.html', import.meta.url)
);

/** One member of an enum in the dump. */
export interface EnumDumpMember {
    readonly name: string;
    readonly value: number;
}

/**
 * The members of one enum in the pinned dump, in dump order.
 *
 * The dump writes each enum as a row whose first cell is the enum's name and whose second cell is
 * a table of `<td>name</td><td>value</td>` pairs. Throws when the enum is not in the dump, so a
 * renamed enum fails the test instead of passing with no members.
 */
export const enumDumpMembers = (enumName: string): EnumDumpMember[] => {
    const html = readFileSync(ENUM_DUMP_PATH, 'utf8');
    const start = html.indexOf(`<tr><td>${enumName}</td>`);
    if (start === -1) throw new Error(`${enumName} is not in ${ENUM_DUMP_PATH}`);
    const end = html.indexOf('</table></td>', start);

    const members: EnumDumpMember[] = [];
    for (const [, name, value] of html.slice(start, end).matchAll(/<td>([\w: ]+)<\/td>\s*<td>(-?\d+)<\/td>/g)) {
        if (name !== undefined && value !== undefined) members.push({ name, value: Number(value) });
    }
    return members;
};

/** The path of a captured payload: the body of packet `id` as a real server sent it at `protocol`. */
export const capturePath = (protocol: number, id: number): string =>
    fileURLToPath(
        new URL(
            `../../../bedrock-data/src/jsp/v${protocol}/wire/0x${id.toString(16).padStart(2, '0')}.bin`,
            import.meta.url
        )
    );

/** Whether a capture of packet `id` exists at `protocol`. */
export const hasCapture = (protocol: number, id: number): boolean => existsSync(capturePath(protocol, id));

/** The captured payload of packet `id` at `protocol`, without the packet header. */
export const capture = (protocol: number, id: number): Buffer => readFileSync(capturePath(protocol, id));
