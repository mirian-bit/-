/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ShiftType = '900' | '900(技能)' | '休' | '自選' | '系休' | '國';

export interface Employee {
  id: string;
  name: string;
  department: string; // 課
  group: string;      // 組
  skills: string[];   // 技能標籤
}

export interface SkillDemand {
  skillName: string;
  count: number;
}

export interface GroupDemand {
  date: string;
  department: string;
  group: string;
  demands: SkillDemand[];
}

export interface DailySchedule {
  date: string; // YYYY-MM-DD
  shifts: { [employeeId: string]: string }; // Contains the text in the cell
}

export interface MasterData {
  departments: string[];
  groups: { [dept: string]: string[] };
  skills: string[];
}

export interface CycleConfig {
  startDate: string; // YYYY-MM-DD
  weeks: number;     // e.g. 4
}
