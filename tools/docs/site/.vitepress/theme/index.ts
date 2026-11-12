import DefaultTheme from 'vitepress/theme';
import type { Component } from 'vue';

import './brand.css';
import './site-menu/site-menu.css';
import type { BrandComponentName } from './brandCatalog';
import AudienceTabs from './components/AudienceTabs.vue';
import BentoGrid from './components/BentoGrid.vue';
import BentoTile from './components/BentoTile.vue';
import BoardingPass from './components/BoardingPass.vue';
import BrandButton from './components/BrandButton.vue';
import CopyButton from './components/CopyButton.vue';
import DemoServer from './components/DemoServer.vue';
import LatestRelease from './components/LatestRelease.vue';
import PackageDirectory from './components/PackageDirectory.vue';
import ParityBars from './components/ParityBars.vue';
import PassingLand from './components/PassingLand.vue';
import ReleaseLine from './components/ReleaseLine.vue';
import ReleaseNotes from './components/ReleaseNotes.vue';
import RouteLine from './components/RouteLine.vue';
import PrismMark from './components/PrismMark.vue';
import TerminalWindow from './components/TerminalWindow.vue';
import Ticker from './components/Ticker.vue';
import WindowBlind from './components/WindowBlind.vue';
import ContributorList from './ContributorList.vue';
import Layout from './Layout.vue';
import ParityTracker from './ParityTracker.vue';

/**
 * Brand components are global so any HTML-enabled page can use them. `brandCatalog.ts` says what each is
 * for, and this has to hold exactly the components it lists: the brand guide's table is generated from it.
 */
const brandComponents = {
    AudienceTabs,
    BentoGrid,
    BentoTile,
    BoardingPass,
    BrandButton,
    CopyButton,
    DemoServer,
    LatestRelease,
    PackageDirectory,
    ParityBars,
    PassingLand,
    PrismMark,
    ReleaseLine,
    ReleaseNotes,
    RouteLine,
    TerminalWindow,
    Ticker,
    WindowBlind
} satisfies Record<BrandComponentName, Component>;

export default {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app }) {
        app.component('ContributorList', ContributorList);
        app.component('ParityTracker', ParityTracker);
        for (const [name, component] of Object.entries(brandComponents)) app.component(name, component);
    }
};
