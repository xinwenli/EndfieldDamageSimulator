// Validate local simulator data.
// Usage:
//   node tools/validate-data.mjs
//   node tools/validate-data.mjs --live

import fs from "fs";
import puppeteer from "puppeteer";

const LIVE = process.argv.includes("--live");
const ROOT = new URL("../", import.meta.url);
const PREVIEW_OPERATOR_IDS = new Set(["1280", "1358"]);

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, ROOT), "utf8"));
}

function titleToEnemyId(title) {
  return title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

function issue(list, severity, message) {
  list.push({ severity, message });
}

function validateStatic() {
  const issues = [];
  const operators = readJson("src/data/operators.json");
  const operatorStats = readJson("src/data/operator_stats.json");
  const weapons = readJson("src/data/weapons.json");
  const gears = readJson("src/data/gears.json");
  const enemies = readJson("src/data/enemies.json");
  const setEffects = readJson("src/data/set_effects.json");

  const operatorIds = new Set();
  for (const op of operators) {
    if (operatorIds.has(op.id)) issue(issues, "error", `Duplicate operator id: ${op.id}`);
    operatorIds.add(op.id);
    const isPreview = PREVIEW_OPERATOR_IDS.has(op.id);
    if (!operatorStats[op.id] && !isPreview) issue(issues, "error", `Operator ${op.id} (${op.name}) has no operator_stats entry`);
    if ((!Array.isArray(op.attackSegments) || op.attackSegments.length === 0) && !isPreview) issue(issues, "error", `Operator ${op.id} has no basic attack segments`);
    if (isPreview) continue;

    const skillSets = [
      ...(op.skills || []).map(skill => [`skill ${skill.id}`, skill]),
      ...(op.linkSkill ? [["combo", op.linkSkill]] : []),
      ...(op.ultimate ? [["ultimate", op.ultimate]] : []),
      ...(op.attackSegments || []).map((seg, i) => [`basic segment ${i + 1}`, seg]),
    ];

    for (const [label, skill] of skillSets) {
      if (!Array.isArray(skill.multipliers) || skill.multipliers.length !== 12) {
        issue(issues, "error", `Operator ${op.id} ${label} has ${skill.multipliers?.length ?? 0} multipliers, expected 12`);
      }
    }
  }

  const weaponIds = new Set();
  for (const weapon of weapons) {
    if (weaponIds.has(weapon.id)) issue(issues, "error", `Duplicate weapon id: ${weapon.id}`);
    weaponIds.add(weapon.id);
    for (const skill of weapon.skills || []) {
      if (!Array.isArray(skill.ranks)) {
        issue(issues, "error", `Weapon ${weapon.id} (${weapon.name}) skill ${skill.name} has no ranks array`);
      } else if (skill.ranks.length !== skill.maxRank) {
        issue(issues, "warning", `Weapon ${weapon.id} (${weapon.name}) skill ${skill.name} has ${skill.ranks.length} ranks, maxRank=${skill.maxRank}`);
      }
    }
  }

  const gearIds = new Set();
  for (const gear of gears) {
    if (gearIds.has(gear.id)) issue(issues, "error", `Duplicate gear id: ${gear.id}`);
    gearIds.add(gear.id);
    if (gear.setId && !setEffects[gear.setId]) issue(issues, "error", `Gear ${gear.id} (${gear.name}) references missing set effect ${gear.setId}`);
    if (!Array.isArray(gear.refinement)) issue(issues, "error", `Gear ${gear.id} (${gear.name}) has no refinement array`);
  }

  const enemyIds = new Set();
  for (const enemy of enemies) {
    if (enemyIds.has(enemy.id)) issue(issues, "error", `Duplicate enemy id: ${enemy.id}`);
    enemyIds.add(enemy.id);
    for (const field of ["def", "physicalResist", "heatResist", "electricResist", "cryoResist", "natureResist", "aetherResist", "staggerThreshold"]) {
      if (typeof enemy[field] !== "number" || Number.isNaN(enemy[field])) {
        issue(issues, "error", `Enemy ${enemy.id} (${enemy.name}) has invalid ${field}`);
      }
    }
  }

  return {
    counts: {
      operators: operators.length,
      operatorStats: Object.keys(operatorStats).filter(k => !k.startsWith("_")).length,
      weapons: weapons.length,
      gears: gears.length,
      enemies: enemies.length,
      setEffects: Object.keys(setEffects).length,
    },
    issues,
  };
}

async function fetchWikiGGEnemyTitles() {
  const url = "https://endfield.wiki.gg/api.php?action=query&list=embeddedin&eititle=Template:Enemy%20infobox&format=json&eilimit=500&origin=*";
  const res = await fetch(url, { headers: { "User-Agent": "EndfieldDamageSimulator/validate-data" } });
  if (!res.ok) throw new Error(`wiki.gg enemy list failed: ${res.status}`);
  const data = await res.json();
  return (data.query?.embeddedin || []).map(entry => entry.title).sort();
}

async function fetchOfficialCatalogItems(typeSubId, browser) {
  const catalogUrl = `https://wiki.skland.com/endfield/catalog?mainTypeId=1&subTypeId=${typeSubId}&filterIds=&header=0`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

  let catalogJson = null;
  page.on("response", async (res) => {
    const url = res.url();
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("json") || !url.includes("item/catalog") || !url.includes(`typeSubId=${typeSubId}`)) return;
    try {
      const data = JSON.parse(await res.text());
      if (data.code === 0) catalogJson = data;
    } catch {
      return;
    }
  });

  await page.goto(catalogUrl, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await page.close();

  const rootCatalog = catalogJson?.data?.catalog?.find(c => c.id === "1");
  const typeSub = rootCatalog?.typeSub?.find(t => t.id === String(typeSubId));
  if (!typeSub?.items) throw new Error(`official catalog typeSubId=${typeSubId} was not captured`);
  return typeSub.items;
}

async function validateLive() {
  const issues = [];
  const operators = readJson("src/data/operators.json");
  const weapons = readJson("src/data/weapons.json");
  const gears = readJson("src/data/gears.json");
  const enemies = readJson("src/data/enemies.json");

  const enemyTitles = await fetchWikiGGEnemyTitles();
  const liveEnemyIds = new Set(enemyTitles.map(titleToEnemyId));
  const localEnemyIds = new Set(enemies.map(e => e.id));
  for (const title of enemyTitles) {
    const id = titleToEnemyId(title);
    if (!localEnemyIds.has(id)) issue(issues, "warning", `wiki.gg enemy missing locally: ${title} (${id})`);
  }
  for (const enemy of enemies) {
    if (!liveEnemyIds.has(enemy.id)) issue(issues, "warning", `Local enemy not found in wiki.gg enemy infobox list: ${enemy.name} (${enemy.id})`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const [officialOperators, officialWeapons, officialGears] = await Promise.all([
      fetchOfficialCatalogItems(1, browser),
      fetchOfficialCatalogItems(2, browser),
      fetchOfficialCatalogItems(4, browser),
    ]);

    const catalogChecks = [
      ["operator", operators, officialOperators],
      ["weapon", weapons, officialWeapons],
      ["gear", gears, officialGears],
    ];

    for (const [kind, localItems, officialItems] of catalogChecks) {
      const officialIds = new Set(officialItems.map(item => item.itemId));
      const localIds = new Set(localItems.map(item => item.id));
      for (const item of officialItems) {
        if (!localIds.has(item.itemId)) issue(issues, "warning", `Official CN ${kind} missing locally: ${item.name} (${item.itemId})`);
      }
      for (const item of localItems) {
        if (!officialIds.has(item.id)) issue(issues, "warning", `Local ${kind} not found in official CN catalog: ${item.name} (${item.id})`);
      }
    }

    return {
      counts: {
        wikiGGEnemies: enemyTitles.length,
        officialOperators: officialOperators.length,
        officialWeapons: officialWeapons.length,
        officialGears: officialGears.length,
      },
      issues,
    };
  } finally {
    await browser.close();
  }
}

function printResult(title, result) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`${key}: ${value}`);
  }
  if (result.issues.length === 0) {
    console.log("No issues found.");
    return;
  }
  for (const item of result.issues) {
    console.log(`[${item.severity}] ${item.message}`);
  }
}

const staticResult = validateStatic();
printResult("Static data validation", staticResult);

let liveResult = null;
if (LIVE) {
  liveResult = await validateLive();
  printResult("Live source validation", liveResult);
}

const allIssues = [...staticResult.issues, ...(liveResult?.issues ?? [])];
const hasErrors = allIssues.some(item => item.severity === "error");
process.exit(hasErrors ? 1 : 0);
