import React, { useState, useEffect, useContext } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { GlobalContext } from '../App';
import { ArrowLeft, Users, CheckCircle2, XCircle, Circle, ArrowRightLeft, MessageSquareText, X, ChevronDown, ChevronUp, User, AlertTriangle, Headset } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from 'recharts';

const TeamDetail = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const { teamId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const teamName = location.state?.teamName || "전담팀";
  const [teamMembers, setTeamMembers] = useState([]);
  const [transferLogs, setTransferLogs] = useState([]);
  const [allTeams, setAllTeams] = useState([]);

  const [openLevel, setOpenLevel] = useState(null);
  
  // ✅ 3가지 독립적인 필터 상태 관리
  const [taskFilter, setTaskFilter] = useState('all'); // all, completed, incomplete
  const [showWarning, setShowWarning] = useState(false); // 위험 인원만
  const [showLinked, setShowLinked] = useState(false); // 연계 인원만

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [targetTeamId, setTargetTeamId] = useState("null");
  const [transferNote, setTransferNote] = useState("");

  useEffect(() => { fetchData(); }, [selectedCohort, teamId, teamName]);

  const fetchData = async () => {
    const resDashboard = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}`);
    if (resDashboard.ok) {
      const data = await resDashboard.json();
      const filtered = (data.trainees || []).filter(t => t.team === teamName || t.team.includes(teamId));
      setTeamMembers(filtered);
    }
    const resTeams = await fetch(`http://localhost:8000/api/teams/cohort/${selectedCohort}`);
    if (resTeams.ok) {
      const teams = await resTeams.json();
      setAllTeams(teams.filter(t => t.team_id !== null && t.team_id !== parseInt(teamId))); 
    }
    const resLogs = await fetch(`http://localhost:8000/api/trainees/team-logs/${teamId}`);
    if (resLogs.ok) setTransferLogs(await resLogs.json());
  };

  // ✅ 스위치 기능 (누르면 즉시 백엔드로 상태값 전송)
  const handleToggleStatus = async (traineeId, field, currentValue) => {
    await fetch(`http://localhost:8000/api/trainees/${traineeId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !currentValue })
    });
    fetchData(); // 화면 즉각 새로고침
  };

  const openTransferModal = (trainee) => {
    setSelectedTrainee(trainee);
    setTargetTeamId("null");
    setTransferNote("");
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = async () => {
    const toTeamId = targetTeamId === "null" ? null : parseInt(targetTeamId);
    await fetch(`http://localhost:8000/api/trainees/${selectedTrainee.id}/team`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_team_id: toTeamId, note: transferNote || "특이사항 없음" })
    });
    alert(`${selectedTrainee.name} 학생이 타 조로 인계되었습니다.`);
    setIsTransferModalOpen(false);
    fetchData(); 
  };

  const levelCounts = { 1: 0, 2: 0, 3: 0 };
  teamMembers.forEach(t => { if (levelCounts[t.level] !== undefined) levelCounts[t.level]++; });
  const chartData = [
    { level: '1단계', count: levelCounts[1] },
    { level: '2단계', count: levelCounts[2] },
    { level: '3단계', count: levelCounts[3] },
  ];
  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6'];

  const incomingCount = transferLogs.filter(log => log.is_incoming).length;
  const outgoingCount = transferLogs.filter(log => !log.is_incoming).length;
  const groupedLogs = transferLogs.reduce((acc, log) => {
    const dateStr = new Date(log.move_date).toLocaleDateString();
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(log);
    return acc;
  }, {});

  const renderAccordion = (level) => {
    let students = teamMembers.filter(t => t.level === level);
    
    // ✅ 모든 필터 조건 적용
    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);
    if (showWarning) students = students.filter(t => t.requires_attention);
    if (showLinked) students = students.filter(t => t.is_tech_linked);

    const isOpen = openLevel === level;
    
    return (
      <div key={level} className="mb-4 bg-[#111722] border border-[#2a3441] rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-[#1e293b] transition-colors" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 text-sm font-bold rounded-md ${level === 3 ? 'bg-purple-900 text-purple-300' : level === 2 ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-300'}`}>
              {level}단계 진입
            </span>
            <span className="text-white font-semibold">{students.length}명 인원</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
        
        {isOpen && (
          <div className="px-6 pb-4 pt-2 border-t border-[#2a3441] bg-[#0f1520] space-y-3">
            {students.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">조건에 맞는 인원이 없습니다.</p>
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
                    {t.is_tech_linked && (
                      <span className="inline-flex w-max items-center gap-1 text-[10px] bg-cyan-900/40 text-cyan-400 px-1.5 py-0.5 rounded font-bold border border-cyan-800">
                        <Headset size={10} /> 학습지원 연계됨
                      </span>
                    )}
                  </div>
                  
                  <div className="w-2/5 px-4 flex items-center gap-4">
                    <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                      <div className={`h-full ${pct >= 100 ? 'bg-[#22c55e]' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <span className={`text-xs font-bold w-10 text-right ${pct >= 100 ? 'text-[#22c55e]' : 'text-blue-400'}`}>{pct}%</span>
                  </div>
                  
                  <div className="w-[35%] flex justify-end items-center gap-2">
                    {t.optional_task_done === 1 ? <CheckCircle2 size={16} className="text-[#22c55e] mr-1" /> : <Circle size={16} className="text-gray-600 mr-1" />}
                    
                    {/* ✅ 위험 인원 표시 토글 버튼 */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'requires_attention', t.requires_attention); }} 
                      className={`p-1.5 rounded-lg border transition ${t.requires_attention ? 'bg-red-900/40 border-red-500/50 text-red-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                      title="위험 인원 표시"
                    >
                      <AlertTriangle size={14} />
                    </button>

                    {/* ✅ 학습지원 연계 토글 버튼 */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'is_tech_linked', t.is_tech_linked); }} 
                      className={`p-1.5 rounded-lg border transition ${t.is_tech_linked ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                      title="학습지원 세션 연계 (소속 유지)"
                    >
                      <Headset size={14} />
                    </button>

                    <button onClick={(e) => { e.stopPropagation(); openTransferModal(t); }} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-blue-600 hover:text-white rounded-lg text-gray-300 text-xs transition font-bold border border-gray-700 hover:border-blue-500">
                      <ArrowRightLeft size={14} /> 타 조 인계
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
    <div className="p-8 max-w-[1500px] mx-auto h-[calc(100vh-64px)] flex flex-col gap-6 overflow-hidden">
      
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
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={24} className="text-blue-500" /> {teamName} 학습 지원 세션
          </h2>
          <p className="text-sm text-gray-400 mt-1">팀 소속 인원 모니터링 및 인계 내역(사유) 관리</p>
        </div>
      </div>

      <div className="flex gap-6 flex-grow min-h-0">
        
        {/* 좌측 2/3: 아코디언 및 필터 */}
        <div className="w-2/3 flex flex-col gap-6 hide-scroll overflow-y-auto">
          
          {/* ✅ 신규 추가된 필터 그룹 */}
          <div className="flex justify-end gap-3 shrink-0">
            {/* 선택과제 필터 */}
            <div className="flex bg-[#111722] p-1 rounded-lg border border-[#334155]">
              <button onClick={() => setTaskFilter('all')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${taskFilter === 'all' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>전체 보기</button>
              <button onClick={() => setTaskFilter('completed')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e] shadow' : 'text-gray-400 hover:text-gray-200'}`}><CheckCircle2 size={14} /> 선택과제 완료</button>
              <button onClick={() => setTaskFilter('incomplete')} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${taskFilter === 'incomplete' ? 'bg-gray-800 text-gray-300 shadow' : 'text-gray-400 hover:text-gray-200'}`}><Circle size={14} /> 미완료</button>
            </div>
            {/* 🚨 위험 인원 및 연계 인원 필터 */}
            <div className="flex bg-[#111722] p-1 rounded-lg border border-[#334155] gap-1">
              <button onClick={() => setShowWarning(!showWarning)} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${showWarning ? 'bg-red-900/40 text-red-400 shadow' : 'text-gray-400 hover:text-gray-200'}`}><AlertTriangle size={14} /> 위험 인원</button>
              <button onClick={() => setShowLinked(!showLinked)} className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${showLinked ? 'bg-cyan-900/40 text-cyan-400 shadow' : 'text-gray-400 hover:text-gray-200'}`}><Headset size={14} /> 연계 인원</button>
            </div>
          </div>

          <section>
            {[3, 2, 1].map(renderAccordion)}
          </section>
          
          <section className="bg-[#151b28] border border-[#2a3441] rounded-xl p-6 h-72 shadow-lg shrink-0">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users size={18} className="text-blue-500"/> {teamName} 현재 진도 분포
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

        {/* 2. 우측 1/3: 시간 흐름순 이동 기록 세션 */}
        <div className="w-1/3 bg-[#151b28] border border-[#2a3441] rounded-xl flex flex-col shadow-lg">
          <div className="px-6 py-4 bg-[#111722] border-b border-[#2a3441] shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquareText size={18} className="text-purple-400" />
              <h3 className="font-bold text-white text-lg">이동 및 지원 기록</h3>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded font-bold">총 {transferLogs.length}건</span>
              <span className="bg-green-900/30 text-green-400 px-2 py-1 rounded font-bold border border-green-800">편입 {incomingCount}명</span>
              <span className="bg-orange-900/30 text-orange-400 px-2 py-1 rounded font-bold border border-orange-800">전출 {outgoingCount}명</span>
            </div>
          </div>
          
          <div className="flex-grow overflow-y-auto p-5 space-y-6 hide-scroll">
            {Object.keys(groupedLogs).length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm flex flex-col items-center">
                <ArrowRightLeft size={24} className="mb-2 opacity-50" />
                이동 기록이 없습니다.
              </div>
            ) : (
              Object.entries(groupedLogs).map(([date, logs]) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-extrabold text-gray-500 tracking-wider bg-[#111722] px-3 py-1 rounded-full border border-[#2a3441]">{date}</span>
                    <div className="h-px bg-[#2a3441] flex-grow"></div>
                  </div>
                  
                  <div className="space-y-3">
                    {logs.map(log => (
                      <div key={log.log_id} className={`p-4 rounded-xl border ${log.log_id} ${log.is_incoming ? 'bg-green-900/5 border-green-900/30' : 'bg-orange-900/5 border-orange-900/30'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{log.trainee_name}</span>
                            {log.is_incoming ? (
                              <span className="text-[10px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded font-bold border border-green-700/50">편입 완료</span>
                            ) : (
                              <span className="text-[10px] bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded font-bold border border-orange-700/50">타 조 인계</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500">{new Date(log.move_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-xs text-gray-400 mb-3 flex items-center gap-2 font-medium">
                          <span className={log.is_incoming ? 'text-gray-300' : ''}>{log.from_team_name}</span>
                          <ArrowRightLeft size={10} className="text-gray-600" />
                          <span className={!log.is_incoming ? 'text-gray-300' : ''}>{log.to_team_name}</span>
                        </div>
                        <div className="bg-[#111722] p-3 rounded-lg border border-[#2a3441] text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                          <span className="text-gray-500 font-bold block mb-1">인계 사유 / 노트 :</span>
                          {log.note || "기록된 특이사항 없음"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 모달 창 생략 불가, 유지 */}
      {isTransferModalOpen && selectedTrainee && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-[#111722] border border-[#2a3441] rounded-xl w-[500px] shadow-2xl flex flex-col overflow-hidden">
             <div className="px-6 py-4 bg-[#151b28] border-b border-[#2a3441] flex justify-between items-center">
               <h3 className="font-bold text-white flex items-center gap-2"><ArrowRightLeft size={18} className="text-blue-500"/> 학생 타 조 인계</h3>
               <button onClick={() => setIsTransferModalOpen(false)}><X size={20} className="text-gray-400 hover:text-white"/></button>
             </div>
             
             <div className="p-6 space-y-4">
               <div>
                 <p className="text-sm text-gray-400 mb-1">인계 대상 학생</p>
                 <p className="text-lg font-bold text-white">{selectedTrainee.name} <span className="text-xs font-normal bg-gray-800 px-2 py-0.5 rounded text-gray-400 ml-2">{selectedTrainee.level}단계 진행 중</span></p>
               </div>
               <div>
                 <p className="text-sm text-gray-400 mb-1">인계받을 전담팀 선택</p>
                 <select value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)} className="w-full bg-[#151b28] p-3 text-white rounded-lg border border-[#334155] focus:outline-none focus:border-blue-500">
                   <option value="null">미배정 대기열로 보내기</option>
                   {allTeams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name} (으)로 인계</option>)}
                 </select>
               </div>
               <div>
                 <p className="text-sm text-gray-400 mb-1">이동 사유 및 인계 사항 메모</p>
                 <textarea 
                   value={transferNote} 
                   onChange={(e) => setTransferNote(e.target.value)} 
                   className="w-full h-24 bg-[#151b28] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none hide-scroll" 
                   placeholder="왜 이동시켰는지, 다음 퍼실님을 위해 학습 상태나 사유를 기록해주세요." 
                 />
               </div>
               <button onClick={handleTransferSubmit} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition mt-2">
                 이동 기록 및 인계 완료
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetail;