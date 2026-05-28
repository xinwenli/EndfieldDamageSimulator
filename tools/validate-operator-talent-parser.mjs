import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const {
    isBattleRelatedOperatorTalent,
    parseOperatorTalentMechanics,
    parseOperatorTalentTraitEffects,
  } = await vite.ssrLoadModule("/src/engine/operatorTalentParser.ts");
  const operators = (await import("../src/data/operators.json", { with: { type: "json" } })).default;

  const rows = [];
  for (const operator of operators) {
    for (const group of ["talents", "potentialTalents"]) {
      for (const talent of operator[group] ?? []) {
        if (!isBattleRelatedOperatorTalent(talent.name ?? "", talent.description ?? "")) continue;
        const mechanics = parseOperatorTalentMechanics(
          talent.name ?? "",
          talent.description ?? "",
          operator.element ?? "physical",
        );
        rows.push({
          operatorId: operator.id,
          operatorName: operator.name,
          group,
          talentName: talent.name,
          mechanics,
          runtimeTraits: parseOperatorTalentTraitEffects([talent], operator.element ?? "physical"),
        });
      }
    }
  }

  const unparsed = rows.filter(row => row.mechanics.length === 0);
  const customOnly = rows.filter(row => row.mechanics.every(mechanic => mechanic.kind === "custom"));
  const runtimeSupported = rows.flatMap(row => row.mechanics).filter(mechanic => mechanic.runtimeSupported === true);
  const runtimeTraits = rows.flatMap(row => row.runtimeTraits);
  const kindCounts = countBy(rows.flatMap(row => row.mechanics), mechanic => mechanic.kind);
  const triggerCounts = countBy(rows.flatMap(row => row.mechanics), mechanic => mechanic.trigger);

  console.log("Operator talent parser validation");
  console.log("---------------------------------");
  console.log(`battle-related operator talent texts: ${rows.length}`);
  console.log(`modeled talent texts: ${rows.length - unparsed.length}/${rows.length}`);
  console.log(`custom-only talent texts: ${customOnly.length}`);
  console.log(`runtime-supported mechanics: ${runtimeSupported.length}`);
  console.log(`runtime trait effects: ${runtimeTraits.length}`);
  printCounts("mechanic kinds", kindCounts);
  printCounts("triggers", triggerCounts);

  if (customOnly.length > 0) {
    console.error("Custom-only battle-related operator talent texts:");
    for (const row of customOnly) {
      console.error(`  ${row.operatorId} ${row.operatorName} ${row.talentName}`);
    }
    process.exitCode = 1;
  }

  if (unparsed.length > 0) {
    console.error("Unparsed battle-related operator talent texts:");
    for (const row of unparsed) {
      console.error(`  ${row.operatorId} ${row.operatorName} ${row.talentName}`);
    }
    process.exitCode = 1;
  }
} finally {
  await vite.close();
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function printCounts(title, counts) {
  console.log(`${title}:`);
  for (const [key, count] of counts) {
    console.log(`  ${key}: ${count}`);
  }
}
