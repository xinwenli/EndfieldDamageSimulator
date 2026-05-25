export type Lang = "zh" | "en";

const translations: Record<string, Record<Lang, string>> = {
  "party.setup": { zh: "队伍配置", en: "Party Setup" },
  "party.export": { zh: "导出", en: "Export" },
  "party.import": { zh: "导入", en: "Import" },
  "operator": { zh: "干员", en: "Operator" },
  "operator.change": { zh: "更换", en: "Change" },
  "operator.remove": { zh: "移除", en: "Remove" },
  "operator.select": { zh: "选择干员", en: "Select Operator" },
  "operator.search": { zh: "搜索干员...", en: "Search operator..." },
  "operator.none": { zh: "未找到干员", en: "No operators found" },
  "level": { zh: "等级", en: "Level" },
  "potential": { zh: "潜能", en: "Potential" },
  "talent": { zh: "天赋", en: "Talent" },
  "baseAttack": { zh: "普攻", en: "BaseAttack" },
  "battleSkill": { zh: "战技", en: "BattleSkill" },
  "comboSkill": { zh: "连携技", en: "ComboSkill" },
  "ultimate": { zh: "终结技", en: "Ultimate" },
  "abilities": { zh: "能力值", en: "Abilities" },
  "weapon": { zh: "武器", en: "Weapon" },
  "weapon.select": { zh: "选择武器", en: "Select Weapon" },
  "weapon.search": { zh: "搜索武器...", en: "Search weapon..." },
  "weapon.none": { zh: "未找到该类型武器", en: "No weapons found for this type" },
  "weapon.clear": { zh: "清除", en: "Clear" },
  "weapon.lv": { zh: "武器等级", en: "Wpn Lv" },
  "gear": { zh: "装备", en: "Gear" },
  "gear.select": { zh: "选择装备", en: "Select Gear" },
  "gear.search": { zh: "搜索装备...", en: "Search gear..." },
  "gear.none": { zh: "未找到装备", en: "No gear found" },
  "gear.armor": { zh: "护甲", en: "Armor" },
  "gear.gloves": { zh: "护手", en: "Gloves" },
  "gear.kit1": { zh: "配件1", en: "Kit 1" },
  "gear.kit2": { zh: "配件2", en: "Kit 2" },
  "gear.empty": { zh: "空", en: "Empty" },
  "stats": { zh: "属性", en: "Stats" },
  "stats.basic": { zh: "基础属性", en: "Basic Stats" },
  "stats.other": { zh: "其他属性", en: "Other Stats" },
  "config": { zh: "干员配置", en: "Operator Config" },
  "import.title": { zh: "导入队伍", en: "Import Party" },
  "import.placeholder": { zh: "粘贴导出的JSON...", en: "Paste exported JSON here..." },
  "import.cancel": { zh: "取消", en: "Cancel" },
  "import.confirm": { zh: "导入", en: "Import" },
  "simulator": { zh: "伤害模拟", en: "Damage Simulation" },
  "app.title": { zh: "终末地伤害模拟器", en: "Endfield Damage Simulator" },
  "slot": { zh: "槽位", en: "Slot" },
  "details.title": { zh: "干员详情", en: "Operator Details" },
  "details.hint": { zh: "从上方队伍中选择一名干员以配置技能、天赋和属性。", en: "Select an operator from the party above to set up skills, talents, and stats." },
};

const statLabels: Record<string, Record<Lang, string>> = {
  HP: { zh: "生命", en: "HP" },
  ATK: { zh: "攻击", en: "ATK" },
  DEF: { zh: "防御", en: "DEF" },
  STR: { zh: "力量", en: "STR" },
  AGI: { zh: "敏捷", en: "AGI" },
  INT: { zh: "智识", en: "INT" },
  WIL: { zh: "意志", en: "WIL" },
  "Crit Rate": { zh: "暴击率", en: "Crit Rate" },
  "Crit DMG": { zh: "暴击伤害", en: "Crit DMG" },
  "Arts Intensity": { zh: "源石技艺强度", en: "Arts Intensity" },
  "Phys Resist": { zh: "物理抗性", en: "Phys Resist" },
  "Heat Resist": { zh: "灼热抗性", en: "Heat Resist" },
  "Elec Resist": { zh: "电磁抗性", en: "Elec Resist" },
  "Cryo Resist": { zh: "寒冷抗性", en: "Cryo Resist" },
  "Nature Resist": { zh: "自然抗性", en: "Nature Resist" },
  "AEther Resist": { zh: "超域抗性", en: "AEther Resist" },
  "Treat Bonus": { zh: "治疗加成", en: "Treat Bonus" },
  "Treat Recv": { zh: "受治疗加成", en: "Treat Recv" },
  "Combo CDR": { zh: "连携技冷却", en: "Combo CDR" },
  "Ult Gain Eff": { zh: "终结技能量效率", en: "Ult Gain Eff" },
  "Stagger Eff": { zh: "失衡效率", en: "Stagger Eff" },
  "Phys DMG+": { zh: "物理伤害+", en: "Phys DMG+" },
  "Heat DMG+": { zh: "灼热伤害+", en: "Heat DMG+" },
  "Elec DMG+": { zh: "电磁伤害+", en: "Elec DMG+" },
  "Cryo DMG+": { zh: "寒冷伤害+", en: "Cryo DMG+" },
  "Nature DMG+": { zh: "自然伤害+", en: "Nature DMG+" },
  "Basic ATK DMG+": { zh: "普通攻击伤害+", en: "Basic ATK DMG+" },
  "Battle Skill DMG+": { zh: "战技伤害+", en: "Battle Skill DMG+" },
  "Combo Skill DMG+": { zh: "连携技伤害+", en: "Combo Skill DMG+" },
  "Ult Skill DMG+": { zh: "终结技伤害+", en: "Ult Skill DMG+" },
  "Staggered DMG+": { zh: "对失衡伤害+", en: "Staggered DMG+" },
  "Phys DMG Reduc": { zh: "物理减伤", en: "Phys DMG Reduc" },
  "Heat DMG Reduc": { zh: "灼热减伤", en: "Heat DMG Reduc" },
  "Elec DMG Reduc": { zh: "电磁减伤", en: "Elec DMG Reduc" },
  "Cryo DMG Reduc": { zh: "寒冷减伤", en: "Cryo DMG Reduc" },
  "Nature DMG Reduc": { zh: "自然减伤", en: "Nature DMG Reduc" },
  "AEther DMG Reduc": { zh: "超域减伤", en: "AEther DMG Reduc" },
  // Gear refinement stat names (CN keys from wiki gear detail pages)
  "物理伤害加成": { zh: "物理伤害加成", en: "Phys DMG+" },
  "灼热和自然伤害加成": { zh: "灼热和自然伤害加成", en: "Heat & Nature DMG+" },
  "寒冷和电磁伤害加成": { zh: "寒冷和电磁伤害加成", en: "Cryo & Elec DMG+" },
  "普通攻击伤害加成": { zh: "普通攻击伤害加成", en: "Basic ATK DMG+" },
  "战技伤害加成": { zh: "战技伤害加成", en: "Battle Skill DMG+" },
  "战绩伤害加成": { zh: "战绩伤害加成", en: "Battle Skill DMG+" },
  "连携技伤害加成": { zh: "连携技伤害加成", en: "Combo Skill DMG+" },
  "终结技伤害加成": { zh: "终结技伤害加成", en: "Ult Skill DMG+" },
  "所有技能伤害加成": { zh: "所有技能伤害加成", en: "All Skill DMG+" },
  "对失衡目标伤害加成": { zh: "对失衡目标伤害加成", en: "Staggered DMG+" },
  "治疗效率加成": { zh: "治疗效率加成", en: "Treat Bonus" },
  "全伤害减免": { zh: "全伤害减免", en: "All DMG Reduc" },
  "主能力": { zh: "主能力", en: "Primary Ability" },
  "副能力": { zh: "副能力", en: "Secondary Ability" },
  "终结技充能效率": { zh: "终结技充能效率", en: "Ult Gain Eff" },
};

const profLabels: Record<string, Record<Lang, string>> = {
  Guard: { zh: "近卫", en: "Guard" },
  Caster: { zh: "术师", en: "Caster" },
  Striker: { zh: "突击", en: "Striker" },
  Vanguard: { zh: "先锋", en: "Vanguard" },
  Defender: { zh: "重装", en: "Defender" },
  Supporter: { zh: "辅助", en: "Supporter" },
};

const elemLabels: Record<string, Record<Lang, string>> = {
  Physical: { zh: "物理", en: "Physical" },
  Heat: { zh: "灼热", en: "Heat" },
  Electric: { zh: "电磁", en: "Electric" },
  Cryo: { zh: "寒冷", en: "Cryo" },
  Nature: { zh: "自然", en: "Nature" },
};

const weaponLabels: Record<string, Record<Lang, string>> = {
  Sword: { zh: "单手剑", en: "Sword" },
  ArtsUnit: { zh: "施术单元", en: "ArtsUnit" },
  Greatsword: { zh: "双手剑", en: "Greatsword" },
  Handcannon: { zh: "手铳", en: "Handcannon" },
  Polearm: { zh: "长柄武器", en: "Polearm" },
};

export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] || statLabels[key]?.[lang] || profLabels[key]?.[lang] || weaponLabels[key]?.[lang] || elemLabels[key]?.[lang] || key;
}

/** Get display name based on language */
export function displayName(item: { name: string; nameEn?: string }, lang: Lang): string {
  return lang === "en" && item.nameEn ? item.nameEn : item.name;
}

export { translations, statLabels };
