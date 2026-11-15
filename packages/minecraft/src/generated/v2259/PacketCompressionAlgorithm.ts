/**
 * PacketCompressionAlgorithm, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.70-preview.24 (Minecraft 1.26.70.24, protocol 2259)
 * Upstream name: PacketCompressionAlgorithm
 */
export enum PacketCompressionAlgorithm {
    ZLIB = 0,
    SNAPPY = 1,
    NONE = 65535
}
