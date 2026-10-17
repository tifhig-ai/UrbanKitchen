import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolDir, '..');
const dataPath = path.join(root, 'data', 'current-menu.json');
const indexPath = path.join(root, 'index.html');
const menuPath = path.join(root, 'menu.html');
const menu = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const displayPrice = (item) => item.priceLabel || (Number.isFinite(item.price) ? `$${item.price}` : '');
const itemName = (item) => `${escapeHtml(item.name)}${item.gf ? ' *' : ''}`;

const renderItem = (item) => {
  const description = item.description ? `<p>${escapeHtml(item.description)}</p>` : '';
  const options = item.options ? `<p class="menu-item-options">${escapeHtml(item.options)}</p>` : '';
  return `<div class="menu-item"><h4>${itemName(item)}</h4>${description}${options}<span>${escapeHtml(displayPrice(item))}</span></div>`;
};

const renderGroup = (group) => {
  const title = group.title ? `<h4 class="menu-group-title">${escapeHtml(group.title)}</h4>` : '';
  const note = group.note ? `<p class="micro-note menu-group-note">${escapeHtml(group.note)}</p>` : '';
  const classes = group.compact ? 'menu-grid sides-grid' : 'menu-grid';
  const items = group.items.map(renderItem).join('\n                ');
  return `<section class="menu-group">${title}${note}${group.items.length ? `<div class="${classes}">\n                ${items}\n              </div>` : ''}</section>`;
};

const renderTabs = () => menu.panels.map((panel, index) => `
            <button class="menu-tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-menu-tab="${escapeHtml(panel.id)}">
              ${escapeHtml(panel.label)}
            </button>`).join('');

const renderPanels = () => menu.panels.map((panel, index) => `
            <article class="menu-panel${index === 0 ? ' is-active' : ''}" data-menu-panel="${escapeHtml(panel.id)}" tabindex="0">
              <div class="panel-head"><h2>${escapeHtml(panel.title)}</h2><p>${escapeHtml(panel.note)}</p></div>
              ${panel.groups.map(renderGroup).join('\n              ')}
            </article>`).join('');

const renderMenu = () => `<!-- GENERATED_MENU_START: edit data/current-menu.json, then run node tools/render-website-menu.mjs -->
        <div class="menu-shell reveal" data-menu-version="${escapeHtml(menu.version)}">
          <p class="menu-updated">${escapeHtml(menu.updatedLabel)}</p>
          <div class="menu-tabs" role="tablist" aria-label="Menu categories">${renderTabs()}
          </div>
          <div class="menu-panels">${renderPanels()}
          </div>
          <div class="menu-notes">
            ${menu.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('\n            ')}
          </div>
        </div>
        <!-- GENERATED_MENU_END -->`;

const renderHighlights = () => `<!-- GENERATED_HIGHLIGHTS_START: edit data/current-menu.json, then run node tools/render-website-menu.mjs -->
        <div class="home-menu-highlights reveal">
          ${menu.highlights.map((item) => `<article class="featured-dish">
            <span>${escapeHtml(item.category)}</span>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <strong>${escapeHtml(displayPrice(item))}</strong>
          </article>`).join('\n          ')}
        </div>
        <!-- GENERATED_HIGHLIGHTS_END -->`;

const schemaSections = menu.panels.flatMap((panel) => panel.groups
  .filter((group) => group.items.length)
  .map((group) => ({
    '@type': 'MenuSection',
    name: group.title || panel.title,
    hasMenuItem: group.items.map((item) => {
      const result = {
        '@type': 'MenuItem',
        name: item.name,
      };
      if (item.description) result.description = item.description;
      if (Number.isFinite(item.price)) {
        result.offers = {
          '@type': 'Offer',
          price: String(item.price),
          priceCurrency: 'USD',
        };
      }
      return result;
    }),
  })));

const schema = {
  '@context': 'https://schema.org',
  '@type': 'Menu',
  '@id': 'https://urbankitchen-pg.com/menu#menu',
  name: 'Urban Kitchen Menu',
  url: 'https://urbankitchen-pg.com/menu',
  inLanguage: 'en-US',
  provider: {
    '@type': 'Restaurant',
    '@id': 'https://urbankitchen-pg.com/#restaurant',
    name: 'Urban Kitchen',
    telephone: '+1-801-406-2010',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '425 S. North County, Suite D',
      addressLocality: 'Pleasant Grove',
      addressRegion: 'UT',
      addressCountry: 'US',
    },
  },
  hasMenuSection: schemaSections,
};

const replaceMarkedOrLegacy = (source, startMarker, endMarker, replacement, legacyStart, legacyEnd) => {
  const markedStart = source.indexOf(startMarker);
  if (markedStart !== -1) {
    const markedEnd = source.indexOf(endMarker, markedStart);
    if (markedEnd === -1) throw new Error(`Missing ${endMarker}`);
    let resume = markedEnd + endMarker.length;
    while (source[resume] === '\n' || source[resume] === '\r') resume += 1;
    return source.slice(0, markedStart) + replacement + '\n\n' + source.slice(resume);
  }
  const start = source.indexOf(legacyStart);
  const end = source.indexOf(legacyEnd, start);
  if (start === -1 || end === -1) throw new Error(`Could not locate legacy block: ${legacyStart}`);
  return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
};

