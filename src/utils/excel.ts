import * as XLSX from 'xlsx';
import { DailySchedule, Employee } from '../types';

export const exportToExcel = (schedule: DailySchedule[], employees: Employee[], filename: string) => {
  const data = employees.map(emp => {
    const row: any = { '姓名': emp.name, '課別': emp.department, '組別': emp.group };
    schedule.forEach(day => {
      const dateKey = day.date.split('-')[2]; // 只要日期
      row[dateKey] = day.shifts[emp.id] || '';
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班表');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

/**
 * 產生 Excel 匯入範本
 */
export const downloadTemplate = () => {
  const data = [
    { '姓名': '範例員工1', '課別': '範例課別A', '組別': '範例組別A', '技能標籤': '上架, 裝箱' },
    { '姓名': '範例員工2', '課別': '範例課別B', '組別': '範例組別B', '技能標籤': '盤點, 移倉' },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '匯入範本');
  
  // 加入備註說明
  XLSX.utils.sheet_add_aoa(ws, [
    ['備註說明：'],
    ['1. 請依照此格式填寫員工名單。'],
    ['2. 「技能標籤」請用逗號(,)隔開。'],
    ['3. 請勿修改標題欄位名稱。']
  ], { origin: 'F1' });

  XLSX.writeFile(wb, `排班系統_員工匯入範本.xlsx`);
};

/**
 * 匯入員工清單 Excel
 * 欄位預期：姓名, 課別, 組別, 技能標籤 (可選)
 */
export const importEmployeesFromExcel = async (file: File): Promise<Employee[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        const employees: Employee[] = json.map((row, idx) => {
          // 支援多種可能的欄位名稱
          const name = (row['姓名'] || row['Name'] || '').toString().trim();
          const dept = (row['課別'] || row['Department'] || row['Dept'] || '').toString().trim();
          const group = (row['組別'] || row['Group'] || '').toString().trim();
          const skillsRaw = (row['技能標籤'] || row['Skills'] || '').toString().trim();
          
          // 規則 5: 資料淨化 - 去除隱形空格並處理逗號/斜線隔開
          const skills = typeof skillsRaw === 'string' && skillsRaw.length > 0
            ? skillsRaw.split(/[，,／/]/).map(s => s.trim()).filter(Boolean)
            : [];

          return {
            id: `imported-${Date.now()}-${idx}`,
            name: name,
            department: dept,
            group: group,
            skills: skills
          };
        }).filter(emp => emp.name && emp.department); // 基本過濾

        resolve(employees);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
