import { Employee, DailySchedule, GroupDemand } from '../types';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';

/**
 * 高階自動排班引擎 - 遵循業務邏輯規則
 */
export class AutoScheduler {
  private employees: Employee[];
  private groupDemands: GroupDemand[];

  constructor(employees: Employee[], groupDemands: GroupDemand[]) {
    // 規則 5: 資料淨化 - 去除隱形空格
    this.employees = employees.map(emp => ({
      ...emp,
      department: emp.department.trim(),
      group: emp.group.trim(),
      skills: emp.skills.map(s => s.trim())
    }));
    
    this.groupDemands = groupDemands.map(demand => ({
      ...demand,
      department: demand.department.trim(),
      group: demand.group.trim(),
      demands: demand.demands.map(d => ({ ...d, skillName: d.skillName.trim() }))
    }));
  }

  /**
   * 執行排班
   * @param currentSchedule 現有的排班表（包含已設定的假別）
   */
  public run(currentSchedule: DailySchedule[]): DailySchedule[] {
    const newSchedule = currentSchedule.map(day => ({
      ...day,
      shifts: { ...day.shifts }
    }));

    newSchedule.forEach(day => {
      // 依據當天的需求進行配對
      const todaysDemands = this.groupDemands.filter(d => d.date === day.date);

      todaysDemands.forEach(groupDemand => {
        const groupStaff = this.employees.filter(emp => 
          emp.department === groupDemand.department && 
          emp.group === groupDemand.group
        );

        // 追蹤當天已被分配的人員，避免重複分配
        const assignedInGroupToday = new Set<string>();

        // 規則 1 & 2 & 3: 假別保護、技能配對、名額鎖定
        groupDemand.demands.forEach(skillDemand => {
          let assignedCount = 0;
          
          if (skillDemand.count <= 0) return;

          for (const emp of groupStaff) {
            if (assignedCount >= skillDemand.count) break; // 規則 3: 名額鎖定
            
            const currentShift = (day.shifts[emp.id] || '').trim();
            
            // 規則 1: 假別保護
            if (['自選', '系休', '國'].includes(currentShift)) continue;
            
            // 檢查該員是否已在當天被分配其他技能或基本班
            if (assignedInGroupToday.has(emp.id)) continue;

            // 規則 2: 技能配對 (模糊搜尋)
            const hasSkill = emp.skills.some(s => 
              s.includes(skillDemand.skillName) || skillDemand.skillName.includes(s)
            );

            if (hasSkill) {
              day.shifts[emp.id] = `900(${skillDemand.skillName})`;
              assignedInGroupToday.add(emp.id);
              assignedCount++;
            }
          }
        });

        // 規則 4: 保底填補 (剩下的空格補上 900)
        groupStaff.forEach(emp => {
          const currentShift = (day.shifts[emp.id] || '').trim();
          
          // 如果沒假別，也沒被分配到技能，則補上 900
          if (!['自選', '系休', '國', '休'].includes(currentShift) && !assignedInGroupToday.has(emp.id)) {
            if (!currentShift || currentShift === '') {
                day.shifts[emp.id] = '900';
            }
          }
        });
      });
    });

    return newSchedule;
  }

  /**
   * 產生初始空的週期表 (以週為單位)
   */
  public static generateCycleDays(startDate: string, weeks: number): DailySchedule[] {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + (weeks * 7) - 1);
    
    const days = eachDayOfInterval({ start, end });

    return days.map(day => ({
      date: format(day, 'yyyy-MM-dd'),
      shifts: {}
    }));
  }
}
