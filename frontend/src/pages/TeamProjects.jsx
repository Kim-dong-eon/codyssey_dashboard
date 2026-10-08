import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { Users, ChevronDown, ChevronUp, Clock, CheckCircle2, PlayCircle, Filter, Search } from 'lucide-react';

const TeamProjects = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [projectData, setProjectData] = useState([]);
  const [expandedCards, setExpandedCards] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  
  // ✅ 신규: 명단 및 조 이름 검색 상태
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchTeamProjects = async () => {
      const res = await fetch(`http://localhost:8000/api/teams/cohort/${selectedCohort}/projects`);
      if (res.ok) setProjectData(await res.json());
    };
    fetchTeamProjects();
  }, [selectedCohort]);

  const toggleCard = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  const getStatusStyle = (status) => {
    if (!status) return { bg: 'bg-[#1e293b]/30', border: 'border-[#2a3441]', text: 'text-gray-400', badge: 'bg-gray-800 text-gray-400 border border-gray-700' };
    if (status.includes('완료')) return { bg: 'bg-[#22c55e]/5', border: 'border-[#22c55e]/20', text: 'text-[#22c55e]', badge: 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30' };
    if (status.includes('시작') || status.includes('진행')) return { bg: 'bg-blue-900/10', border: 'border-blue-700/30', text: 'text-blue-400', badge: 'bg-blue-900/30 text-blue-400 border border-blue-700/50' };
    if (status.includes('대기')) return { bg: 'bg-yellow-900/10', border: 'border-yellow-700/30', text: 'text-yellow-500', badge: 'bg-yellow-900/30 text-yellow-500 border border-yellow-700/50' };
    return { bg: 'bg-[#1e293b]/30', border: 'border-[#2a3441]', text: 'text-gray-400', badge: 'bg-gray-800 text-gray-400 border border-gray-700' };
  };

  const getPhase = (levelStr) => {
    const lower = levelStr.toLowerCase();
    if (lower.startsWith('1-')) return 'phase1';
    if (lower.startsWith('2-')) return 'phase2';
    if (lower.includes('final')) return 'final';
    return 'other'; 
  };

  const phases = [
    { id: 'phase1', title: '1단계 프로젝트' },
    { id: 'phase2', title: '2단계 프로젝트' },
    { id: 'final', title: 'Final 프로젝트' }
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col gap-6 overflow-hidden">
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex justify-between items-center shrink-0 bg-[#151b28] border border-[#2a3441] p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Users size={24} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">팀 프로젝트 현황 보드</h2>
            <p className="text-sm text-gray-400 mt-1">현재 선택된 기수의 팀플 진행 상태 및 승인 대기 명단 모니터링</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* ✅ 신규: 명단 검색 바 */}
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="참여 명단 또는 조 검색..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111722] border border-[#334155] rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 shadow-inner" 
            />
          </div>

          <div className="flex bg-[#111722] p-1 rounded-xl border border-[#334155] shadow-inner">
            <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${statusFilter === 'all' ? 'bg-[#334155] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              <Filter size={16} /> 전체 보기
            </button>
            <button onClick={() => setStatusFilter('waiting')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${statusFilter === 'waiting' ? 'bg-yellow-900/30 text-yellow-500 border border-yellow-700/50 shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              <Clock size={16} /> 승인 대기
            </button>
            <button onClick={() => setStatusFilter('progress')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${statusFilter === 'progress' ? 'bg-blue-900/30 text-blue-400 border border-blue-700/50 shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              <PlayCircle size={16} /> 진행 중
            </button>
            <button onClick={() => setStatusFilter('completed')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${statusFilter === 'completed' ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/40 shadow' : 'text-gray-400 hover:text-gray-200'}`}>
              <CheckCircle2 size={16} /> 완료됨
            </button>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-6 flex-grow min-h-0">
        {phases.map(phase => {
          
          let phaseCards = [];
          projectData.forEach(team => {
            Object.keys(team.projects).forEach(levelStr => {
              if (getPhase(levelStr) === phase.id) {
                phaseCards.push({
                  team_id: team.team_id,
                  team_name: team.team_name,
                  levelStr: levelStr,
                  ...team.projects[levelStr]
                });
              }
            });
          });

          // 상태 필터 적용
          if (statusFilter === 'waiting') {
            phaseCards = phaseCards.filter(c => c.status && c.status.includes('대기'));
          } else if (statusFilter === 'progress') {
            phaseCards = phaseCards.filter(c => c.status && (c.status.includes('시작') || c.status.includes('진행')));
          } else if (statusFilter === 'completed') {
            phaseCards = phaseCards.filter(c => c.status && c.status.includes('완료'));
          }

          // ✅ 신규: 명단 및 조 이름 검색 필터 적용
          if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            phaseCards = phaseCards.filter(c => 
              (c.member_names && c.member_names.toLowerCase().includes(lowerSearchTerm)) ||
              (c.team_name && c.team_name.toLowerCase().includes(lowerSearchTerm))
            );
          }

          phaseCards.sort((a, b) => {
            if (a.levelStr !== b.levelStr) return a.levelStr.localeCompare(b.levelStr);
            return a.team_id - b.team_id;
          });

          return (
            <div key={phase.id} className="flex flex-col bg-[#111722] border border-[#2a3441] rounded-2xl overflow-hidden h-full shadow-lg">
              
              <div className="px-6 py-5 bg-[#151b28] border-b border-[#2a3441] shrink-0 flex justify-between items-center">
                <h3 className="font-extrabold text-white text-lg">{phase.title}</h3>
                <span className="text-xs font-bold text-gray-300 bg-[#1e293b] border border-[#334155] px-3 py-1.5 rounded-full">
                  {phaseCards.length} 팀
                </span>
              </div>
              
              <div className="p-5 flex-grow overflow-y-auto space-y-4 hide-scroll bg-[#0b0f17]">
                {phaseCards.map(card => {
                  const cardId = `${card.levelStr}-${card.team_id}`;
                  // 검색어가 있을 경우 자동으로 아코디언이 열리도록 처리
                  const isExpanded = searchTerm ? true : expandedCards[cardId];
                  const style = getStatusStyle(card.status);

                  return (
                    <div 
                      key={cardId} 
                      onClick={() => toggleCard(cardId)}
                      className={`border rounded-xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.01] ${style.bg} ${style.border}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className={`text-base font-extrabold ${style.text}`}>{card.team_name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded border border-gray-600/50 bg-gray-900/50 text-gray-400 font-bold tracking-wider">
                            {card.levelStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${style.badge}`}>
                            {card.status || "상태 없음"}
                          </span>
                          <div className={`p-1 rounded-md ${isExpanded ? 'bg-black/20' : 'hover:bg-black/10'}`}>
                            {isExpanded ? <ChevronUp size={16} className={style.text} /> : <ChevronDown size={16} className={style.text} />}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-700/50 animate-fade-in-down">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Users size={12} className="text-gray-500" />
                            <span className="font-bold text-xs text-gray-500">참여 명단</span>
                          </div>
                          <div className="bg-[#0f1520] p-3 rounded-lg border border-[#2a3441] text-sm text-gray-300 leading-relaxed break-keep">
                            {card.member_names || "명단 미등록"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {phaseCards.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-600 text-sm border-2 border-dashed border-[#2a3441] rounded-xl bg-[#151b28]/50">
                    <Filter size={24} className="mb-2 opacity-50" />
                    <span>현재 조건에 맞는 프로젝트가 없습니다.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamProjects;