---
'@jsprismarine/leveldb': patch
---

Take over a lock whose owner is gone, instead of refusing to start.

A server killed with no chance to close left its `LOCK` file behind, and every restart after that failed with `DatabaseLockedError` until someone deleted it by hand. Worse in the other direction: LevelDB locks that file with `fcntl` and never writes to it, so a zero-byte `LOCK` is the *normal* state of any world Minecraft has ever opened — treating its presence as "in use" meant refusing to open exactly the worlds this package exists to read.

The lock now records the process that took it, and is only honoured while that process is still running. A lock naming a process that has exited, or holding nothing that identifies one, is stale and gets taken over. Locks held by another server on the same machine, by a second `Database` inside this process, or by a process on another host across shared storage are all still refused — and so is a world the game has open on Windows, where the file cannot be opened at all rather than merely existing.

Verified by killing a child process holding a lock with `SIGKILL` and reopening: the database comes back, along with everything that had reached the write-ahead log.
