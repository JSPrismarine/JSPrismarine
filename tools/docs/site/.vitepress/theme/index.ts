import DefaultTheme from 'vitepress/theme';

import './brand.css';
import './site-menu/site-menu.css';
import AudienceTabs from './components/AudienceTabs.vue';
import BentoGrid from './components/BentoGrid.vue';
import BentoTile from './components/BentoTile.vue';
import BrandButton from './components/BrandButton.vue';
import CopyButton from './components/CopyButton.vue';
import LatestRelease from './components/LatestRelease.vue';
import PackageDirectory from './components/PackageDirectory.vue';
import ParityBars from './components/ParityBars.vue';
import ReleaseNotes from './components/ReleaseNotes.vue';
import PrismMark from './components/PrismMark.vue';
import TerminalWindow from './components/TerminalWindow.vue';
import Ticker from './components/Ticker.vue';
import ContributorList from './ContributorList.vue';
import Layout from './Layout.vue';
import ParityTracker from './ParityTracker.vue';

/** Brand components are global so any HTML-enabled page can use them; docs/brand lists them. */
const brandComponents = {
    AudienceTabs,
    BentoGrid,
    BentoTile,
    BrandButton,
    CopyButton,
    LatestRelease,
    PackageDirectory,
    ParityBars,
    PrismMark,
    ReleaseNotes,
    TerminalWindow,
    Ticker
};

export default {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app }) {
        app.component('ContributorList', ContributorList);
        app.component('ParityTracker', ParityTracker);
        for (const [name, component] of Object.entries(brandComponents)) app.component(name, component);
    }
};
