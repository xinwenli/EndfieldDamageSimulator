import type { Operator, Weapon } from "../engine/types";
import operatorsData from "../data/operators.json";
import weaponsData from "../data/weapons.json";
import elementsData from "../data/elements.json";

export function loadOperators(): Operator[] {
  return operatorsData as Operator[];
}

export function getOperatorById(id: string): Operator | undefined {
  return (operatorsData as Operator[]).find((op) => op.id === id);
}

export function getAllOperators(): Operator[] {
  return operatorsData as Operator[];
}

export function loadWeapons(): Weapon[] {
  return weaponsData as Weapon[];
}

export function getWeaponById(id: string): Weapon | undefined {
  return (weaponsData as Weapon[]).find((w) => w.id === id);
}

export function getWeaponsByType(weaponType: string): Weapon[] {
  return (weaponsData as Weapon[]).filter((w) => w.weaponType === weaponType);
}

export function getAllWeapons(): Weapon[] {
  return weaponsData as Weapon[];
}

export function getElements(): Record<string, { name: string; color: string }> {
  return elementsData as Record<string, { name: string; color: string }>;
}
