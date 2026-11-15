/**
 * TitleType, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.70-preview.24 (Minecraft 1.26.70.24, protocol 2259)
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
