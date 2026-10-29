---
'@jsprismarine/bedrock-data': patch
---

Fix what running the containerized Bedrock capture for real turned up. `pnpm run dump:bedrock --`
forwards pnpm's own `--` to the script, which Node's `parseArgs` read as the end of the options and
then rejected `--pass` as a positional, so every documented invocation with a flag failed before it
reached a server, including the `--protocol` one in CI. Only the `packets` pass has a client to let
in, so only it publishes the container's UDP ports now; publishing them for every pass made the
other three fail with `port is already allocated` whenever anything else held 19132. The image is
obtained once before the first pass rather than mid-capture, and a pull that fails because Docker
Desktop's credential helper is not on `PATH` says so instead of reporting a missing executable. The
reference world pass no longer hangs on its fourth tile: the engine's ticking budget fits exactly
three tiles, and releasing areas and creating the next one in the same tick never resolved.
