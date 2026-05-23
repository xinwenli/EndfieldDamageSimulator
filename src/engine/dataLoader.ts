import type { Operator } from "../engine/types";
import operatorsData from "../data/operators.json";

export function loadOperators(): Operator[] {
  return operatorsData as Operator[];
}

export function getOperatorById(id: string): Operator | undefined {
  return (operatorsData as Operator[]).find((op) => op.id === id);
}

export function getAllOperators(): Operator[] {
  return operatorsData as Operator[];
}
