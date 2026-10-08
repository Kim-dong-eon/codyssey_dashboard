import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalContext } from '../App';
import { ArrowLeft, Headset, CheckCircle2, Circle, ChevronDown, ChevronUp, User, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from 'recharts';

const TechSupportTeam = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const navigate = useNavigate();
  
  const [techMembers, setTechMembers] = useState([]);
  const [openLevel, setOpenLevel] = useState(null);
  const [taskFilter, setTaskFilter] = useState('all'); 
  const [showWarning, setShowWarning] = useState(false); // 위험 인원 필터

  useEffect(() => { fetchData(); }, [selectedCohort]);

  const fetchData = async () => {
    const res = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}`);
    if (res.ok) {
      const data = await res.json();
      // 🚨 전체 학생 중 연계버튼 켜진(is_tech_linked === true) 학생만 집합!
      const linkedStudents = (data.trainees || []).filter(t => t.is_tech_linked === true);
      setTechMembers(linkedStudents);
    }
  };

  const handleToggleStatus = async (traineeId, field, currentValue) => {
    await fetch(`http://localhost:8000/api/trainees/${traineeId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !currentValue })
    });
    fetchData(); 
  };

  const levelCounts = { 1: 0, 2: 0, 3: 0 };
  techMembers.forEach(t => { if (levelCounts[t.level] !== undefined) levelCounts[t.level]++; });
  const chartData = [
    { level: '1단계', count: levelCounts[1] },
    { level: '2단계', count: levelCounts[2] },
    { level: '3단계', count: levelCounts[3] },
  ];
  const COLORS = ['#06b6d4', '#0891b2', '#164e63']; 

  const renderAccordion = (level) => {
    let students = techMembers.filter(t => t.level === level);
    
    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);
    if (showWarning) students = students.filter(t => t.requires_attention);

    const isOpen = openLevel === level;
    
    return (
      <div key={level} className="mb-4 bg-[#111722] border border-cyan-900/30 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-cyan-900/10 transition-colors" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 text-sm font-bold rounded-md bg-cyan-950 border border-cyan-800 text-cyan-400`}>
              {level}단계 진입
            </span>
            <span className="text-white font-semibold">{students.length}명 인원</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="text-cyan-600" /> : <ChevronDown size={20} className="text-cyan-600" />}
        </div>
        
        {isOpen && (
          <div className="px-6 pb-4 pt-2 border-t border-cyan-900/30 bg-[#0f1520] space-y-3">
            {students.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">조건에 맞는 연계 인원이 없습니다.</p>
            ) : students.map(t => {
              const pct = Math.round((t.done / t.target) * 100);
              return (
                <div key={t.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${t.requires_attention ? 'bg-red-900/10 border-red-900/50' : 'bg-[#151b28] border-[#2a3441]'}`}>
                  <div className="flex flex-col w-1/4 gap-1">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-gray-400"/>
                      <span className="font-medium text-white">{t.name}</span>
                      {t.requires_attention && <AlertTriangle size={14} className="text-red-500 fill-red-500/20" />}
                    </div>
                    {/* 원소속 팀 표시 */}
                    <span className="inline-flex w-max items-center text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-bold border border-gray-700">
                      원소속: {t.team}
                    </span>
                  </div>
                  
                  <div className="w-2/5 px-4 flex items-center gap-4">
                    <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                      <div className={`h-full ${pct >= 100 ? 'bg-cyan-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${pct >= 100 ? 'text-cyan-400' : 'text-blue-400'}`}>{pct}%</span>
                  </div>
                  
                  <div className="w-[35%] flex justify-end items-center gap-2">
                    {t.optional_task_done === 1 ? <CheckCircle2 size={16} className="text-[#22c55e] mr-1" /> : <Circle size={16} className="text-gray-600 mr-1" />}
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'requires_attention', t.requires_attention); }} 
                      className={`p-1.5 rounded-lg border transition ${t.requires_attention ? 'bg-red-900/40 border-red-500/50 text-red-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                      title="위험 인원 표시"
                    >
                      <AlertTriangle size={14} />
                    </button>

                    {/* ✅ 연계 해제 버튼 (누르면 즉시 이 보드에서 사라지고 원소속팀에만 남음) */}
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if(window.confirm(`${t.name} 학생을 연계 명단에서 해제하시겠습니까? (원소속은 유지됩니다)`)) {
                          handleToggleStatus(t.id, 'is_tech_linked', t.is_tech_linked);
                        }
                      }} 
                      className={`flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/40 hover:bg-red-900/60 text-cyan-400 hover:text-red-400 rounded-lg text-xs transition font-bold border border-cyan-800 hover:border-red-800`}
                    >
                      <Headset size={14} /> 연계 해제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto h-[calc(100vh-64px)] flex flex-col gap-6 overflow-hidden">
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* 헤더 */}
      <div className="flex items-center gap-4 border-b border-[#2a3441] pb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 bg-[#151b28] border border-[#2a3441] rounded-lg text-gray-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <Headset size={24} /> 학습지원 연계팀 (통합 보드)
          </h2>
          <p className="text-sm text-gray-400 mt-1">각 퍼실팀에서 지원 요청이 접수된 중복 연계 명단입니다.</p>
        </div>
      </div>

      <div className="flex gap-6 flex-grow min-h-0">
        
        {/* 중앙: 대시보드형 아코디언 */}
        <div className="flex-grow flex flex-col gap-6 hide-scroll overflow-y-auto w-2/3">
          
          <div className="flex justify-end gap-3 shrink-0">
            <div className="flex bg-[#111722] p-1 rounded-lg border border-[#334155]">
              <button onClick={() => setTaskFilter('all')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${taskFilter === 'all' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>전체 보기</button>
              <button onClick={() => setTaskFilter('completed')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e] shadow' : 'text-gray-400 hover:text-gray-200'}`}><CheckCircle2 size={14} /> 선택과제 완료</button>
              <button onClick={() => setTaskFilter('incomplete')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'incomplete' ? 'bg-gray-800 text-gray-300 shadow' : 'text-gray-400 hover:text-gray-200'}`}><Circle size={14} /> 미완료</button>
            </div>
            <div className="flex bg-[#111722] p-1 rounded-lg border border-[#334155]">
              <button onClick={() => setShowWarning(!showWarning)} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${showWarning ? 'bg-red-900/40 text-red-400 shadow' : 'text-gray-400 hover:text-gray-200'}`}><AlertTriangle size={14} /> 위험 인원</button>
            </div>
          </div>

          <section>
            {[3, 2, 1].map(renderAccordion)}
          </section>
        </div>

        {/* 우측: 통계 차트 */}
        <div className="w-1/3 flex flex-col gap-6">
          <section className="bg-[#151b28] border border-[#2a3441] rounded-xl p-6 h-72 shadow-lg shrink-0">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Headset size={18} className="text-cyan-500"/> 학습지원 연계 인원 분포
            </h2>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" vertical={false} />
                <XAxis dataKey="level" stroke="#6b7280" tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }} cursor={{ fill: '#1e293b' }} />
                <Bar dataKey="count" name="인원(명)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" fill="#9ca3af" fontSize={12} formatter={(val) => val > 0 ? `${val}명` : ''} />
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>

      </div>
    </div>
  );
};

export default TechSupportTeam;