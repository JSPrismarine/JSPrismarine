/**
 * TitleType, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.51 (Minecraft 1.26.51, protocol 2193)
 * Upstream name: SetTitlePacket::TitleType
 */
export enum TitleType {
    CLEAR = 0,
    RESET = 1,
    TITLE = 2,
    SUBTITLE = 3,
    ACTIONBAR = 4,
    TIMES = 5,
    TITLE_TEXT_OBJECT = 6,
    SUBTITLE_TEXT_OBJECT = 7,
    ACTIONBAR_TEXT_OBJECT = 8
}
