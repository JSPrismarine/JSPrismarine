# @jsprismarine/nethernet

## 0.27.0

### Patch Changes

- [#3743](https://github.com/JSPrismarine/JSPrismarine/pull/3743) [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3758](https://github.com/JSPrismarine/JSPrismarine/pull/3758) [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies

- [#3885](https://github.com/JSPrismarine/JSPrismarine/pull/3885) [`7a64eea`](https://github.com/JSPrismarine/JSPrismarine/commit/7a64eeae4b11f97d653db0b275bb7a051490966c) Thanks [@filiphsps](https://github.com/filiphsps)! - Keep a NetherNet connection whose peer reports `disconnected` for up to 30 seconds, and end it only if the peer stays that way or reaches `failed` or `closed`. A connection used to close 2 seconds after the first `disconnected`, so a player on a phone was dropped when they opened their notifications or put the game in the background, and the game showed "Terracotta" when they came back. `Connection.peerStateChanged` follows the peer's state for the server and the client, and `PEER_RECOVERY_MS` is how long a peer may take to recover.
- Updated dependencies [[`44c0251`](https://github.com/JSPrismarine/JSPrismarine/commit/44c02515fa4810e75de3185001a8490aa7766ebd), [`c836dac`](https://github.com/JSPrismarine/JSPrismarine/commit/c836dac76a41e697fb7c8d1594224cdaf5cdbece), [`edb1160`](https://github.com/JSPrismarine/JSPrismarine/commit/edb116075c62fa251747acaf9d6db80bf1b448c4), [`3a7e94b`](https://github.com/JSPrismarine/JSPrismarine/commit/3a7e94b89acda05d76e99409711ea15afd122c0f), [`88fc786`](https://github.com/JSPrismarine/JSPrismarine/commit/88fc78645d05b732a620dbfcc6ee2a106950c093), [`ddbf63c`](https://github.com/JSPrismarine/JSPrismarine/commit/ddbf63cd7d5c971e4ef224f11c72f5227acc5816), [`f71822e`](https://github.com/JSPrismarine/JSPrismarine/commit/f71822e9a631edf44c55b8fbe70dfc9a728e78cc), [`ffb86ad`](https://github.com/JSPrismarine/JSPrismarine/commit/ffb86ad9e67431eeb9f1568ea66758a5cbffd050), [`cf7fe3c`](https://github.com/JSPrismarine/JSPrismarine/commit/cf7fe3c485a52482dcdbda6da2f822749b256f36), [`7756f1c`](https://github.com/JSPrismarine/JSPrismarine/commit/7756f1c349bb40b381252a231d6fd4b6518ae997), [`6580502`](https://github.com/JSPrismarine/JSPrismarine/commit/6580502b8aa1bab3091d98d581fd3501d5049b36), [`832bd7b`](https://github.com/JSPrismarine/JSPrismarine/commit/832bd7b2e1237f1cc98622cdcb1c21a3a6d37503), [`68a0e1b`](https://github.com/JSPrismarine/JSPrismarine/commit/68a0e1b820981bab5d69830066d824ca937e1021), [`14aeb2c`](https://github.com/JSPrismarine/JSPrismarine/commit/14aeb2cf0b75913f02907de47112af392f517d53), [`c35144a`](https://github.com/JSPrismarine/JSPrismarine/commit/c35144acb33d5b1a6237c523595df8674e349a0f), [`0cd4ddb`](https://github.com/JSPrismarine/JSPrismarine/commit/0cd4ddb62d4a05f212368dbca7f217a8bb3a7f08), [`37722e2`](https://github.com/JSPrismarine/JSPrismarine/commit/37722e2d12c913328b9dfa9776e70b6300868d5e), [`dfe4b85`](https://github.com/JSPrismarine/JSPrismarine/commit/dfe4b85f7b9c075988d0231f4fb48e572e332ce1)]:
  - @jsprismarine/errors@0.27.0
  - @jsprismarine/binaryutils@0.27.0
  - @jsprismarine/logger@0.27.0
  - @jsprismarine/native-network@0.27.0

## 0.26.0

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b)]:
  - @jsprismarine/binaryutils@0.26.0
  - @jsprismarine/errors@0.26.0
  - @jsprismarine/logger@0.26.0
  - @jsprismarine/native-network@0.26.0

## 0.25.0

### Minor Changes

- [#3625](https://github.com/JSPrismarine/JSPrismarine/pull/3625) [`5eeed5b`](https://github.com/JSPrismarine/JSPrismarine/commit/5eeed5b4e108944f872456a1d5cbfd911c000e08) Thanks [@filiphsps](https://github.com/filiphsps)! - The looked-up public address is now a fallback for a player who could not connect. The server looks it up only after a player reaches none of the addresses an answer offered, and gives it to that player's next join beside the configured and dialed addresses, never in place of `server-public-ip`. Before, it looked the address up at every start with `server-public-ip` empty and offered it to any join whose answer had no public address, such as a player on the local network.
  
  `HttpSignaling` passes `sign` a third argument, whether the client's last answer reached it at no address, and takes an `onUnreached` callback. `withAdvertisedCandidates` adds the fallback address whenever it is given, and `tracePeerConnection` takes a callback told whether the client reached an address in the answer.

### Patch Changes

- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`c91513b`](https://github.com/JSPrismarine/JSPrismarine/commit/c91513ba1a3d9cfafc6740c2852b78915f8caf46), [`5c7addc`](https://github.com/JSPrismarine/JSPrismarine/commit/5c7addcfef78e8fa52f9383bef765a22c1264af2), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/native-network@0.25.0
  - @jsprismarine/binaryutils@0.25.0
  - @jsprismarine/logger@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`e1f36b8`](https://github.com/JSPrismarine/JSPrismarine/commit/e1f36b83616149c2e27f4276d423cdb6f43e3ed6), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/native-network@0.24.0
  - @jsprismarine/binaryutils@0.24.0
  - @jsprismarine/logger@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/binaryutils@0.23.2
  - @jsprismarine/logger@0.23.2
  - @jsprismarine/native-network@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/native-network@0.23.1
  - @jsprismarine/binaryutils@0.23.1
  - @jsprismarine/logger@0.23.1

## 0.23.0

### Minor Changes

- [#3241](https://github.com/JSPrismarine/JSPrismarine/pull/3241) [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915) Thanks [@filiphsps](https://github.com/filiphsps)! - Every error the packages throw is now defined in `@jsprismarine/errors`, with a stable code, a `docs` link to its entry in the new error reference at https://jsprismarine.dev/errors/, and the values its message was built from. Each error still extends the class it did, such as `TypeError` or `CorruptionError`, and keeps its message, with three exceptions: `getGametypeName` now names the game mode it refused, the NetherNet signaling server answers a bad join path with `Expected /v1/join/<networkId>`, since braces mark a value in a catalog message, and `SnbtSyntaxError` no longer carries an `offset`.
  
  The error classes a package used to export now come from its catalog in `@jsprismarine/errors`. Import `CorruptionError`, `DatabaseLockedError` and `UnsupportedVersionError` from `@jsprismarine/errors/leveldb`, `LoginRefused` from `@jsprismarine/errors/auth`, `ZipError`, `FilterParseError`, `JsonParseError` and `BrarchiveError` from `@jsprismarine/errors/packs`, and so on for `KernelError`, `ContentError`, `BlockError`, `StructureFormatError`, `SelectorSyntaxError`, `MolangSyntaxError`, `NumberProviderError`, `NativeLibraryError`, `NetherNetUnavailableError`, `UdpPortsError`, `JoinRefusedError`, `UsageError` and `ChunkReadOutOfWindowError`. `LoginRefused` keeps its `detail`, now read from its cause. `@jsprismarine/errors` drops its `Error` class, the `ErrorKind` enum and its six error classes; `getGametypeName` and `getGametypeId` throw `MinecraftErrors.GametypeInvalid`, and `PermissionManager.setOp` throws `PrismarineServerErrors.PlayerNotFound`. `NBTStreamReader.readLength` and `expectInput` take the error class to throw instead of a message, and `fail` in `@jsprismarine/features` takes the error to throw.

- [#3270](https://github.com/JSPrismarine/JSPrismarine/pull/3270) [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the `"./*"` pattern in each export map with an entry for each module another package or the docs import, as ADR 0010 asks. A deep import of any other module no longer resolves. Import it from the package root, or ask for the module to be exported.

### Patch Changes

- [#3380](https://github.com/JSPrismarine/JSPrismarine/pull/3380) [`4e5fda1`](https://github.com/JSPrismarine/JSPrismarine/commit/4e5fda1307c47bdbecdffaf36a4e5883a68b1931) Thanks [@filiphsps](https://github.com/filiphsps)! - `DriverPeer` may give a `roundTripTime()`, and the native driver's peers answer SCTP's smoothed round trip time.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`0afbafd`](https://github.com/JSPrismarine/JSPrismarine/commit/0afbafda42c8517746dcf4ee50ac3de13fe950f9), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`51ba202`](https://github.com/JSPrismarine/JSPrismarine/commit/51ba202baff773329d73211062ceed830d253b4f), [`aef478a`](https://github.com/JSPrismarine/JSPrismarine/commit/aef478a92f329bde9046fe616c9e50923f825dfd), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`8d2ba21`](https://github.com/JSPrismarine/JSPrismarine/commit/8d2ba2182f5887cc4c604156a1651051a6fedbe6), [`86b7426`](https://github.com/JSPrismarine/JSPrismarine/commit/86b74266baedb4972a2b89a2390264589eb85cf5), [`ae489bc`](https://github.com/JSPrismarine/JSPrismarine/commit/ae489bc33e7df476d7166a15729cb4af8d8cf262), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/binaryutils@0.23.0
  - @jsprismarine/native-network@0.23.0
  - @jsprismarine/logger@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`b79964d`](https://github.com/JSPrismarine/JSPrismarine/commit/b79964d727c920cba3537d26dae40a3d9a937c81), [`5d63108`](https://github.com/JSPrismarine/JSPrismarine/commit/5d63108845d1a218c3eca2c17ad3eb11224f54ab), [`c54e7dc`](https://github.com/JSPrismarine/JSPrismarine/commit/c54e7dcbff0c97136fbd7dbf3e6481cbeaf634e8)]:
  - @jsprismarine/native-network@0.22.0
  - @jsprismarine/logger@0.22.0
  - @jsprismarine/binaryutils@0.22.0

## 0.21.0

### Minor Changes

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`4618d1a`](https://github.com/JSPrismarine/JSPrismarine/commit/4618d1a3d00f9d65e8b74ecda0f4d0a8d42fb6bb) Thanks [@filiphsps](https://github.com/filiphsps)! - `server-udp-ports` follows Bedrock Dedicated Server 1.26.70.24, and the new `server-public-ip` names the address NetherNet advertises. A single port now serves every player, a range spreads players over its ports by the fewest players and reuses them once all are in use, and commas join entries whose local ports form one continuous range. Mappings and `server-public-ip` add server-reflexive candidates to each answer as BDS does, and a deprecated `IP:public:local` prefix still works with a warning. A value BDS refuses stops the start with BDS's message; a config whose local ranges have a gap, which used to start, is now refused.
  
  `@jsprismarine/nethernet` adds `PortAllocator`, the `PortSelectionStrategy` interface with `fewestPeers`, `parsePublicIp` and `UdpPortsError`. `parseUdpPorts` takes `server-public-ip` and returns its address and warnings, `PortMapping` no longer carries an address, and `withMappedCandidates` takes the public address. `NetherNetServer` takes `ports`.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`a7c36a7`](https://github.com/JSPrismarine/JSPrismarine/commit/a7c36a726727b2e0ed83514a01f0d4681282b82c) Thanks [@filiphsps](https://github.com/filiphsps)! - NetherNet messages are framed as Bedrock frames them. A message is split at what the peer's `a=max-message-size` allows, 262,143 bytes for a Bedrock client, into at most 255 segments, where it used to be split every 10,000 bytes into at most 256. A message the peer sends on `UnreliableDataChannel` is delivered instead of dropped, as Mojang's guide asks.
  
  A connection now bounds what a peer can make it hold. It closes with `badsegment` on a message longer than `maxMessageBytes`, with `sendbacklog` once more than `maxBufferedBytes` (64 MiB by default) waits unsent, and with `sendfailed` when the channel refuses a segment. The server accepts messages up to the 16 MiB a batch may inflate to, and holds at most 64 KiB for a peer that has not opened.
  
  `SEGMENT_BYTES` is 262,143 and `MAX_MESSAGE_BYTES` is 255 segments of it; code that relied on the old values must change. `segment` takes the segment size, `Reassembler` a limit, and `Connection`, `NetherNetServer` and `NetherNetClient` take `ConnectionOptions`. The package adds `MAX_SEGMENTS`, `segmentBytesFor` and `DEFAULT_MAX_BUFFERED_BYTES`.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`57edf44`](https://github.com/JSPrismarine/JSPrismarine/commit/57edf445a62c1fedee877abb809608cf09be7917) Thanks [@filiphsps](https://github.com/filiphsps)! - `tracePeerConnection` reports a peer that ends before it connects with how far ICE got, so the log tells an answer the client could not reach from a handshake that stalled after the two sides found each other. `DriverPeer` gains `iceState` and `onIceStateChange`, which a driver of your own must implement, and the package exports `IceState`.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`5540fdc`](https://github.com/JSPrismarine/JSPrismarine/commit/5540fdc76d631f026698649b5b93fa0c01d49ab6) Thanks [@filiphsps](https://github.com/filiphsps)! - NetherNet runs on our own implementation of the protocol over libdatachannel, the native WebRTC library in `@jsprismarine/native-network`, and no longer depends on the npm `nethernet` package, werift or `protodef`.
  
  `@jsprismarine/nethernet` adds `NetherNetServer`, `NetherNetClient`, `Connection` with NetherNet's segmentation, `LanDiscovery` and the discovery packet codecs, `SignalStructure` with `SignalType` and `ErrorCode`, and the `WebRtcDriver` interface with `loadNativeDriver`. `adaptPeerConnections` and `constrainIcePorts` are removed, and `tracePeerConnection` takes a driver peer. `HttpSignaling`'s answerer is a `NetherNetServer`.
  
  The server's start stops when the native library cannot load with NetherNet on, and says that `"enable-nethernet": false` runs it on RakNet alone. `jsp-client --latency` and `--loss` work over RakNet only until the client relay lands.

### Patch Changes

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`02054ae`](https://github.com/JSPrismarine/JSPrismarine/commit/02054aebea2845e3a329dc33cd0a860524131c4d) Thanks [@filiphsps](https://github.com/filiphsps)! - `jsp-client --latency` and `--loss` work over NetherNet again. With either set, the client joins through a relay: its WebRTC binds to `127.0.0.1` and offers no candidates, and each of the server's candidates is rewritten to a loopback socket the relay forwards from, so every datagram crosses a Node.js socket the link conditions reach. Without them the client connects directly. `@jsprismarine/nethernet` adds `withoutCandidates` and `withRewrittenCandidates`.

- [#2987](https://github.com/JSPrismarine/JSPrismarine/pull/2987) [`f64fee1`](https://github.com/JSPrismarine/JSPrismarine/commit/f64fee173c2ceec52534f2d3f1632ca6ae298797) Thanks [@filiphsps](https://github.com/filiphsps)! - A NetherNet connection that closes delivers everything sent before it. The native peer connection is deleted only once libdatachannel reports it closed, after its graceful SCTP shutdown, and a connection whose unreliable channel or peer connection goes down first waits for the reliable channel's own close, which comes after its last message. The server no longer waits before it closes a kicked player's connection.

- [#2948](https://github.com/JSPrismarine/JSPrismarine/pull/2948) [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix the published type declarations for TypeScript consumers that resolve with `NodeNext` or `Node16`. Each relative import in the declaration files now names its `.js` module, so the package root exports its members instead of resolving to nothing.

- [#2973](https://github.com/JSPrismarine/JSPrismarine/pull/2973) [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency vite to v8.3.8

- [#2986](https://github.com/JSPrismarine/JSPrismarine/pull/2986) [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.5

- [#3022](https://github.com/JSPrismarine/JSPrismarine/pull/3022) [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update dependency glob to v14.0.6

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`9567c9c`](https://github.com/JSPrismarine/JSPrismarine/commit/9567c9c2c3ee49ef6ac385c1e5978555949188f6) Thanks [@filiphsps](https://github.com/filiphsps)! - `NetherNetServer` waits 10 seconds for a peer to open after its answer, up from 5. That is the default EndstoneMC's NetherNet specification gives for Bedrock's negotiation timeout, and it leaves a player time to answer the prompt to trust the server.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`cdd9d0a`](https://github.com/JSPrismarine/JSPrismarine/commit/cdd9d0a0167b7091f975dc4774e8f31b034101ef) Thanks [@filiphsps](https://github.com/filiphsps)! - A NetherNet server in a container or behind port forwarding takes joins by address without `server-public-ip`. The answer to a join now also offers the address the player typed, read from the signaling request's `Host` header, on the dialed port when NetherNet's UDP port is the signaling port and on the mapped or local port otherwise. Before, such a server offered only its own interface addresses, and the join timed out with `connecterror:15`. A join from a public address that is offered no public address logs a warning that names `server-public-ip`.
  
  `@jsprismarine/nethernet` adds `withDialedCandidates`, `hasPublicCandidate` and `DialedAddress`. `HttpSignaling` passes the dialed address to `sign` as a second argument and takes a `resolve` option for hostnames.

- [`ed7696e`](https://github.com/JSPrismarine/JSPrismarine/commit/ed7696e8695c1b32d30920c30520bbf38baeb535) Thanks [@filiphsps](https://github.com/filiphsps)! - A native call that fails carries the lines libdatachannel logged while it ran in its error, such as the port a peer could not bind, and the server's close reason for a refused offer or answer says why. `loadNativeDriver` and `nativeDriver` take a `log` callback for the warnings and errors no failing call claimed.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`6892f65`](https://github.com/JSPrismarine/JSPrismarine/commit/6892f65f65c3b30d4b8968c587581679bb68d436) Thanks [@filiphsps](https://github.com/filiphsps)! - A NetherNet join's candidates, answer, connection states and opened peer are logged at debug instead of info, so a server at the default log level shows a join only when it fails. A peer that ends before it connects is logged at warn. `tracePeerConnection` passes its callback a second argument that marks such a line.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`ec6a3fc`](https://github.com/JSPrismarine/JSPrismarine/commit/ec6a3fc65784e52eacabe6079b562ba7c1c8a412) Thanks [@filiphsps](https://github.com/filiphsps)! - In online mode, a NetherNet login is accepted only on a connection whose offer was signed with the login's identity key. NetherNet leaves Minecraft's encryption off, and with it the handshake that proves a client holds the key its login names, so a login somebody recorded could be sent again by anybody. The server now keeps the signature the offer's `a=identity` makes over its DTLS fingerprint and checks it against the verified login's key, as gophertunnel does. A client that sends no identity, or one made with another key, is refused with `NOT_AUTHENTICATED`. Offline mode is unchanged.
  
  `@jsprismarine/nethernet` adds `identityProofOf`, `provesKey`, `IdentityProof` and `Connection.provesKey`. `NetherNetServer.handleOffer` takes the proof as an optional third argument and reads it from the offer otherwise, and it now removes `a=identity` from the offer itself before WebRTC sees it.

- [`cdd1c4c`](https://github.com/JSPrismarine/JSPrismarine/commit/cdd1c4ca87301bbc0dd454cb0a8c7945c53876a8) Thanks [@filiphsps](https://github.com/filiphsps)! - NetherNet players on a long or lossy path no longer stall or disconnect after joining. NetherNet now runs on werift 0.27, which fixes SCTP stopping for good after a retransmission timeout and the slowdown on large send bursts. `adaptPeerConnections` keeps `nethernet`'s peer connections working on it. `jsp-client connect` and `bot` take `--network nethernet` to join over NetherNet, and `--latency` and `--loss` to simulate a slow path to the server.

- [#3001](https://github.com/JSPrismarine/JSPrismarine/pull/3001) [`ef55e7a`](https://github.com/JSPrismarine/JSPrismarine/commit/ef55e7ad8b49d9cf0770c6ab079fb5515664b676) Thanks [@filiphsps](https://github.com/filiphsps)! - `HttpSignaling` takes any network ID of up to 128 characters in `POST /v1/join/{networkId}`, as Mojang's guide asks: the ID is an opaque string whose format may change. It used to answer 400 to anything but an unsigned 64-bit integer. The offer it hands to `handleOffer` no longer carries a `networkId`.

- [#3020](https://github.com/JSPrismarine/JSPrismarine/pull/3020) [`1595118`](https://github.com/JSPrismarine/JSPrismarine/commit/1595118071ae6d52fcadc5d6cca38445d4a6a284) Thanks [@filiphsps](https://github.com/filiphsps)! - A NetherNet server with `server-public-ip` empty now looks up its public address when it starts. It asks the web services in `PUBLIC_IP_SERVICES` in turn, stops at the first that answers, and logs the address. A join whose answer would otherwise carry no public address is offered that one. When every service fails, the server logs a warning that names each failure and `server-public-ip`. The new `enable-server-public-ip-lookup` setting turns the lookup off, and with it off the server answers joins as it did before. A server bound to a loopback address does not look anything up.
  
  `@jsprismarine/nethernet` adds `lookupPublicIp`, `PUBLIC_IP_SERVICES`, `PublicIpLookupOptions` and `PublicIpLookupResult`, and `withAdvertisedCandidates`, which adds the mapped, public and dialed candidates to an answer and falls back to a given public address when none of them is public.
- Updated dependencies [[`3d07749`](https://github.com/JSPrismarine/JSPrismarine/commit/3d07749f87f00a669397d4720ca6fb28fbe92545), [`f64fee1`](https://github.com/JSPrismarine/JSPrismarine/commit/f64fee173c2ceec52534f2d3f1632ca6ae298797), [`ce4370c`](https://github.com/JSPrismarine/JSPrismarine/commit/ce4370ce748cd2a122d75d0c674e2e8660d33175), [`5ca8ea8`](https://github.com/JSPrismarine/JSPrismarine/commit/5ca8ea810ac561c9c35ff1648cdf49ffa922379e), [`d82f8b2`](https://github.com/JSPrismarine/JSPrismarine/commit/d82f8b218de94e51ae474d78a44960c93dd33964), [`e069aee`](https://github.com/JSPrismarine/JSPrismarine/commit/e069aeec377e288603352901756e024f8bf7610c), [`1aa2c75`](https://github.com/JSPrismarine/JSPrismarine/commit/1aa2c75624bf48fbae384e920ed9ae53b2cd346c), [`888c0d0`](https://github.com/JSPrismarine/JSPrismarine/commit/888c0d05b726d51dbe9d3fbb414b1f8b5df82f36), [`3c028c9`](https://github.com/JSPrismarine/JSPrismarine/commit/3c028c978f5fc50db06c5bc099aff441b650d714), [`6a29967`](https://github.com/JSPrismarine/JSPrismarine/commit/6a29967baa7fe9bc44acad762e651a4964af037b), [`59f5789`](https://github.com/JSPrismarine/JSPrismarine/commit/59f5789776b57cdcba02bae18ff85b811ad232bc), [`4cd0308`](https://github.com/JSPrismarine/JSPrismarine/commit/4cd0308e0a6f2733e21dc239107323bd79b0d70a), [`7ad176f`](https://github.com/JSPrismarine/JSPrismarine/commit/7ad176f908b8c7946773fa9fa2a942f6ac3cbd45), [`763c07d`](https://github.com/JSPrismarine/JSPrismarine/commit/763c07d5467a638658db0187110d2615160fdd19)]:
  - @jsprismarine/binaryutils@0.21.0
  - @jsprismarine/native-network@0.21.0
  - @jsprismarine/logger@0.21.0

## 0.20.0

### Patch Changes

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`e498e81`](https://github.com/JSPrismarine/JSPrismarine/commit/e498e81b74d4ca6ee2ea27dedc773c6b2fd37ab0) Thanks [@filiphsps](https://github.com/filiphsps)! - New package `@jsprismarine/nethernet` holds the NetherNet pieces a server and a client share: HTTP signaling, the signed `a=identity` on SDP answers, the LAN advertisement codec and the ES384 JSON Web Signatures Bedrock uses. `@jsprismarine/prismarine` uses it for its NetherNet transport and its encryption handshake.

- [#2944](https://github.com/JSPrismarine/JSPrismarine/pull/2944) [`2f505cd`](https://github.com/JSPrismarine/JSPrismarine/commit/2f505cdb9140773af493c3f73890473556bed003) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/auth` covers both ends of a Bedrock login. `XboxAuthProvider` signs in to Xbox Live through prismarine-auth, an optional peer dependency loaded only when a provider signs in, and presents the chain and multiplayer token Minecraft services issue for its key. `createAuthProvider` builds a provider by name, and `KeyedAuthProvider` is the base both providers share. A provider's `getMultiplayerToken()` returns its token, and `@jsprismarine/client` signs its NetherNet offer with it, as a signed-in game client does. The server's login verification moved into the package as `verifyLogin`, exported from `@jsprismarine/auth/server`, beside the values both ends agree on in `@jsprismarine/auth/protocol`.
  
  Every JWT and JWS is now signed, verified and decoded by `jose` rather than by hand or through fast-jwt, which no package depends on any more. `verifyLogin` fetches the issuer's keys through `jose`'s remote key set, and allows a minute of clock drift on a token's expiry as well as its start.
  
  Breaking: `@jsprismarine/prismarine/network/LoginVerifier` is removed; import `verifyLogin`, `LoginRefused`, `MojangKeys` and `useLoginKeys` from `@jsprismarine/auth/server`, and `TOKEN_ISSUER` from `@jsprismarine/auth/protocol`. `MojangKeys` takes a `fetch` implementation instead of a key set loader and a clock. `SessionEncryption.begin` returns a promise.
- Updated dependencies [[`f030c63`](https://github.com/JSPrismarine/JSPrismarine/commit/f030c63e5c6269288d8dc576bddde160eda3cc74)]:
  - @jsprismarine/binaryutils@0.20.0
  - @jsprismarine/logger@0.20.0
