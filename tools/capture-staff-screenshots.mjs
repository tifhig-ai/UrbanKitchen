import puppeteer from "puppeteer-core";

const base = process.env.STAFF_DEMO_URL || "http://127.0.0.1:4173";
const outDir = "/opt/cursor/artifacts";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("saved", name);
}

async function enterPin(pin) {
  for (const digit of pin) {
    await page.click(`[data-digit="${digit}"]`);
  }
  await page.click("[data-action=sign-in]");
}

const home = await page.goto(`${base}/`, { waitUntil: "networkidle0" });
if (!home.ok()) throw new Error(`Home returned ${home.status()}`);
const homeText = await page.content();
if (!homeText.includes("Reserve a Table") && !homeText.includes("urban.")) {
  throw new Error("Home page is missing its public content.");
}
const staffLink = await page.$("a.footer-staff");
if (!staffLink) throw new Error("Footer is missing the Staff link.");

await page.goto(`${base}/staff`, { waitUntil: "networkidle0" });
await page.waitForSelector("[data-digit='1']");
const robots = await page.$eval('meta[name="robots"]', (node) => node.content);
if (!robots.includes("noindex")) throw new Error("Staff page is missing noindex.");

await enterPin("1357");
await page.waitForFunction(() => document.body.textContent.includes("Turn on orange juice machine"));
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button.task")].find((node) => node.textContent.includes("Turn on coffee"));
  if (!button) throw new Error("Coffee task was not on the list.");
  button.click();
});
await page.waitForFunction(() => {
  const button = [...document.querySelectorAll("button.task")].find((node) => node.textContent.includes("Turn on coffee"));
  return button?.getAttribute("aria-pressed") === "true" && button.textContent.includes("Maya Chen");
});
await shot("staff_checklist_phone_final");

await page.click("button.text-button");
await page.waitForSelector("[data-digit='1']");
await enterPin("9753");
await page.waitForFunction(() => document.body.textContent.includes("still open") || document.body.textContent.includes("All caught up"));
await page.waitForFunction(() => document.body.textContent.includes("Missed"));
await page.evaluate(() => {
  const scroller = document.querySelector(".staff-main");
  const flag = document.querySelector(".missed-flag");
  const view = scroller.getBoundingClientRect();
  const box = flag.getBoundingClientRect();
  if (box.bottom > view.bottom - 8) scroller.scrollTop += box.bottom - view.bottom + 20;
});
await shot("manager_report_phone_final");

await page.click("[data-tab=team]");
await page.waitForFunction(() => document.body.textContent.includes("Add an employee") && document.body.textContent.includes("Maya Chen"));
await shot("employee_setup_phone_final");

await browser.close();
