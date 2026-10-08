import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { Calendar as CalIcon, Plus, X, Users, Trash2, UserPlus, XCircle, Globe, Search } from 'lucide-react';

const Schedule = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [events, setEvents] = useState([]);
  const [allTrainees, setAllTrainees] = useState([]); 
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [roster, setRoster] = useState([]);

  const [viewMode, setViewMode] = useState("current"); 

  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', event_type: '행사', description: '', isCommon: false });
  
  const [selectedTraineeId, setSelectedTraineeId] = useState("");
  const [traineeSearchTerm, setTraineeSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [selectedCohort, viewMode]);

  useEffect(() => {
    fetchTrainees();
  }, [selectedCohort]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isEventModalOpen) setIsEventModalOpen(false);
        if (isDropdownOpen) setIsDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEventModalOpen, isDropdownOpen]);

  const fetchEvents = async () => {
    const endpoint = viewMode === "all" ? "all" : selectedCohort;
    const res = await fetch(`http://localhost:8000/api/schedules/cohort/${endpoint}`);
    if (res.ok) setEvents(await res.json());
  };

  const fetchTrainees = async () => {
    const res = await fetch(`http://localhost:8000/api/trainees/cohort/${selectedCohort}`);
    if (res.ok) setAllTrainees(await res.json());
  };

  const fetchRoster = async (eventId) => {
    const res = await fetch(`http://localhost:8000/api/schedules/${eventId}/roster`);
    if (res.ok) setRoster(await res.json());
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    fetchRoster(event.event_id);
  };

  const handleCreateEvent = async () => {
    // 🚨 QA 8번 해결: 스페이스바만 입력했는지(.trim()) 검사
    if (!eventForm.title.trim()) return alert("일정/행사 명을 정확히 입력해주세요.");
    
    await fetch(`http://localhost:8000/api/schedules/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cohort_id: eventForm.isCommon ? 0 : selectedCohort,
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        event_date: selectedDate,
        event_type: eventForm.event_type
      })
    });
    setIsEventModalOpen(false);
    setEventForm({ title: '', event_type: '행사', description: '', isCommon: false });
    fetchEvents();
  };

  const handleDeleteEvent = async (eventId) => {
    if(window.confirm("이 일정을 완전히 삭제하시겠습니까? (명단도 날아갑니다)")) {
      await fetch(`http://localhost:8000/api/schedules/${eventId}`, { method: 'DELETE' });
      setSelectedEvent(null);
      fetchEvents();
    }
  };

  const handleAddTraineeToEvent = async () => {
    if (!selectedTraineeId) return alert("추가할 인원을 검색 후 선택해주세요.");
    const trainee = allTrainees.find(t => t.id === parseInt(selectedTraineeId));
    
    const res = await fetch(`http://localhost:8000/api/schedules/${selectedEvent.event_id}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainee_id: trainee.id, trainee_name: trainee.name })
    });
    
    if (res.ok) {
      fetchRoster(selectedEvent.event_id);
      setSelectedTraineeId("");
      setTraineeSearchTerm(""); 
    } else {
      const data = await res.json();
      alert(data.detail || "명단 추가에 실패했습니다.");
    }
  };

  const handleCancelRegistration = async (regId) => {
    if(window.confirm("이 학생의 신청을 취소 처리하시겠습니까?")) {
      await fetch(`http://localhost:8000/api/schedules/cancel/${regId}`, { method: 'PUT' });
      fetchRoster(selectedEvent.event_id);
    }
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  
  const today = new Date();
  const [currYear, setCurrYear] = useState(today.getFullYear());
  const [currMonth, setCurrMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(currYear, currMonth);
  const firstDay = getFirstDayOfMonth(currYear, currMonth);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const prevMonth = () => {
    if (currMonth === 0) { setCurrYear(currYear - 1); setCurrMonth(11); } 
    else { setCurrMonth(currMonth - 1); }
  };
  const nextMonth = () => {
    if (currMonth === 11) { setCurrYear(currYear + 1); setCurrMonth(0); } 
    else { setCurrMonth(currMonth + 1); }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-[calc(100vh-64px)] h-auto overflow-y-auto flex gap-6 relative">
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* 왼쪽: 캘린더 영역 */}
      <div className="flex-grow flex flex-col bg-[#151b28] border border-[#2a3441] rounded-2xl shadow-lg">
        <div className="px-8 py-5 border-b border-[#2a3441] flex justify-between items-center bg-[#111722] rounded-t-2xl shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <CalIcon size={20} className="text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-white">일정 및 행사 캘린더</h2>
            </div>
            
            <div className="flex bg-[#151b28] p-1 rounded-lg border border-[#334155] shadow-inner">
              <button onClick={() => setViewMode('current')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition flex items-center gap-1.5 ${viewMode === 'current' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                {selectedCohort}기 + 공통
              </button>
              <button onClick={() => setViewMode('all')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition flex items-center gap-1.5 ${viewMode === 'all' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
                <Globe size={14} /> 전체 기수 
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#1e293b] rounded-lg border border-[#334155] p-1 shadow-inner">
            <button onClick={prevMonth} className="px-3 py-1 text-gray-400 hover:text-white transition">◀</button>
            <span className="font-extrabold text-white w-24 text-center">{currYear}년 {currMonth + 1}월</span>
            <button onClick={nextMonth} className="px-3 py-1 text-gray-400 hover:text-white transition">▶</button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-7 gap-4 text-center mb-4 text-sm font-bold text-gray-500">
            <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-400">토</div>
          </div>
          <div className="grid grid-cols-7 gap-3">
            {blanks.map(b => <div key={`blank-${b}`} className="min-h-[100px] bg-transparent"></div>)}
            {days.map(d => {
              const dateStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayEvents = events.filter(e => e.event_date === dateStr);
              const isSelected = selectedDate === dateStr;
              
              return (
                <div 
                  key={d} 
                  onClick={() => { setSelectedDate(dateStr); setSelectedEvent(null); }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedDate(dateStr);
                    setSelectedEvent(null);
                    setIsEventModalOpen(true);
                  }}
                  className={`min-h-[100px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col 
                    ${isSelected ? 'bg-blue-900/20 border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-[#111722] border-[#2a3441] hover:border-gray-500'}
                  `}
                >
                  <span className={`text-sm font-bold self-end mb-1 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`}>{d}</span>
                  <div className="space-y-1.5 flex-grow overflow-y-auto hide-scroll">
                    {dayEvents.map(e => (
                      <div 
                        key={e.event_id} 
                        onClick={(ev) => { ev.stopPropagation(); setSelectedDate(dateStr); handleEventClick(e); }}
                        className={`text-[11px] p-1.5 rounded flex items-center gap-1.5 font-bold truncate 
                          ${e.event_type === '행사' ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50' : 'bg-green-900/30 text-green-400 border border-green-800/50'}
                        `}
                      >
                        <span className={`px-1 py-[1px] rounded-[3px] text-[9px] ${e.cohort_id === 0 ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>
                          {e.cohort_id === 0 ? '공통' : `${e.cohort_id}기`}
                        </span>
                        <span className="truncate">{e.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 오른쪽: 일정 명단 관리 패널 */}
      <div className="w-[500px] bg-[#111722] border border-[#2a3441] rounded-2xl flex flex-col shadow-2xl shrink-0 h-auto self-start">
        <div className="px-6 py-5 border-b border-[#2a3441] bg-[#151b28] rounded-t-2xl flex justify-between items-center sticky top-0">
          <h3 className="font-extrabold text-white text-lg">
            {selectedDate.replace(/-/g, '.')} 일정
          </h3>
          <button 
            onClick={() => setIsEventModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-sm text-white font-bold transition"
          >
            <Plus size={16} /> 새 일정 추가
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!selectedEvent ? (
            <div className="text-center py-20 text-gray-500 border-2 border-dashed border-[#2a3441] rounded-xl bg-[#151b28]/50">
              <CalIcon size={32} className="mx-auto mb-3 opacity-50" />
              <p>캘린더에서 빈 칸을 <strong>더블 클릭</strong>하여 새 일정을 만들거나,<br/>기존 일정을 클릭해 명단을 관리하세요.</p>
            </div>
          ) : (
            <div className="animate-fade-in space-y-6">
              
              <div className="bg-[#151b28] border border-[#2a3441] rounded-xl p-5 relative">
                <button onClick={() => handleDeleteEvent(selectedEvent.event_id)} className="absolute top-4 right-4 text-gray-500 hover:text-red-500 p-1 bg-gray-800 rounded transition">
                  <Trash2 size={16} />
                </button>
                <div className="flex gap-2 mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${selectedEvent.cohort_id === 0 ? 'bg-orange-900/50 text-orange-400 border-orange-800' : 'bg-blue-900/50 text-blue-400 border-blue-800'}`}>
                    {selectedEvent.cohort_id === 0 ? '전체 공통 행사' : `${selectedEvent.cohort_id}기 전용`}
                  </span>
                  <span className="text-[10px] bg-[#1e293b] border border-[#334155] px-2 py-0.5 rounded font-bold text-gray-300">
                    {selectedEvent.event_type}
                  </span>
                </div>
                {/* 🚨 QA 8번 해결: break-all 적용하여 화면 레이아웃 찢어짐 방지 */}
                <h2 className="text-xl font-bold text-white mb-2 break-all">{selectedEvent.title}</h2>
                <p className="text-sm text-gray-400 whitespace-pre-wrap break-all">{selectedEvent.description || "상세 설명이 없습니다."}</p>
              </div>

              {/* 신청 명단 관리 영역 */}
              <div className="border border-[#2a3441] rounded-xl overflow-hidden shadow-sm">
                <div className="bg-[#151b28] px-5 py-3 border-b border-[#2a3441] flex justify-between items-center">
                  <span className="font-bold text-gray-300 flex items-center gap-2"><Users size={16} className="text-green-400"/> 참석/신청 명단</span>
                  <span className="bg-[#1e293b] text-gray-300 border border-[#334155] px-2.5 py-0.5 rounded-full text-xs font-bold">
                    {roster.filter(r => r.status === "신청완료").length}명 신청
                  </span>
                </div>

                <div className="p-4 bg-[#0b0f17] border-b border-[#2a3441] flex gap-2 relative">
                  <div className="relative flex-grow">
                    <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder={`+ ${selectedCohort}기 학생 이름 또는 조 검색...`}
                      value={traineeSearchTerm}
                      onChange={(e) => {
                        setTraineeSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                        setSelectedTraineeId(""); 
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                      className="w-full bg-[#1e293b] border border-[#334155] text-white text-sm rounded-lg py-2 pl-9 pr-3 focus:outline-none focus:border-blue-500 shadow-inner"
                    />
                    
                    {isDropdownOpen && (
                      <div className="absolute z-20 w-full mt-1 bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl max-h-48 overflow-y-auto hide-scroll">
                        {allTrainees
                          .filter(t => !t.is_dropped && (t.name.includes(traineeSearchTerm) || (t.team_name && t.team_name.includes(traineeSearchTerm))))
                          .map(t => (
                            <div
                              key={t.id}
                              className="px-4 py-2.5 cursor-pointer hover:bg-blue-600 border-b border-gray-700/50 last:border-0 text-sm text-gray-200 flex justify-between items-center transition"
                              onMouseDown={(e) => e.preventDefault()} 
                              onClick={() => {
                                setSelectedTraineeId(t.id);
                                setTraineeSearchTerm(`${t.name} (${t.team_name || '미배정'})`);
                                setIsDropdownOpen(false);
                              }}
                            >
                              <span className="font-bold text-white">{t.name}</span>
                              <span className="text-xs font-medium text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{t.team_name || '미배정'}</span>
                            </div>
                        ))}
                        {allTrainees.filter(t => !t.is_dropped && (t.name.includes(traineeSearchTerm) || (t.team_name && t.team_name.includes(traineeSearchTerm)))).length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">검색 결과가 없습니다.</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <button onClick={handleAddTraineeToEvent} className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg transition flex items-center justify-center shadow">
                    <UserPlus size={18} />
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto bg-[#111722] hide-scroll">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#151b28] border-b border-[#2a3441] text-gray-500 text-[11px] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4 font-bold">이름</th>
                        <th className="py-2.5 px-4 font-bold">신청일시</th>
                        <th className="py-2.5 px-4 font-bold text-center">상태/취소</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a3441]/50 text-gray-300">
                      {roster.map(r => (
                        <tr key={r.reg_id} className={`hover:bg-[#1e293b]/50 ${r.status === '취소됨' ? 'opacity-50' : ''}`}>
                          <td className="py-3 px-4 font-bold text-white">{r.trainee_name}</td>
                          <td className="py-3 px-4 text-[10px] text-gray-400 font-medium tracking-wide">
                            {new Date(r.reg_date).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {r.status === "신청완료" ? (
                              <button onClick={() => handleCancelRegistration(r.reg_id)} className="text-xs bg-red-900/30 text-red-400 border border-red-800/50 hover:bg-red-500 hover:text-white px-2 py-1 rounded transition">
                                취소
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500 font-bold flex items-center justify-center gap-1"><XCircle size={12}/> 취소됨</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {roster.length === 0 && (
                        <tr><td colSpan="3" className="py-8 text-center text-xs text-gray-500">신청 명단이 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 일정 추가 모달창 */}
      {isEventModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-[#111722] border border-[#2a3441] rounded-2xl w-[450px] shadow-2xl flex flex-col overflow-hidden">
             <div className="px-6 py-4 bg-[#151b28] border-b border-[#2a3441] flex justify-between items-center">
               <h3 className="font-bold text-white flex items-center gap-2"><CalIcon size={18} className="text-blue-500"/> 새 일정 등록</h3>
               <button onClick={() => setIsEventModalOpen(false)}><X size={20} className="text-gray-400 hover:text-white"/></button>
             </div>
             
             <div className="p-6 space-y-4">
               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">일정 날짜</p>
                 <div className="bg-[#1e293b] p-3 rounded-lg text-blue-400 font-bold border border-[#334155]">{selectedDate}</div>
               </div>
               
               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">일정/행사 종류</p>
                 <select 
                   value={eventForm.event_type} 
                   onChange={(e) => setEventForm({...eventForm, event_type: e.target.value})} 
                   className="w-full bg-[#1e293b] p-3 text-white rounded-lg border border-[#334155] focus:outline-none focus:border-blue-500 cursor-pointer"
                 >
                   <option value="행사">🎉 일반 행사 / 이벤트</option>
                   <option value="교육/특강">📚 교육 / 특강</option>
                   <option value="휴일">🌴 휴일 / 공휴일</option>
                 </select>
               </div>
               
               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">행사명 (타이틀)</p>
                 {/* 🚨 QA 8번 해결: maxLength 추가로 50자 제한 */}
                 <input 
                   type="text"
                   maxLength={50}
                   value={eventForm.title} 
                   onChange={(e) => setEventForm({...eventForm, title: e.target.value})} 
                   className="w-full bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500" 
                   placeholder="예) AI 네이티브 해커톤 1일차 (최대 50자)" 
                 />
               </div>

               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">상세 내용 (선택)</p>
                 {/* 🚨 QA 8번 해결: maxLength 추가로 300자 제한 */}
                 <textarea 
                   maxLength={300}
                   value={eventForm.description} 
                   onChange={(e) => setEventForm({...eventForm, description: e.target.value})} 
                   className="w-full h-24 bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none hide-scroll" 
                   placeholder="행사 장소, 주의사항 등을 기록하세요. (최대 300자)" 
                 />
               </div>

               <label className="flex items-center gap-2 cursor-pointer bg-[#151b28] p-3 rounded-lg border border-[#2a3441] hover:bg-[#1e293b] transition">
                 <input 
                   type="checkbox" 
                   checked={eventForm.isCommon}
                   onChange={(e) => setEventForm({...eventForm, isCommon: e.target.checked})}
                   className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 bg-gray-700 border-gray-600"
                 />
                 <span className="text-sm text-gray-300 font-bold">모든 기수(1,2기..) 공통 행사로 등록</span>
               </label>
               
               <button onClick={handleCreateEvent} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition mt-2 shadow-lg shadow-blue-900/50">
                 일정 및 명단 보드 생성하기
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;