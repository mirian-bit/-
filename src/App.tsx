/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Users, 
  Download, 
  Zap, 
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Settings2,
  Trophy,
  Plus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addMonths, subMonths, format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Employee, DailySchedule, GroupDemand, SkillDemand, MasterData } from './types';
import { AutoScheduler } from './utils/scheduler';
import { exportToExcel, importEmployeesFromExcel, downloadTemplate } from './utils/excel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 模擬初始人員資料 (表格一結構)
const INITIAL_EMPLOYEES: Employee[] = [
  { id: '1', name: '王大明', department: '生產一課', group: 'A組(收貨)', skills: ['上架', '裝箱', '移倉'] },
  { id: '2', name: '李阿土', department: '生產一課', group: 'A組(收貨)', skills: ['裝箱', '盤點'] },
  { id: '3', name: '張小美', department: '生產一課', group: 'A組(收貨)', skills: ['上架', '移倉'] },
  { id: '4', name: '陳建宏', department: '生產一課', group: 'B組', skills: ['盤點'] },
  { id: '5', name: '林志玲', department: '生產一課', group: 'B組', skills: ['上架', '裝箱'] },
];

const INITIAL_MASTER_DATA: MasterData = {
  departments: ['生產一課', '生產二課'],
  groups: {
    '生產一課': ['A組(收貨)', 'B組'],
    '生產二課': ['C組', 'D組']
  },
  skills: ['上架', '裝箱', '移倉', '盤點', '分貨']
};

