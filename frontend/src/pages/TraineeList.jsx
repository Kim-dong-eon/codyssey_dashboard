import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { User, MessageSquare, X, Search, TrendingUp, Trash2, Filter, Headset, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const TraineeList = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [trainees, setTrainees] = useState([]);
  const [teams, setTeams] = useState([]); 
  
  const [searchTerm, setSearchTerm] = useState(""); 
  const [teamFilter, setTeamFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [detailData, setDetailData] = useState(null);

  // ✅ 신규: 상담 기록 모달 상태 관리
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactTarget, setContactTarget] = useState(null);
  const [contactForm, setContactForm] = useState({ method: '대면', topic: '', content: '' });

  useEffect(() => {
    fetchTrainees();
    fetchTeams();
  }, [selectedCohort]);

  const fetchTrainees = async () => {
    const res = await fetch(`http://localhost:8000/api/trainees/cohort/${selectedCohort}`);
    if (res.ok) setTrainees(await res.json());
  };

  const fetchTeams = async () => {
    const res = await fetch(`http://localhost:8000/api/teams/cohort/${selectedCohort}`);
    if (res.ok) setTeams(await res.json());
  };

  const handleRowClick = async (trainee) => {
    setSelectedTrainee(trainee.id);
    const res = await fetch(`http://localhost:8000/api/trainees/${trainee.id}/detail`);
    if (res.ok) setDetailData(await res.json());
  };

  const handleTeamChange = async (e) => {
    const newTeamId = e.target.value === "null" ? null : parseInt(e.target.value);
    await fetch(`http://localhost:8000/api/trainees/${selectedTrainee}/team`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_team_id: newTeamId })
    });
    alert("편성조가 변경되었습니다.");
    fetchTrainees();
    handleRowClick({ id: selectedTrainee });
  };

  const handleDropToggle = async () => {
    const isDropping = !detailData.trainee.is_dropped;
    if(window.confirm(`이 학생을 ${isDropping ? '드랍(중도포기)' : '복구'} 처리하시겠습니까?`)) {
      await fetch(`http://localhost:8000/api/trainees/${selectedTrainee}/drop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_dropped: isDropping })
      });
      fetchTrainees();
      handleRowClick({ id: selectedTrainee });
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!contactId) return alert("오류: 삭제할 기록의 고유 번호를 찾을 수 없습니다.");
    
    if(window.confirm("이 상담 기록을 삭제하시겠습니까?")) {
      const res = await fetch(`http://localhost:8000/api/trainees/contact/${contactId}`, { method: 'DELETE' });
      if (res.ok) {
        setDetailData(prev => ({
          ...prev,
          logs: prev.logs.filter(log => log.contact_id !== contactId)
        }));
      } else {
        alert("삭제 실패: 서버에 오류가 발생했습니다.");
      }
    }
  };

  // ✅ 신규: 상담 모달 열기
  const openContactModal = (e, trainee) => {
    e.stopPropagation();
    setContactTarget(trainee);
    setContactForm({ method: '대면', topic: '', content: '' });
    setIsContactModalOpen(true);
  };

  // ✅ 신규: 상담 폼 제출 (연락 방식, 주제, 내용 모두 저장)
  const handleContactSubmit = async () => {
    if (!contactForm.topic || !contactForm.content) {
      return alert("주제와 내용을 모두 입력해주세요.");
    }
    
    await fetch(`http://localhost:8000/api/trainees/${contactTarget.id}/contact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contact_date: new Date().toISOString(), 
        contact_method: contactForm.method, 
        topic: contactForm.topic, 
        content: contactForm.content, 
        manager_name: "퍼실리테이터" 
      })
    });
    
    setIsContactModalOpen(false);
    if (selectedTrainee === contactTarget.id) handleRowClick({ id: contactTarget.id }); 
  };

  const filteredAndSortedTrainees = trainees
    .filter(t => {
      const matchName = t.name.includes(searchTerm);
      let matchTeam = false;
      if (teamFilter === "all") matchTeam = true;
      else if (teamFilter === "unassigned") matchTeam = !t.team_name;
      else if (teamFilter === "tech_support") matchTeam = t.is_tech_linked === true;
      else matchTeam = t.team_name === teamFilter;

      const matchLevel = levelFilter === "all" || t.level === parseInt(levelFilter);
      return matchName && matchTeam && matchLevel;
    })
    .sort((a, b) => {
      if (a.is_dropped && !b.is_dropped) return 1;
      if (!a.is_dropped && b.is_dropped) return -1;
      return 0;
    });

  return (
    <div className="p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex gap-6 relative overflow-hidden">
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* 왼쪽 교육생 목록 */}
      <div className="flex-grow flex flex-col bg-[#151b28] border border-[#2a3441] rounded-2xl overflow-hidden shadow-lg min-w-0">
        
        <div className="px-6 py-4 bg-[#111722] border-b border-[#2a3441] flex flex-col gap-4 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <User size={20} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white">교육생 전체 명부</h2>
            </div>
            
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input 
                type="text" 
                placeholder="교육생 이름 검색..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 shadow-inner"
              />
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Filter size={16} className="text-gray-500" />
            <select 
              value={teamFilter} 
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-[#1e293b] border border-[#334155] text-gray-300 text-sm rounded-lg py-1.5 px-3 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">모든 조 보기</option>
              <option value="tech_support">🎧 기술지원 연계 인원</option>
              <option value="unassigned">미배정 인원만</option>
              <optgroup label="퍼실 전담팀">
                {teams.filter(t => t.team_id !== null).map(t => (
                  <option key={t.team_id} value={t.team_name}>{t.team_name}</option>
                ))}
              </optgroup>
            </select>

            <select 
              value={levelFilter} 
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-[#1e293b] border border-[#334155] text-gray-300 text-sm rounded-lg py-1.5 px-3 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">모든 단계 보기</option>
              <option value="1">1단계 진행중</option>
              <option value="2">2단계 진행중</option>
              <option value="3">3단계 진행중</option>
            </select>
            
            <span className="text-xs text-gray-500 ml-auto">검색 결과: {filteredAndSortedTrainees.length}명</span>
          </div>
        </div>
        
        <div className="flex-grow overflow-y-auto hide-scroll">
          <table className="w-full text-center text-sm">
            <thead className="bg-[#111722] border-b border-[#2a3441] text-gray-400 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-4 font-medium w-1/4">이름</th>
                <th className="py-4 font-medium w-1/4">소속 조</th>
                <th className="py-4 font-medium w-1/4">진도 단계</th>
                <th className="py-4 font-medium w-32">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3441]/50">
              {filteredAndSortedTrainees.map(t => {
                const isSelected = selectedTrainee === t.id;
                const rowStyle = t.is_dropped ? (isSelected ? 'bg-red-900/30' : 'bg-red-900/10 opacity-70') : (isSelected ? 'bg-blue-900/20' : 'hover:bg-[#1e293b]/50');
                const textColor = t.is_dropped ? 'text-red-400' : 'text-white';
                
                return (
                  <tr key={t.id} onClick={() => handleRowClick(t)} className={`cursor-pointer transition-colors ${rowStyle}`}>
                    <td className={`py-4 font-bold flex items-center justify-center gap-2 ${textColor}`}>
                      {t.name}
                      {t.requires_attention && <AlertTriangle size={14} className="text-red-500 fill-red-500/20" title="위험/집중관리 인원" />}
                      {t.is_tech_linked && <Headset size={14} className="text-cyan-400" title="기술지원 연계됨" />}
                      {t.is_dropped && <span className="text-[10px] bg-red-900/80 text-red-200 px-1.5 py-0.5 rounded font-bold tracking-wider border border-red-700/50">드랍</span>}
                    </td>
                    <td className="py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${t.is_dropped ? 'bg-red-900/30 text-red-400 border-red-800/50' : (t.team_name ? 'bg-blue-900/20 text-blue-400 border-blue-800/50' : 'bg-gray-800 text-gray-400 border-gray-700')}`}>
                        {t.team_name || '미배정'}
                      </span>
                    </td>
                    <td className={`py-4 font-medium ${t.is_dropped ? 'text-red-400/70' : 'text-gray-300'}`}>{t.level}단계</td>
                    <td className="py-4 px-2">
                      <button onClick={(e) => openContactModal(e, t)} className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-bold transition border ${t.is_dropped ? 'bg-red-900/20 text-red-400 border-red-900 hover:bg-red-900/60' : 'bg-[#1e293b] border-[#334155] text-gray-300 hover:bg-blue-600 hover:text-white hover:border-blue-500'}`}>
                        <MessageSquare size={14} /> 상담
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAndSortedTrainees.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Search size={32} className="mb-3 opacity-50" />
                      <p>조건에 일치하는 교육생이 없습니다.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 오른쪽 사이드 패널 (상세 프로필) */}
      {selectedTrainee && detailData && (
        <div className="w-[500px] bg-[#111722] border border-[#2a3441] rounded-2xl flex flex-col h-full shadow-2xl shrink-0 animate-fade-in-right overflow-hidden">
          
          <div className="px-6 py-5 border-b border-[#2a3441] flex justify-between items-center bg-[#151b28] shrink-0">
            <h3 className="font-extrabold text-white text-lg">교육생 상세 프로필</h3>
            <button onClick={() => setSelectedTrainee(null)} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"><X size={20} /></button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-grow space-y-6 hide-scroll bg-[#0b0f17]">
            
            <div className="flex gap-4 items-start">
              <div 
                onClick={handleDropToggle}
                className={`w-24 h-24 shrink-0 flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer transition-colors shadow-sm ${detailData.trainee.is_dropped ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-[#1e293b] border-[#334155] text-gray-400 hover:border-gray-400'}`}
              >
                <span className="text-xs font-bold mb-2 tracking-wide">드랍 상태</span>
                <div className={`w-6 h-6 border-2 rounded flex items-center justify-center ${detailData.trainee.is_dropped ? 'bg-red-500 border-red-500' : 'border-gray-500'}`}>
                  {detailData.trainee.is_dropped && <X size={16} className="text-white font-bold" />}
                </div>
              </div>

              <div className="flex-grow border border-[#2a3441] rounded-xl overflow-hidden text-sm shadow-sm bg-[#151b28]">
                <div className="grid grid-cols-2 border-b border-[#2a3441]">
                  <div className="px-4 py-2.5 border-r border-[#2a3441] flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">이름</span><span className="font-bold text-white">{detailData.trainee.name}</span></div>
                  <div className="px-4 py-2.5 flex flex-col">
                    <span className="text-[10px] text-gray-500 font-bold mb-0.5">편성조 (변경 가능)</span>
                    <select value={detailData.trainee.team_id || "null"} onChange={handleTeamChange} className="bg-transparent text-blue-400 font-bold focus:outline-none cursor-pointer">
                      <option value="null">미배정</option>
                      {teams.filter(t => t.team_id !== null).map(team => (
                        <option key={team.team_id} value={team.team_id}>{team.team_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-b border-[#2a3441]">
                  <div className="px-4 py-2.5 border-r border-[#2a3441] flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">연락처</span><span className="text-gray-300">{detailData.trainee.phone || "미입력"}</span></div>
                  <div className="px-4 py-2.5 flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">전공</span><span className="text-gray-300">{detailData.trainee.major}</span></div>
                </div>
                <div className="grid grid-cols-2 border-b border-[#2a3441]">
                  <div className="px-4 py-2.5 border-r border-[#2a3441] flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">이메일</span><span className="text-gray-300 text-xs truncate" title={detailData.trainee.email}>{detailData.trainee.email}</span></div>
                  <div className="px-4 py-2.5 flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">학력</span><span className="text-gray-300">{detailData.trainee.education}</span></div>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-4 py-2.5 border-r border-[#2a3441] flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">전공여부</span><span className="text-gray-300">{detailData.trainee.is_major}</span></div>
                  <div className="px-4 py-2.5 flex flex-col"><span className="text-[10px] text-gray-500 font-bold mb-0.5">재직여부</span><span className="text-gray-300">{detailData.trainee.is_employed}</span></div>
                </div>
              </div>
            </div>

            <div className="border border-[#2a3441] rounded-xl p-5 bg-[#151b28] shadow-sm">
              <div className="flex justify-between items-center border-b border-[#2a3441] pb-3 mb-4">
                <span className="font-bold text-blue-400 text-lg">{detailData.trainee.team_name || "미배정"} <span className="text-white">/</span> {detailData.trainee.current_level || 1}단계</span>
                <span className="text-xs font-bold text-gray-400 bg-[#1e293b] px-2.5 py-1 rounded border border-[#334155]">진행 과제: {detailData.trainee.personal_tasks_done || 0}개</span>
              </div>
              
              <h4 className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1.5"><TrendingUp size={14} /> 단계별 진도 성장 그래프</h4>
              <div className="h-44 w-full bg-[#111722] rounded-lg border border-[#2a3441] p-3 shadow-inner">
                {detailData.progress && detailData.progress.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={detailData.progress} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" vertical={false} />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} domain={[0, 3]} tickCount={4} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#60a5fa' }}/>
                      <Line type="stepAfter" dataKey="level" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#1e3a8a', strokeWidth: 2, stroke: '#3b82f6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-gray-500">진도 데이터가 존재하지 않습니다.</div>
                )}
              </div>
            </div>

            <div className="border border-[#2a3441] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#151b28] px-5 py-3 border-b border-[#2a3441] flex justify-between items-center">
                <span className="font-bold text-gray-300 text-sm flex items-center gap-2"><MessageSquare size={16} className="text-purple-400" /> 상담 및 지원 내역</span>
                <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{detailData.logs?.length || 0}건</span>
              </div>
              
              <div className="max-h-64 overflow-y-auto bg-[#111722] hide-scroll">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#151b28] border-b border-[#2a3441] text-gray-500 text-[11px] uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-5 font-bold w-24">날짜 및 방식</th>
                      <th className="py-2.5 px-5 font-bold">기록 내용</th>
                      <th className="py-2.5 px-5 font-bold w-12 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a3441]/50 text-gray-300">
                    {detailData.logs && detailData.logs.length > 0 ? (
                      detailData.logs.map((log) => {
                        return (
                          <tr key={log.contact_id} className="hover:bg-[#1e293b]/50 transition-colors group">
                            <td className="py-4 px-5 text-xs align-top whitespace-nowrap text-gray-400 font-medium">
                              {new Date(log.contact_date).toLocaleDateString()}
                              {/* ✅ 연락 방식 뱃지 추가 */}
                              <div className="mt-1.5">
                                <span className="bg-[#1e293b] text-gray-300 border border-[#334155] px-1.5 py-0.5 rounded text-[10px]">
                                  {log.contact_method}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-5 text-xs align-top">
                              <span className="font-bold text-blue-400 block mb-1.5 text-[13px]">{log.topic}</span>
                              <span className="leading-relaxed text-gray-300 whitespace-pre-wrap">{log.content}</span>
                            </td>
                            <td className="py-4 px-5 text-center align-top">
                              <button onClick={() => handleDeleteContact(log.contact_id)} className="text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-colors p-1.5 rounded-md opacity-50 group-hover:opacity-100">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan="3" className="py-10 text-center text-xs text-gray-500">기록된 상담 내역이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ✅ 신규: 상담 기록 추가 모달창 */}
      {isContactModalOpen && contactTarget && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 animate-fade-in">
          <div className="bg-[#111722] border border-[#2a3441] rounded-2xl w-[500px] shadow-2xl flex flex-col overflow-hidden">
             <div className="px-6 py-4 bg-[#151b28] border-b border-[#2a3441] flex justify-between items-center">
               <h3 className="font-bold text-white flex items-center gap-2"><MessageSquare size={18} className="text-blue-500"/> 상담 기록 작성</h3>
               <button onClick={() => setIsContactModalOpen(false)}><X size={20} className="text-gray-400 hover:text-white"/></button>
             </div>
             
             <div className="p-6 space-y-5">
               <div>
                 <p className="text-sm text-gray-400 mb-1 font-bold">대상 학생</p>
                 <p className="text-lg font-bold text-white">{contactTarget.name} <span className="text-xs font-normal bg-gray-800 px-2 py-0.5 rounded text-gray-400 ml-2">{contactTarget.team_name || "미배정"}</span></p>
               </div>
               
               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">연락 방식 (채널)</p>
                 <select 
                   value={contactForm.method} 
                   onChange={(e) => setContactForm({...contactForm, method: e.target.value})} 
                   className="w-full bg-[#1e293b] p-3 text-white rounded-lg border border-[#334155] focus:outline-none focus:border-blue-500 cursor-pointer"
                 >
                   <option value="대면">👥 대면 상담</option>
                   <option value="전화">📞 전화 통화</option>
                   <option value="슬랙/메신저">💬 슬랙 / 메신저</option>
                   <option value="온라인 화상">💻 온라인 화상회의</option>
                   <option value="기타">기타</option>
                 </select>
               </div>
               
               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">상담 주제</p>
                 <input 
                   type="text"
                   value={contactForm.topic} 
                   onChange={(e) => setContactForm({...contactForm, topic: e.target.value})} 
                   className="w-full bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500" 
                   placeholder="예) 진도 부진 사유 파악, 프로젝트 팀장 면담 등" 
                 />
               </div>

               <div>
                 <p className="text-sm text-gray-400 mb-1.5 font-bold">상세 내용 (메모)</p>
                 <textarea 
                   value={contactForm.content} 
                   onChange={(e) => setContactForm({...contactForm, content: e.target.value})} 
                   className="w-full h-32 bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none hide-scroll" 
                   placeholder="학생과 나눈 주요 대화 내용이나 특이사항을 기록해주세요." 
                 />
               </div>
               
               <button onClick={handleContactSubmit} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition mt-2 shadow-lg shadow-blue-900/50">
                 상담 내역 DB 저장
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TraineeList;