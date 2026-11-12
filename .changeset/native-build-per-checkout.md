---
'@jsprismarine/native-network': patch
---

Give each checkout its own CMake build directory, so `build:native` works in a git worktree whose shared cache holds another checkout's build.
