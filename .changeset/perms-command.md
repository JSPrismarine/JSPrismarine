---
'@jsprismarine/prismarine': patch
---

Add `/perms`, which manages the groups and users of `permissions.json`: `user <target> info`, `permission set|unset`, `group add|remove` and `meta set|unset` for a user; `group list|create|delete` and `info`, `permission set|unset`, `parent add|remove`, `weight` and `meta set|unset` for a group; and `reload`. A target is a selector naming one online player or a name, with `xbox:`, `java:` and `offline:` to pick a platform when a name is on more than one. `[expires]` is an ISO 8601 instant or a duration from now such as `30d`. The command is gated by `jsprismarine.command.perms` and each subcommand by a node under it, such as `jsprismarine.command.perms.group.delete`.
