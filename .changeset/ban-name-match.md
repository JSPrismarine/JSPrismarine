---
'@jsprismarine/prismarine': patch
---

Keep a ban matching the name it was written for after a login adds the account to it. A ban matches a login by name always, and by the account's `kind` and `id` as well once it has them, so a player banned by name before accounts were written stays banned on every platform, and a banned account stays banned after a gamertag change. `/pardon` lifts every ban on a name.
