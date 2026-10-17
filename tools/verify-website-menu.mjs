import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const data = JSON.parse(read('data/current-menu.json'));
const indexHtml = read('index.html');
const menuHtml = read('menu.html');

assert.equal(data.panels.length, 8, 'Expected eight menu panels.');
assert.equal(new Set(data.panels.map((panel) => panel.id)).size, data.panels.length, 'Menu panel IDs must be unique.');
assert.deepEqual(data.sourceFiles, [
  {
    name: 'brunch-phase1.pdf',
    sha256: '492bb9634adac47bc4158354f784f77386d01e173ce5190528c7e6a1d4aa7c2c',
  },
  {
    name: 'urban-kitchen-dinner-menu-2026-10-02.pdf',
    sha256: '7f0c5f8a76f748320ed363f39e9920917f94bbd9495397ce8e392ddfbe66167f',
  },
  {
    name: 'final - urban-kitchen-specialty-drinks-menu-4.25x11.pdf',
    sha256: '63e4874a2533789c3939c26202c39d961980af9fd710bbdeca495ed1e5bebc8e',
  },
], 'Menu source-file manifest does not match the three approved printed PDFs.');

const allItems = data.panels.flatMap((panel) => panel.groups.flatMap((group) => group.items));
assert.equal(allItems.length, 95, 'Menu item count no longer matches the three approved printed menus.');

const glutenFriendlyItems = allItems.filter((item) => item.gf === true);
assert.equal(glutenFriendlyItems.length, 23, 'Gluten-friendly item count no longer matches the approved brunch PDF.');
assert.ok(
  data.notes.some((note) => note.startsWith('* Can be made gluten-friendly by request.')),
  'The gluten-friendly substitution and shared-kitchen note is missing.',
);

for (const requiredName of ['The Basic', 'Garden Omelet', 'Urban Benedict', 'The Urban Legend', 'MomTok Meltdown', 'Matcha Latte']) {
  assert.ok(allItems.some((item) => item.name === requiredName), `Approved printed-menu item is missing: ${requiredName}`);
}
for (const removedName of ['The Urban', 'Omelet', 'Steak Tartare', 'Tenderloin Tips & Crispy Yuca', 'Tres Leches']) {
  assert.ok(!allItems.some((item) => item.name === removedName), `Item not present on the approved printed menus remains: ${removedName}`);
}

for (const highlight of data.highlights) {
  const menuItem = allItems.find((item) => item.name === highlight.name);
  assert.ok(menuItem, `Homepage highlight is missing from the full menu: ${highlight.name}`);
  assert.equal(menuItem.price, highlight.price, `Homepage and full-menu prices differ for ${highlight.name}.`);
}

assert.equal((indexHtml.match(/GENERATED_HIGHLIGHTS_START/g) || []).length, 1, 'Homepage highlight start marker must appear once.');
assert.equal((indexHtml.match(/GENERATED_HIGHLIGHTS_END/g) || []).length, 1, 'Homepage highlight end marker must appear once.');
assert.equal((menuHtml.match(/GENERATED_MENU_START/g) || []).length, 1, 'Menu start marker must appear once.');
assert.equal((menuHtml.match(/GENERATED_MENU_END/g) || []).length, 1, 'Menu end marker must appear once.');
assert.ok(menuHtml.includes(`data-menu-version="${data.version}"`), 'Rendered menu version is missing.');

for (const stalePattern of [
  'old-menu-mount',
  'typed-menu-archive',
  "fetch('/?menu=old-v2'",
  '$11.50',
  'The Urban, Urban Benedict',
  'Steak Tartare',
  'Tenderloin Tips &amp; Crispy Yuca',
  'Tres Leches',
]) {
  assert.ok(!menuHtml.includes(stalePattern), `Stale menu artifact remains: ${stalePattern}`);
}
assert.ok(!indexHtml.includes('<div class="menu-shell reveal">'), 'Homepage still contains a hidden full-menu copy.');

const tabCount = (menuHtml.match(/data-menu-tab=/g) || []).length;
const panelCount = (menuHtml.match(/data-menu-panel=/g) || []).length;
assert.equal(tabCount, data.panels.length, 'Rendered tab count does not match the source data.');
assert.equal(panelCount, data.panels.length, 'Rendered panel count does not match the source data.');
assert.equal(
  (menuHtml.match(/<h4>[^<]* \*<\/h4>/g) || []).length,
  glutenFriendlyItems.length,
  'Rendered gluten-friendly markers do not match the menu source.',
);

const schemaMatch = menuHtml.match(/<script id="menu-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/);
assert.ok(schemaMatch, 'Menu structured data is missing.');
const schema = JSON.parse(schemaMatch[1]);
assert.equal(schema['@type'], 'Menu', 'Structured data must describe a Menu.');
assert.equal(schema.hasMenuSection.length, data.panels.flatMap((panel) => panel.groups.filter((group) => group.items.length)).length, 'Structured-data section count does not match the menu source.');

console.log(`Verified ${data.panels.length} panels, ${allItems.length} menu items, ${glutenFriendlyItems.length} gluten-friendly markers, homepage highlights, and structured data for ${data.version}.`);