let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = replaceMarkedOrLegacy(
  indexHtml,
  '<!-- GENERATED_HIGHLIGHTS_START:',
  '<!-- GENERATED_HIGHLIGHTS_END -->',
  renderHighlights(),
  '        <div class="home-menu-highlights reveal">',
  '        <div class="home-menu-actions reveal">',
);

const hiddenMenuStart = indexHtml.indexOf('        <div class="menu-shell reveal">');
if (hiddenMenuStart !== -1) {
  const gallerySectionStart = indexHtml.indexOf('      <section class="section gallery-section"', hiddenMenuStart);
  const homeSectionEnd = indexHtml.lastIndexOf('      </section>', gallerySectionStart);
  if (gallerySectionStart === -1 || homeSectionEnd === -1 || homeSectionEnd < hiddenMenuStart) {
    throw new Error('Could not locate the homepage menu section end.');
  }
  indexHtml = `${indexHtml.slice(0, hiddenMenuStart)}        <!-- Full menu content is generated on menu.html from data/current-menu.json. -->\n${indexHtml.slice(homeSectionEnd)}`;
}
fs.writeFileSync(indexPath, indexHtml);

let menuHtml = fs.readFileSync(menuPath, 'utf8');
const schemaStart = menuHtml.indexOf('<script type="application/ld+json">') !== -1
  ? menuHtml.indexOf('<script type="application/ld+json">')
  : menuHtml.indexOf('<script id="menu-structured-data" type="application/ld+json">');
const schemaEnd = menuHtml.indexOf('</script>', schemaStart);
if (schemaStart === -1 || schemaEnd === -1) throw new Error('Could not locate menu structured data.');
const schemaMarkup = `<script id="menu-structured-data" type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n    </script>`;
menuHtml = menuHtml.slice(0, schemaStart) + schemaMarkup + menuHtml.slice(schemaEnd + '</script>'.length);

menuHtml = replaceMarkedOrLegacy(
  menuHtml,
  '<!-- GENERATED_MENU_START:',
  '<!-- GENERATED_MENU_END -->',
  renderMenu(),
  '        <div id="old-menu-mount"',
  '      </section>\n\n      <section class="menu-seo-section"',
);

menuHtml = menuHtml.replace(
  /Every plate is prepared to order\.[\s\S]*?nightly dinner in Pleasant Grove, Utah\./,
  'Every plate is prepared to order. Browse the current brunch, drinks, kids, sides, and nightly dinner menus for Urban Kitchen in Pleasant Grove, Utah.',
);

const seoStart = menuHtml.indexOf('      <section class="menu-seo-section"');
if (seoStart !== -1) {
  const seoEnd = menuHtml.indexOf('      </section>', seoStart);
  if (seoEnd === -1) throw new Error('Could not locate menu SEO section end.');
  const seoMarkup = `      <section class="menu-seo-section" aria-label="Urban Kitchen brunch and dinner menu highlights">
        <div class="menu-seo-intro">
          <p class="section-kicker">Brunch and Dinner in Pleasant Grove</p>
          <h2>brunch by day, dinner every night</h2>
          <p>Start with breakfast, sweet or savory brunch, sandwiches, salads, fresh juice, coffee, and kids meals. Return for Croatian and Mediterranean inspired small plates, steaks, chicken, pork, seafood, pasta, and desserts at dinner.</p>
        </div>
        <div class="menu-seo-grid">
          <article><h3>Breakfast favorites</h3><p>The Basic, Urban Benedict, Breakfast Burrito, Flatiron Steak &amp; Eggs, Berry Mascarpone French Toast, and skillets anchor the brunch menu.</p></article>
          <article><h3>Fresh juice and specialty drinks</h3><p>Choose fresh-squeezed orange juice, rotating fruit-and-orange blends, seasonal specialty coffee, zero-proof Red Bull mocktails, chai, matcha, tea, and hot chocolate.</p></article>
          <article><h3>Lunch and lighter plates</h3><p>Sandwiches, soup, Burrata Salad, and Classic Caesar cover quick lunches and slower midday gatherings.</p></article>
          <article><h3>Dinner every night</h3><p>Dinner features tuna tartare, salads, prime filet mignon, braised short rib, chicken, porchetta, seafood risotto, pasta, and desserts.</p></article>
        </div>
        <div class="menu-seo-links">
          <a class="button button-dark" href="location.html">Hours &amp; Directions</a>
          <a class="button button-outline-dark" href="reservations.html">Reserve a Table</a>
        </div>
      </section>`;
  menuHtml = menuHtml.slice(0, seoStart) + seoMarkup + menuHtml.slice(seoEnd + '      </section>'.length);
}

fs.writeFileSync(menuPath, menuHtml);
console.log(`Rendered ${menu.panels.length} menu panels from ${path.relative(root, dataPath)}.`);