export default function App() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cycleWeeks, setCycleWeeks] = useState(4);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [schedule, setSchedule] = useState<DailySchedule[]>([]);
  const [groupDemands, setGroupDemands] = useState<GroupDemand[]>([]);
  const [masterData, setMasterData] = useState<MasterData>(INITIAL_MASTER_DATA);
  
  // 連動邏輯用的 Filter
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');

  // 管理顯隱
  const [showDemandModal, setShowDemandModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [activeDate, setActiveDate] = useState<string>('');

  // 初始化週期的排班表
  useEffect(() => {
    const cycleDays = AutoScheduler.generateCycleDays(startDate, cycleWeeks);
    setSchedule(cycleDays);
  }, [startDate, cycleWeeks]);

  // 表格一：課別與組別連動邏輯
  const departments = masterData.departments;

  const groupsInSelectedDept = useMemo(() => {
    if (filterDept === 'all') return [];
    return masterData.groups[filterDept] || [];
  }, [masterData, filterDept]);

  // 當課別改變，自動重設組別
  useEffect(() => {
    setFilterGroup('all');
  }, [filterDept]);

  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (filterDept !== 'all') {
      result = result.filter(e => e.department === filterDept);
      if (filterGroup !== 'all') {
        result = result.filter(e => e.group === filterGroup);
      }
    }
    return result;
  }, [employees, filterDept, filterGroup]);

  // 切換假別 (表格三：視覺格式)
  const toggleStatus = (date: string, empId: string) => {
    const sequence = ['', '自選', '系休', '國', '休'];
    setSchedule(prev => prev.map(day => {
      if (day.date === date) {
        const current = day.shifts[empId] || '';
        const idx = sequence.indexOf(current);
        const next = sequence[(idx + 1) % sequence.length];
        return { ...day, shifts: { ...day.shifts, [empId]: next } };
      }
      return day;
    }));
  };

  const openDemandModal = (date: string) => {
    setActiveDate(date);
    setShowDemandModal(true);
  };

  const handleUpdateDemand = (dept: string, group: string, skill: string, value: number) => {
    setGroupDemands(prev => {
      const existingIdx = prev.findIndex(d => d.date === activeDate && d.department === dept && d.group === group);
      const newDemands = [...prev];
      
      if (existingIdx >= 0) {
        const skillIdx = newDemands[existingIdx].demands.findIndex(s => s.skillName === skill);
        if (skillIdx >= 0) {
          newDemands[existingIdx].demands[skillIdx].count = value;
        } else {
          newDemands[existingIdx].demands.push({ skillName: skill, count: value });
        }
      } else {
        newDemands.push({
          date: activeDate,
          department: dept,
          group: group,
          demands: [{ skillName: skill, count: value }]
        });
      }
      return newDemands;
    });
  };

  // 自動全排 (表格三邏輯)
  const handleAutoSchedule = () => {
    const scheduler = new AutoScheduler(employees, groupDemands);
    const result = scheduler.run(schedule);
    setSchedule(result);
  };

  const handleImportEmployees = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importEmployeesFromExcel(file);
      if (imported.length > 0) {
        setEmployees(imported);
        
        // 自動更新 Master Data (避免手動一筆筆加)
        const depts = Array.from(new Set(imported.map(i => i.department)));
        const groups: {[key:string]: string[]} = {};
        depts.forEach(d => {
          groups[d] = Array.from(new Set(imported.filter(i => i.department === d).map(i => i.group)));
        });
        const skills = Array.from(new Set(imported.flatMap(i => i.skills)));
        
        setMasterData({
          departments: depts,
          groups: groups,
          skills: skills
        });

        alert(`成功匯入 ${imported.length} 位員工，並已自動更新基本資料清單！`);
      }
    } catch (err) {
      console.error(err);
      alert('匯入失敗，請檢查 Excel 格式。');
    }
    e.target.value = ''; // Reset
  };

  const addMasterItem = (type: 'dept' | 'skill', value: string) => {
    if (!value) return;
    setMasterData(prev => {
      if (type === 'dept') {
        if (prev.departments.includes(value)) return prev;
        return { ...prev, departments: [...prev.departments, value], groups: { ...prev.groups, [value]: [] } };
      } else {
        if (prev.skills.includes(value)) return prev;
        return { ...prev, skills: [...prev.skills, value] };
      }
    });
  };

  const addGroupItem = (dept: string, group: string) => {
    if (!group) return;
    setMasterData(prev => {
      const existing = prev.groups[dept] || [];
      if (existing.includes(group)) return prev;
      return { ...prev, groups: { ...prev.groups, [dept]: [...existing, group] } };
    });
  };

  // 視覺格式判定
  const getShiftStyles = (val: string) => {
    if (val === '自選') return 'bg-green-100 text-green-700 border-green-200';
    if (val === '系休') return 'bg-morandi-primary-light/30 text-morandi-primary-dark border-morandi-primary-light';
    if (val === '國') return 'bg-red-100 text-red-700 border-red-200';
    if (val.startsWith('900(')) return 'font-bold text-morandi-text border-morandi-border'; // 規則 2: 填入 900(技能名),加粗黑字
    if (val === '900') return 'text-slate-400 border-slate-100'; // 規則 4: 填入 900,不加粗
    return 'bg-white border-transparent text-slate-200';
  };

  return (
    <div className="min-h-screen p-6 bg-morandi-bg text-morandi-text">
      <div className="max-w-[1400px] mx-auto grid grid-cols-12 auto-rows-min gap-4">
        
        {/* 1. Header Card */}
        <header className="col-span-12 bento-card border-none bg-morandi-header flex-row items-center justify-between py-4 px-8 text-white min-h-[80px]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-morandi-primary rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                智排系統 <span className="font-light opacity-50 text-sm">SmartShift v2.4.0</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1">
              <div className="flex flex-col px-3">
                <span className="text-[9px] font-black text-white/30 uppercase leading-none">週期開始日</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-sm font-black outline-none [color-scheme:dark]"
                />
              </div>
              <div className="h-6 w-[1px] bg-white/10 mx-2" />
              <div className="flex flex-col px-3 min-w-[60px]">
                <span className="text-[9px] font-black text-white/30 uppercase leading-none">週數 (Weeks)</span>
                <input 
                  type="number" 
                  min="1"
                  max="8"
                  value={cycleWeeks}
                  onChange={(e) => setCycleWeeks(parseInt(e.target.value) || 1)}
                  className="bg-transparent text-sm font-black outline-none w-10"
                />
              </div>
            </div>
            <div className="bg-morandi-primary px-3 py-1.5 rounded-full text-[10px] font-bold">4週週期模式</div>
            <button 
              onClick={() => setShowMasterModal(true)}
              className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all"
            >
              基本資料管理
            </button>
          </div>
        </header>

        {/* 2. Main Schedule Grid */}
        <section className="col-span-12 lg:col-span-8 row-span-5 bento-card overflow-hidden">
          <div className="bento-card-title">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-morandi-primary" />
              <span>{cycleWeeks}週 週期預覽 - {filterDept === 'all' ? '跨部門' : filterDept}</span>
            </div>
            <span className="text-[10px] font-normal text-slate-400 normal-case">格式：900(技能) / 900(保底)</span>
          </div>
          
          <div className="flex-1 overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 border border-slate-100 p-3 min-w-[150px] text-left">姓名 / 技能</th>
                  {schedule.map(day => (
                    <th 
                      key={day.date} 
                      onClick={() => openDemandModal(day.date)}
                      className="border border-slate-100 p-2 min-w-[50px] bg-slate-50 cursor-pointer hover:bg-morandi-bg transition-colors"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{day.date.split('-')[2]}</span>
                        <div className="mt-0.5 flex justify-center">
                          {groupDemands.filter(d => d.date === day.date).length > 0 && (
                            <div className="w-1 h-1 rounded-full bg-morandi-primary" />
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 z-10 bg-white border border-slate-100 p-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-morandi-primary">{emp.name}</span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-tighter truncate max-w-[120px]">
                          {emp.skills.join(' / ')}
                        </span>
                      </div>
                    </td>
                    {schedule.map(day => (
                      <td 
                        key={day.date} 
                        onClick={() => toggleStatus(day.date, emp.id)}
                        className="border border-slate-100 p-1 text-center cursor-pointer group/cell"
                      >
                        <div className={cn(
                          "w-full h-8 flex items-center justify-center text-[10px] transition-all rounded-md italic",
                          getShiftStyles(day.shifts[emp.id] || ''),
                          day.shifts[emp.id] ? "opacity-100" : "opacity-0 group-hover/cell:opacity-20 translate-y-1 group-hover/cell:translate-y-0"
                        )}>
                          {day.shifts[emp.id] === '國' ? '國定假' : 
                           day.shifts[emp.id] === '自選' ? '自選休' :
                           day.shifts[emp.id]}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Logic Engine Stats */}
        <section className="col-span-12 lg:col-span-4 row-span-2 bento-card bg-gradient-to-br from-morandi-primary-light/20 to-morandi-primary/5 border-morandi-primary-light">
          <div className="bento-card-title !text-morandi-primary-dark">排班引擎效能</div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] text-morandi-primary/80 font-bold uppercase">活動人員總數</div>
              <div className="text-3xl font-black text-morandi-text">{employees.length} <span className="text-sm font-light opacity-50">位</span></div>
            </div>
            <div>
              <div className="text-[11px] text-morandi-primary/80 font-bold uppercase">記憶體處理模式</div>
              <div className="text-lg font-black text-morandi-text">Array Logic v1.2</div>
            </div>
            <div className="pt-4 mt-auto text-[10px] font-bold text-morandi-primary uppercase">
              優化模式: Array.prototype.reduce (高併發兼容)
            </div>
          </div>
        </section>

        {/* 4. Filter Card */}
        <section className="col-span-12 lg:col-span-4 row-span-2 bento-card">
          <div className="bento-card-title">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>資料隔離層級</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase px-1">課別</span>
                <select 
                  value={filterDept} 
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="w-full bg-morandi-bg/50 border border-morandi-border rounded-lg p-2 text-xs font-bold outline-none focus:border-morandi-primary transition-all"
                >
                  <option value="all">所有課別</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase px-1">組別</span>
                <select 
                  value={filterGroup} 
                  onChange={(e) => setFilterGroup(e.target.value)}
                  disabled={filterDept === 'all'}
                  className="w-full bg-morandi-bg/50 border border-morandi-border rounded-lg p-2 text-xs font-bold outline-none focus:border-morandi-primary transition-all disabled:opacity-50"
                >
                  <option value="all">所有組別</option>
                  {groupsInSelectedDept.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {['自選', '系休', '國'].map(s => (
                <span key={s} className={cn("px-2 py-1 rounded text-[9px] font-bold border", getShiftStyles(s))}>
                  {s} 保護
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Rule Protection Status */}
        <section className="col-span-12 lg:col-span-4 row-span-2 bento-card">
          <div className="bento-card-title flex items-center justify-between">
            保護機制狀態
            <Trophy className="w-3 h-3 text-emerald-500" />
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-morandi-text">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 國定假日絕對鎖定
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-morandi-text">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 個人自選假優先權 100%
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-morandi-text">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 系休/特休 完整保留
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-morandi-text">
              <div className="w-1.5 h-1.5 rounded-full bg-morandi-primary" /> 層級存取控制 (ACL) 已啟用
            </div>
          </div>
        </section>

        {/* 6. Action Tools Card */}
        <section className="col-span-12 lg:col-span-4 row-span-2 bento-card border-none bg-morandi-header text-white shadow-xl shadow-morandi-primary/10">
          <div className="bento-card-title !text-white/40 mb-6">數據控制台</div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleAutoSchedule}
              className="bento-btn-primary bg-morandi-primary hover:bg-morandi-primary-dark shadow-lg shadow-morandi-primary/20 flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-current" /> 執行智慧週期排班
            </button>
            <div className="grid grid-cols-2 gap-3">
              <label className="bento-btn-outline !bg-transparent !border-white/10 !text-white hover:!bg-white/5 flex items-center justify-center gap-2 cursor-pointer text-[11px] h-12">
                <Plus className="w-3 h-3" /> 匯入員工
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportEmployees} />
              </label>
              <button 
                onClick={() => exportToExcel(schedule, employees, `${startDate}-週期排班表`)}
                className="bento-btn-outline !bg-transparent !border-white/10 !text-white hover:!bg-white/5 flex items-center justify-center gap-2 text-[11px] h-12"
              >
                <Download className="w-3 h-3" /> 匯出 Excel
              </button>
            </div>
            <button 
              onClick={downloadTemplate}
              className="text-white/40 hover:text-white/60 text-[10px] font-bold uppercase tracking-widest transition-all mt-2"
            >
              下載匯入範本
            </button>
          </div>
        </section>

      </div>


      {/* Demand Modal (表格二結構) */}
      <AnimatePresence>
        {showDemandModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowDemandModal(false)}
              className="absolute inset-0 bg-morandi-header/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="bg-morandi-primary p-8 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tighter mb-1 uppercase">人力需求設定</h2>
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">日期: {activeDate}</p>
                </div>
                <button onClick={() => setShowDemandModal(false)} className="p-2 hover:bg-white/20 rounded-2xl transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
                {/* 課別/組別配對 */}
                {Array.from(new Set(employees.map(e => `${e.department}|${e.group}`))).map((pair: string) => {
                  const [dept, group] = pair.split('|');
                  const relevantSkills = Array.from(new Set(employees.filter(e => e.department === dept && e.group === group).flatMap(e => e.skills)));
                  
                  return (
                    <div key={pair} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-morandi-primary rounded-full" />
                        <h3 className="font-black text-slate-900 uppercase tracking-tighter">{dept} / {group}</h3>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {relevantSkills.map((skill: string) => {
                          const val = groupDemands.find(d => d.date === activeDate && d.department === dept && d.group === group)?.demands.find(s => s.skillName === skill)?.count || 0;
                          return (
                            <div key={skill} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 group hover:border-morandi-primary-light transition-all">
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{skill}</label>
                              <div className="flex items-center gap-3">
                                <input 
                                  type="number" 
                                  min="0"
                                  value={val}
                                  onChange={(e) => handleUpdateDemand(dept, group, skill, parseInt(e.target.value) || 0)}
                                  className="w-full bg-transparent text-xl font-black focus:outline-none placeholder:text-slate-200"
                                  placeholder="0"
                                />
                                <span className="text-[10px] font-black text-slate-300">人</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowDemandModal(false)}
                  className="bg-morandi-primary text-white px-10 py-4 rounded-2xl font-black text-sm shadow-xl shadow-morandi-primary/10 hover:bg-morandi-primary-dark transition-all active:scale-95"
                >
                  儲存並關閉
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Master Data Modal */}
      <AnimatePresence>
        {showMasterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMasterModal(false)} className="absolute inset-0 bg-morandi-header/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-black uppercase italic tracking-tighter text-morandi-primary-dark">基本資料管理</h2>
                <button onClick={() => setShowMasterModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all"><X /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8 custom-scrollbar">
                {/* Departments & Groups */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-xs text-slate-400 uppercase tracking-widest">課別與組別設定</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input id="new-dept" type="text" placeholder="輸入新課別名稱..." className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-bold text-sm outline-none transition-all focus:border-morandi-primary-light" />
                      <button onClick={() => {
                        const el = document.getElementById('new-dept') as HTMLInputElement;
                        addMasterItem('dept', el.value);
                        el.value = '';
                      }} className="bg-morandi-primary text-white px-4 rounded-xl font-bold text-xs hover:bg-morandi-primary-dark">新增課別</button>
                    </div>
                    
                    <div className="space-y-3">
                      {masterData.departments.map(dept => (
                        <div key={dept} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                          <div className="flex items-center justify-between font-black text-morandi-primary">
                             <span>{dept}</span>
                             <button className="text-[10px] text-red-400 opacity-0 hover:opacity-100 uppercase" onClick={() => setMasterData(prev => ({ ...prev, departments: prev.departments.filter(d => d !== dept) }))}>刪除</button>
                          </div>
                          <div className="flex gap-2">
                             <input id={`new-group-${dept}`} type="text" placeholder="新增組別..." className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-morandi-primary-light" />
                             <button onClick={() => {
                               const el = document.getElementById(`new-group-${dept}`) as HTMLInputElement;
                               addGroupItem(dept, el.value);
                               el.value = '';
                             }} className="bg-slate-200 text-slate-600 px-3 rounded-lg font-bold text-xs hover:bg-slate-300">加</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(masterData.groups[dept] || []).map(group => (
                              <span key={group} className="bg-white border border-slate-200 px-2 py-1 rounded-md text-[10px] font-bold text-slate-500 flex items-center gap-1 group/item">
                                {group}
                                <X className="w-2.5 h-2.5 cursor-pointer opacity-0 group-hover/item:opacity-100" onClick={() => setMasterData(prev => ({ ...prev, groups: { ...prev.groups, [dept]: (prev.groups[dept] || []).filter(g => g !== group) } }))} />
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Skills */}
                <div className="space-y-6">
                  <h3 className="font-black text-xs text-slate-400 uppercase tracking-widest">全局技能標籤</h3>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input id="new-skill" type="text" placeholder="輸入新技能..." className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-marandi-primary-light" />
                      <button onClick={() => {
                        const el = document.getElementById('new-skill') as HTMLInputElement;
                        addMasterItem('skill', el.value);
                        el.value = '';
                      }} className="bg-morandi-primary text-white px-4 rounded-xl font-bold text-xs hover:bg-morandi-primary-dark">新增技能</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {masterData.skills.map(skill => (
                        <div key={skill} className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-2 group/skill transition-all hover:border-morandi-primary-light">
                          <span className="text-sm font-bold text-slate-600">{skill}</span>
                          <X className="w-3 h-3 text-slate-300 cursor-pointer hover:text-red-500 opacity-0 group-hover/skill:opacity-100" onClick={() => setMasterData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-[1800px] mx-auto px-6 py-12 flex flex-col items-center gap-4 text-slate-400">
        <div className="h-px w-20 bg-morandi-border" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] italic opacity-50 underline decoration-morandi-primary-light decoration-2 underline-offset-4">
          Data Purification Active · Skill Matching Online · Quota Locking Enabled
        </p>
      </footer>
    </div>
  );
}
