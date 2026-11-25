# @jsprismarine/addon-tools

## 0.26.0

### Patch Changes

- [#3709](https://github.com/JSPrismarine/JSPrismarine/pull/3709) [`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update all non-major dependencies
- Updated dependencies [[`ec53015`](https://github.com/JSPrismarine/JSPrismarine/commit/ec53015a6a6466cc10c65f7ce3df31238b49ac7b), [`6d89071`](https://github.com/JSPrismarine/JSPrismarine/commit/6d89071895723672f4ecc0bbf86e3bbf3d06cb3a)]:
  - @jsprismarine/errors@0.26.0
  - @jsprismarine/packs@0.26.0

## 0.25.0

### Patch Changes

- [#3628](https://github.com/JSPrismarine/JSPrismarine/pull/3628) [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b) Thanks [@filiphsps](https://github.com/filiphsps)! - `jsp-addon build` compiles TypeScript addons. An addon with a `tsconfig.json` is compiled with `tsc-ts` before the build reads it, a compiler error fails the build with `AddonCompileFailed`, and the pack leaves out `package.json`, `tsconfig.json`, `src/`, `node_modules/` and the source maps. `compileAddon` from `@jsprismarine/addon-tools/compile` and `compileAddons` from `@jsprismarine/addon-tools/build` run the step on their own.
- Updated dependencies [[`dda9dbe`](https://github.com/JSPrismarine/JSPrismarine/commit/dda9dbe5ebfdcdc338e37bf24ae8fe561c9308bb), [`2132959`](https://github.com/JSPrismarine/JSPrismarine/commit/2132959244601c90055b091a4273a008eadf0f3d), [`d4adb53`](https://github.com/JSPrismarine/JSPrismarine/commit/d4adb5381a368d2076a0648ce2522c12cf72ab48), [`56f9c4c`](https://github.com/JSPrismarine/JSPrismarine/commit/56f9c4c28271d8a4ed3a1e223132a91f3625829a), [`dcc1390`](https://github.com/JSPrismarine/JSPrismarine/commit/dcc1390bbec407e17107daffdf3280af232df2d9), [`27c272f`](https://github.com/JSPrismarine/JSPrismarine/commit/27c272f90af03738b7fd9778e2bddea955fe9cb6), [`d1e9714`](https://github.com/JSPrismarine/JSPrismarine/commit/d1e97142dcfdab12f895719eca9bcbee78346c9a), [`47aad59`](https://github.com/JSPrismarine/JSPrismarine/commit/47aad598440fd81e5177c60ffeb49972ce697960), [`fc513cf`](https://github.com/JSPrismarine/JSPrismarine/commit/fc513cf74a16caf6f9da30f3323b094c519d1043), [`253f214`](https://github.com/JSPrismarine/JSPrismarine/commit/253f214c096cad79e6f53cd8a88a828b262af315), [`c053dfc`](https://github.com/JSPrismarine/JSPrismarine/commit/c053dfcdd32006386469c31b8448cdfa33b9333f), [`239659a`](https://github.com/JSPrismarine/JSPrismarine/commit/239659a6927aa7f2b713ad994fe92fab0f2cece9), [`fea2fcd`](https://github.com/JSPrismarine/JSPrismarine/commit/fea2fcd1d4424bf4c766ba996e9eb0ceb742310a), [`055b1ca`](https://github.com/JSPrismarine/JSPrismarine/commit/055b1ca984f47515b42af6109ea88a7ec7b4d451), [`f76f4f2`](https://github.com/JSPrismarine/JSPrismarine/commit/f76f4f25eb0449327fcc06b46797588a0b6879ff), [`c6fc056`](https://github.com/JSPrismarine/JSPrismarine/commit/c6fc056233588d453bcb33febae92189ecfc8b4b)]:
  - @jsprismarine/errors@0.25.0
  - @jsprismarine/packs@0.25.0

## 0.24.0

### Minor Changes

- [#3464](https://github.com/JSPrismarine/JSPrismarine/pull/3464) [`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a) Thanks [@filiphsps](https://github.com/filiphsps)! - `addon.json` takes optional listing keys for the addon marketplace: `title`, `tags` from a fixed list (`ADDON_TAGS`), `authors`, `screenshots` under `media/` with alt text, `deprecated` and `replacedBy`. `jsp-addon build` leaves `media/` out of the pack, checks that `pack_icon.png` is a square PNG, and writes the README, icon and screenshots beside each pack as `<name>-<version>.md`, `.png` and `-<n>.<type>`. Each new index entry gains a `listing` that links those files with their SHA-256; the schema stays version 1, since readers drop keys they do not know. A published version whose listing files changed fails the build with `PublishedListingChanged`, as a changed pack does. `--github-output` adds a `listing` output naming the new listing files, and `isAddonInstallId` and `isAddonRepository` check install ids and repositories.

### Patch Changes

- Updated dependencies [[`54ae4dd`](https://github.com/JSPrismarine/JSPrismarine/commit/54ae4dd998002a49935182a1c32a301a9c9a1c3a), [`1f3b347`](https://github.com/JSPrismarine/JSPrismarine/commit/1f3b347d94e934767993eb3506a412b01d334a0b), [`3c19f11`](https://github.com/JSPrismarine/JSPrismarine/commit/3c19f11b712b228563d7af7fc5f6df6995726fe3), [`f4eb592`](https://github.com/JSPrismarine/JSPrismarine/commit/f4eb5921862accbb5e07749c38bd1c63495587a0), [`a19ba96`](https://github.com/JSPrismarine/JSPrismarine/commit/a19ba968ae53bd5c34c9515227a9d08ff7c69e33), [`a64ab41`](https://github.com/JSPrismarine/JSPrismarine/commit/a64ab41bf639ffb0144117810600a4abf306a850), [`05f03f7`](https://github.com/JSPrismarine/JSPrismarine/commit/05f03f78e186000a5e76cc34894a61a384ca5333), [`02d9cb6`](https://github.com/JSPrismarine/JSPrismarine/commit/02d9cb69d53cf22a406dd86e95f08b2bbc48eb5c), [`a29ff83`](https://github.com/JSPrismarine/JSPrismarine/commit/a29ff83b2e5fb9d3cedabc980c4001c5baba4bb5), [`2272a78`](https://github.com/JSPrismarine/JSPrismarine/commit/2272a78ffd0754e8efff802bc7040cb17c7bdf7a), [`b30a127`](https://github.com/JSPrismarine/JSPrismarine/commit/b30a1272d2d0ebee7e6c73c69d6b2c87ba06e9fa), [`64126de`](https://github.com/JSPrismarine/JSPrismarine/commit/64126de681d7b3cfad3f415a3dfa3e5e50afa6ca), [`cce50d8`](https://github.com/JSPrismarine/JSPrismarine/commit/cce50d8d16917a3ad6843be08c35e15af5aab7c4)]:
  - @jsprismarine/errors@0.24.0
  - @jsprismarine/packs@0.24.0

## 0.23.2

### Patch Changes

- Updated dependencies [[`5f48cd1`](https://github.com/JSPrismarine/JSPrismarine/commit/5f48cd10e4ca5b53ef19ebd214b70b1de18acca9)]:
  - @jsprismarine/errors@0.23.2
  - @jsprismarine/packs@0.23.2

## 0.23.1

### Patch Changes

- Updated dependencies [[`fd86ce8`](https://github.com/JSPrismarine/JSPrismarine/commit/fd86ce879e71bb55a64d0b7fd379a2016c8a3d9f), [`8876fae`](https://github.com/JSPrismarine/JSPrismarine/commit/8876faec0d0cbd4232446e5081338461e420450e)]:
  - @jsprismarine/errors@0.23.1
  - @jsprismarine/packs@0.23.1

## 0.23.0

### Patch Changes

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`a22d9dc`](https://github.com/JSPrismarine/JSPrismarine/commit/a22d9dc5080ea9b11b5d55da130a60a47b69120e) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/addon-tools/addonIndex` gains `satisfiesAddonRange`, `isAddonRange` and `addonVersionsInRange`, which read the `^1.2.3`, `~1.2.3`, `1.2.3` and `*` ranges the way npm does. `fetchPublishedIndex` takes the `fetch` to download through, and `@jsprismarine/addon-tools/addon` exports `parseAddonMetadata`, the `addon.json` check the build runs.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`f7d0f10`](https://github.com/JSPrismarine/JSPrismarine/commit/f7d0f10ca3e2596cdb720f7e1c17b7e212b193a8) Thanks [@filiphsps](https://github.com/filiphsps)! - `@jsprismarine/addon-tools/build` exports `readAddons`, which reads and checks every addon in a folder the way `buildAddons` does, in name order, without packing them.

- [#3336](https://github.com/JSPrismarine/JSPrismarine/pull/3336) [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/addon-tools`, which builds JSPrismarine addons. Its `jsp-addon build` command checks each addon's behavior pack and `addon.json`, packs it into `<name>-<version>.mcpack` and writes the `index.json` a server installs from, keeping every published version. `@jsprismarine/addon-tools/addonIndex` parses and validates that index. `@jsprismarine/packs/zip` gains `writeZip`, which writes the same bytes for the same files, and `@jsprismarine/packs/manifest` exports the manifest parser. `@jsprismarine/errors/addon-tools` holds the new errors.
- Updated dependencies [[`60edd7a`](https://github.com/JSPrismarine/JSPrismarine/commit/60edd7a1234650367fe5c2406ee402641be33ed9), [`bf419b8`](https://github.com/JSPrismarine/JSPrismarine/commit/bf419b82bfea52c095ca09b02c1c4ac955ac1d0a), [`c8e1685`](https://github.com/JSPrismarine/JSPrismarine/commit/c8e1685ae8316255d39674af9d00ac8d778f674d), [`af89e9c`](https://github.com/JSPrismarine/JSPrismarine/commit/af89e9cadd3cfd2f6652e79ada341e12ac5f66c8), [`b41035b`](https://github.com/JSPrismarine/JSPrismarine/commit/b41035be9b61570008b3405aa169418b19081915), [`4bda824`](https://github.com/JSPrismarine/JSPrismarine/commit/4bda8241a8631da2d205133c85fd361871d6cf61), [`7e2e6f3`](https://github.com/JSPrismarine/JSPrismarine/commit/7e2e6f3cff1f20a11a3f59aac94c68a33fa71a35), [`3e71a8d`](https://github.com/JSPrismarine/JSPrismarine/commit/3e71a8dd75bd0a97e0f8587666f60f160844ff0b), [`586269e`](https://github.com/JSPrismarine/JSPrismarine/commit/586269e324cddfe57caf4206f387895cda6d479f), [`5d2fb0e`](https://github.com/JSPrismarine/JSPrismarine/commit/5d2fb0eb3730e59260a09e60c130e57e5fdb099c), [`936970c`](https://github.com/JSPrismarine/JSPrismarine/commit/936970c04f98b392e4b753f3c89224da3d03cb49), [`57caf26`](https://github.com/JSPrismarine/JSPrismarine/commit/57caf2632f92e5da55ce6eedc4eb0be3d66190d4), [`4b590cf`](https://github.com/JSPrismarine/JSPrismarine/commit/4b590cf6c529d17d8df20d8eab9b2157dc213a19), [`349a814`](https://github.com/JSPrismarine/JSPrismarine/commit/349a81448bfc8be2f901efe14527b8c9334f11eb), [`56200a6`](https://github.com/JSPrismarine/JSPrismarine/commit/56200a61535d916f0c41a11d077752b194e4c08b), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`c500335`](https://github.com/JSPrismarine/JSPrismarine/commit/c5003358e3a7199593c6ddcdbe4bdf63f8c29fac), [`104bb4d`](https://github.com/JSPrismarine/JSPrismarine/commit/104bb4d4a3dbf7654c19294b4a1d66724d591ad3), [`6787fdd`](https://github.com/JSPrismarine/JSPrismarine/commit/6787fdd6ff50c80110f4951a0cea51214611eea0), [`e090dd7`](https://github.com/JSPrismarine/JSPrismarine/commit/e090dd75379edbfc415d84925e48af29aaa4864e), [`6e758f9`](https://github.com/JSPrismarine/JSPrismarine/commit/6e758f9de80c357c12d992bf473f1bdac86fb274), [`93a1b61`](https://github.com/JSPrismarine/JSPrismarine/commit/93a1b610493f401c4ac62881f70b3dee8c882f33), [`e1c982e`](https://github.com/JSPrismarine/JSPrismarine/commit/e1c982eeed0dfd682b5680c45c69159e21fd9ec0), [`9579362`](https://github.com/JSPrismarine/JSPrismarine/commit/9579362b4070e246d6300d2f4e2dca2ab4715124), [`f18ef7c`](https://github.com/JSPrismarine/JSPrismarine/commit/f18ef7c595f58a267b5371baab96390d0282616d), [`cf88d2f`](https://github.com/JSPrismarine/JSPrismarine/commit/cf88d2f8c2184bd4e116db888d4528fa27f5338d), [`d6c69e4`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c69e43051eb091f0b4a17c0f33799f5944caf3), [`0792e2a`](https://github.com/JSPrismarine/JSPrismarine/commit/0792e2a7e6e5e98729b80df412262fd549ea3cb9), [`1c3be54`](https://github.com/JSPrismarine/JSPrismarine/commit/1c3be5465a2865072ac0f16b4848ee0cd9b6b13a), [`db04d85`](https://github.com/JSPrismarine/JSPrismarine/commit/db04d8520c1d43b88196c14229f36f5c8e71f3c1)]:
  - @jsprismarine/errors@0.23.0
  - @jsprismarine/packs@0.23.0
