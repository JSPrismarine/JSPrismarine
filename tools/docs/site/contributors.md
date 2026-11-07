---
title: Contributors
description: The people who build JSPrismarine.
---

<script setup>
import { data } from './contributors.data.mts';
</script>

# Contributors

These people write the code, the tests and the documentation behind JSPrismarine. The list comes from
GitHub's contributor graph and is refreshed on every docs build, ordered by commit count.

<ContributorList :contributors="data.contributors" :repo="data.repo" />
