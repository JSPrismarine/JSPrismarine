---
'@jsprismarine/prismarine': patch
---

`JSP_DEBUG_DUMP_PACKETS` writes into a dump directory created readable only by the server's user, and refuses one that is a symbolic link, belongs to another user, or other users can write to. Each dump is a new file with a random suffix, opened so that an existing entry, a symbolic link included, fails the write instead of being followed. A local user could previously make the default directory in the system temp directory first and redirect the dumps onto another file the server could write.
