<script setup lang="ts">
import { withBase } from 'vitepress';

import type { MegaMenu } from './types.ts';

/** A menu's featured link and its sections: the body of a desktop dropdown and of a mobile section. */
defineProps<{ menu: MegaMenu }>();
</script>

<template>
    <a v-if="menu.featured" class="mega-nav__featured" :href="withBase(menu.featured.link)">
        <span class="mega-nav__featured-title">{{ menu.featured.text }}</span>
        <span class="mega-nav__description">{{ menu.featured.description }}</span>
        <code v-if="menu.featured.command" class="mega-nav__command">{{ menu.featured.command }}</code>
    </a>

    <div class="mega-nav__sections">
        <section v-for="section in menu.sections" :key="section.text" class="mega-nav__section">
            <h2 class="mega-nav__heading">{{ section.text }}</h2>
            <a v-for="item in section.items" :key="item.link" class="mega-nav__link" :href="withBase(item.link)">
                <span class="mega-nav__link-title">{{ item.text }}</span>
                <span v-if="item.description" class="mega-nav__description">{{ item.description }}</span>
            </a>
        </section>
    </div>
</template>
