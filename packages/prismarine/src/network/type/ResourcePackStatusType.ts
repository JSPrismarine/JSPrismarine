/**
 * The client's answer in a `ResourcePackClientResponsePacket`, numbered one above the wire's
 * alternative index.
 *
 * Mojang's docs name the alternatives differently: `Refused` is `Cancel`, `SendPacks` is
 * `Downloading`, `HaveAllPacks` is `DownloadingFinished` and `Completed` is
 * `ResourcePackStackFinished`. The generated `ResourcePackResponse` enum in
 * `@jsprismarine/minecraft` uses the docs names with these same values.
 */
enum ResourcePackStatusType {
    Refused = 1,
    SendPacks = 2,
    HaveAllPacks = 3,
    Completed = 4
}
export default ResourcePackStatusType;
