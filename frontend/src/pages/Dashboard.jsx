import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { ChevronDown, ChevronUp, User, Search, CheckCircle2, Circle, Bell, Plus, Trash2, Pin, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Dashboard = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [trainees, setTrainees] = useState([]);
  const [chartData, setChartData] = useState([]);
  
  // 🚨 수정됨: 초기값을 null로 설정하여 처음 진입 시 모든 아코디언이 닫혀있도록 변경
  const [openLevel, setOpenLevel] = useState(null); 
  const [searchTerm, setSearchTerm] = useState("");
  const [taskFilter, setTaskFilter] = useState('all'); 

  // 공지사항 상태
  const [notices, setNotices] = useState([]);
  const [newNotice, setNewNotice] = useState("");
  const [newCategory, setNewCategory] = useState("일반"); // 긴급, 일반

  useEffect(() => {
    fetchDashboard();
    fetchNotices();
  }, [selectedCohort]);

  const fetchDashboard = async () => {
    const res = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}`);
    if (res.ok) {
      const data = await res.json();
      setTrainees(data.trainees || []);
      setChartData(data.chartData || []);
    }
  };

  const fetchNotices = async () => {
    const res = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}/notices`);
    if (res.ok) setNotices(await res.json());
  };

  const handleAddNotice = async () => {
    if (!newNotice.trim()) return;
    const res = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}/notices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newNotice, category: newCategory })
    });
    if (res.ok) {
      setNewNotice("");
      setNewCategory("일반");
      fetchNotices(); 
    }
  };

  const handleToggleNotice = async (noticeId, field, currentValue) => {
    const newValue = field === 'status' ? (currentValue === '완료' ? '미완료' : '완료') : !currentValue;
    await fetch(`http://localhost:8000/api/dashboard/notices/${noticeId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue })
    });
    fetchNotices();
  };

  const handleDeleteNotice = async (noticeId) => {
    if (window.confirm("공지를 삭제하시겠습니까?")) {
      await fetch(`http://localhost:8000/api/dashboard/notices/${noticeId}`, { method: "DELETE" });
      fetchNotices();
    }
  };

  const renderAccordion = (level) => {
    let students = trainees.filter(t => t.level === level);
    if (searchTerm) students = students.filter(t => t.name.includes(searchTerm));
    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);

    const isOpen = openLevel === level;
    
    return (
      <div key={level} className="mb-4 bg-[#151b28] border border-[#2a3441] rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-[#1e293b] transition-colors" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 text-sm font-bold rounded-md ${level === 3 ? 'bg-purple-900 text-purple-300' : level === 2 ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-300'}`}>
              {level}단계 진입
            </span>
            <span className="text-white font-semibold">{students.length}명 검색됨</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
        
        {isOpen && (
          <div className="px-6 pb-4 pt-2 border-t border-[#2a3441] bg-[#0f1520] space-y-3">
            {students.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">조건에 맞는 학생이 없습니다.</p>
            ) : students.map(t => {
              const pct = Math.round((t.done / t.target) * 100);
              return (
                <div key={t.id} className="flex justify-between items-center p-3 bg-[#151b28] rounded-lg border border-[#2a3441]">
                  <div className="flex items-center gap-3 w-1/4">
                    <User size={16} className="text-gray-400"/>
                    <span className="font-medium text-white">{t.name}</span>
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{t.team}</span>
                  </div>
                  <div className="w-1/2 px-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">필수 진도율 ({t.done}/{t.target})</span>
                      <span className={pct >= 100 ? 'text-[#22c55e]' : 'text-blue-400'}>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full"><div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-[#22c55e]' : 'bg-blue-500'}`} style={{width: `${Math.min(pct,100)}%`}}></div></div>
                  </div>
                  <div className="w-1/4 flex justify-end items-center gap-2">
                    <span className="text-xs text-gray-400">선택과제</span>
                    {t.optional_task_done === 1 ? (
                      <span className="flex items-center gap-1 text-[#22c55e] text-xs font-bold bg-[#22c55e]/10 px-2 py-1 rounded-full"><CheckCircle2 size={14} /> 완료</span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-500 text-xs font-bold bg-gray-800 px-2 py-1 rounded-full"><Circle size={14} /> 미완료</span>
                    )}
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
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-6">
      
      <div className="flex justify-between items-center bg-[#151b28] border border-[#2a3441] p-4 rounded-xl shadow-sm">
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="학생 이름 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#111722] border border-[#334155] rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
        
        <div className="flex bg-[#111722] p-1 rounded-lg border border-[#334155]">
          <button onClick={() => setTaskFilter('all')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${taskFilter === 'all' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>전체 보기</button>
          <button onClick={() => setTaskFilter('completed')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e] shadow' : 'text-gray-400 hover:text-gray-200'}`}><CheckCircle2 size={14} /> 완료자</button>
          <button onClick={() => setTaskFilter('incomplete')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'incomplete' ? 'bg-gray-800 text-gray-300 shadow' : 'text-gray-400 hover:text-gray-200'}`}><Circle size={14} /> 미완료자</button>
        </div>
      </div>

      <div className="flex gap-6">
        
        <div className="w-2/3 flex flex-col gap-6">
          <section>{[3, 2, 1].map(renderAccordion)}</section>
          
          <section className="bg-[#151b28] border border-[#2a3441] rounded-xl p-6 h-72 shadow-lg">
            <h2 className="text-lg font-bold text-white mb-4">전체 진도 추이</h2>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ paddingTop: '10px' }}/>
                <Line type="monotone" dataKey="level3" name="3단계" stroke="#a855f7" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="level2" name="2단계" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="level1" name="1단계" stroke="#6b7280" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
        
        <div className="w-1/3">
          <section className="bg-[#151b28] border border-[#2a3441] rounded-xl p-5 h-full min-h-[600px] flex flex-col shadow-lg">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Bell size={18} className="text-yellow-500"/> 할 일 / 공지 보드
            </h2>
            
            <div className="flex flex-col gap-2 mb-5 shrink-0 bg-[#111722] p-3 rounded-xl border border-[#2a3441]">
              <div className="flex gap-2 mb-1">
                <button onClick={() => setNewCategory("일반")} className={`text-xs px-2 py-1 rounded font-bold transition ${newCategory === "일반" ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}>일반</button>
                <button onClick={() => setNewCategory("긴급")} className={`text-xs px-2 py-1 rounded font-bold transition flex items-center gap-1 ${newCategory === "긴급" ? "bg-red-900/80 text-red-300" : "bg-gray-800 text-gray-400"}`}><AlertCircle size={12}/> 긴급</button>
              </div>
              <textarea 
                value={newNotice}
                onChange={(e) => setNewNotice(e.target.value)}
                placeholder="해야 할 일이나 공지를 적어주세요..." 
                className="w-full bg-transparent text-sm text-white focus:outline-none resize-none h-16 custom-scrollbar"
              />
              <button onClick={handleAddNotice} className="bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg text-sm font-bold transition w-full">등록하기</button>
            </div>

            <div className="flex-grow overflow-y-auto space-y-3 custom-scrollbar pr-1">
              {notices.map(notice => (
                <div key={notice.notice_id} className={`p-3 rounded-xl border flex gap-3 group relative transition-colors ${notice.is_pinned ? 'bg-yellow-900/10 border-yellow-700/50' : 'bg-[#1e293b]/40 border-[#2a3441]'}`}>
                  
                  <button onClick={() => handleToggleNotice(notice.notice_id, 'status', notice.status)} className="mt-0.5 shrink-0">
                    {notice.status === '완료' ? <CheckCircle2 className="text-green-500" size={18}/> : <Circle className="text-gray-500 hover:text-gray-400" size={18}/>}
                  </button>
                  
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {notice.category === '긴급' && <span className="bg-red-900/80 text-red-300 text-[10px] px-1.5 py-0.5 rounded font-bold">긴급</span>}
                      {notice.is_pinned && <span className="bg-yellow-900/80 text-yellow-300 text-[10px] px-1.5 py-0.5 rounded font-bold">고정됨</span>}
                    </div>
                    <p className={`text-sm break-words whitespace-pre-wrap leading-relaxed ${notice.status === '완료' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                      {notice.content}
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <button onClick={() => handleToggleNotice(notice.notice_id, 'is_pinned', notice.is_pinned)} className="p-1 hover:bg-gray-800 rounded">
                      <Pin size={16} className={notice.is_pinned ? "text-yellow-500 fill-yellow-500/20" : "text-gray-600 hover:text-yellow-500/70"} />
                    </button>
                    <button onClick={() => handleDeleteNotice(notice.notice_id)} className="p-1 hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition">
                      <Trash2 size={16} className="text-gray-600 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
              {notices.length === 0 && <div className="text-center py-10 text-gray-500 text-sm">등록된 항목이 없습니다.</div>}
            </div>
          </section>
        </div>
        
      </div>
    </div>
  );
};

export default Dashboard;