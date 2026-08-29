import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PUBLIC_URL;
if (!baseUrl) throw new Error("PUBLIC_URL is required");

const root = resolve("..");
const evidenceDir = resolve(root, "submission-evidence");
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

await page.goto(`${baseUrl}/?intro=0`, { waitUntil: "networkidle" });
if (await page.getByText("Load demo", { exact: true }).isVisible()) {
  await page.getByText("Load demo", { exact: true }).click();
}
await page.locator("canvas").waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(2600);
await page.screenshot({ path: resolve(evidenceDir, "01-public-cosmos.png") });

await page.goto(
  `${baseUrl}/?intro=0&focus=pattern-external-accountability-completion`,
  { waitUntil: "networkidle" },
);
await page.locator(".pattern-drawer h2").waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(1600);
await page.screenshot({ path: resolve(evidenceDir, "02-public-focus-evidence.png") });

const report = {
  verdict: pageErrors.length ? "FAIL" : "PASS",
  url: baseUrl,
  cosmos_visible: await page.locator("canvas").isVisible(),
  focus_drawer_visible: await page.locator(".pattern-drawer").isVisible(),
  evidence_rows: await page.locator(".pattern-drawer .evidence-row").count(),
  page_errors: pageErrors,
};
await writeFile(
  resolve(evidenceDir, "public-ui-smoke.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await browser.close();
console.log(JSON.stringify(report, null, 2));
