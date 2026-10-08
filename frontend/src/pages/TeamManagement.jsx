import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { GripVertical, Users, PlusCircle, UsersIcon, X } from 'lucide-react';

const TeamManagement = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [teams, setTeams] = useState([]);
  
  // 일괄 등록 모달 상태
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [parsedList, setParsedList] = useState([]);
  const [targetTeamId, setTargetTeamId] = useState("unassigned");

  const fetchTeams = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/teams/cohort/${selectedCohort}`);
      if (res.ok) setTeams(await res.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchTeams(); }, [selectedCohort]);

  // ✅ 1. 자유로운 조 추가 기능
  const handleAddTeam = async () => {
    const teamName = prompt("추가할 조 이름을 입력하세요 (예: 1조, 2조, A팀 등):");
    if (!teamName) return;

    await fetch(`http://localhost:8000/api/teams/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohort_id: selectedCohort, team_name: teamName })
    });
    fetchTeams();
  };

  // ✅ 2. 엑셀 텍스트 자동 분석 (이름과 이메일 분리)
  const handleBulkTextChange = (e) => {
    const text = e.target.value;
    setBulkText(text);

    // 정규식(Regex)을 이용해 이메일 패턴을 찾고, 그 앞의 글자를 이름으로 추출
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = [...text.matchAll(emailRegex)];
    let result = [];
    let lastIndex = 0;

    matches.forEach(match => {
      const email = match[0];
      // 직전 이메일 끝난 지점부터 이번 이메일 시작 지점까지의 텍스트가 '이름' (공백 제거)
      const name = text.substring(lastIndex, match.index).replace(/[\s\r\n]/g, '');
      if (name && email) result.push({ name, email });
      lastIndex = match.index + email.length;
    });
    
    setParsedList(result);
  };

  // ✅ 3. 분석된 명단 DB로 일괄 전송
  const handleBulkSubmit = async () => {
    if (parsedList.length === 0) return alert("인식된 명단이 없습니다.");
    
    const finalTeamId = targetTeamId === "unassigned" ? null : parseInt(targetTeamId);

    await fetch(`http://localhost:8000/api/trainees/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cohort_id: selectedCohort,
        team_id: finalTeamId,
        trainees: parsedList
      })
    });

    alert(`${parsedList.length}명이 성공적으로 배정되었습니다!`);
    setIsBulkModalOpen(false);
    setBulkText("");
    setParsedList([]);
    fetchTeams(); // 화면 새로고침
  };

  // --- 드래그 앤 드롭 ---
  const handleDragStart = (e, traineeId, sourceTeamId) => {
    e.dataTransfer.setData('traineeId', traineeId);
    e.dataTransfer.setData('sourceTeamId', sourceTeamId);
  };
  const handleDragOver = (e) => e.preventDefault(); 
  const handleDrop = async (e, dropTeamId) => {
    e.preventDefault();
    const traineeId = parseInt(e.dataTransfer.getData('traineeId'));
    const sourceTeamId = e.dataTransfer.getData('sourceTeamId');
    const parsedSourceId = sourceTeamId === "null" ? null : parseInt(sourceTeamId);

    if (parsedSourceId === dropTeamId) return; 

    const newTeams = [...teams];
    const sourceTeam = newTeams.find(t => t.team_id === parsedSourceId);
    const targetTeam = newTeams.find(t => t.team_id === dropTeamId);
    const trainee = sourceTeam.members.find(m => m.id === traineeId);
    
    sourceTeam.members = sourceTeam.members.filter(m => m.id !== traineeId);
    targetTeam.members.push(trainee);
    setTeams(newTeams);

    await fetch(`http://localhost:8000/api/trainees/${traineeId}/team`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_team_id: dropTeamId })
    });
  };

  const realTeams = teams.filter(t => t.team_id !== null);
  const unassignedTeam = teams.find(t => t.team_id === null);

  return (
    <div className="p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col gap-6 relative">
      
      {/* 1. 상단: 팀플 현황 매트릭스 */}
      <section className="bg-[#151b28] border border-[#2a3441] rounded-xl h-64 overflow-y-auto shrink-0">
        <div className="px-6 py-4 border-b border-[#2a3441] bg-[#111722] sticky top-0 z-10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-500" />
            <h2 className="text-lg font-bold text-white">팀플 진행 현황판</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsBulkModalOpen(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded-lg text-sm text-white font-bold transition">
              <UsersIcon size={16} /> 명단 일괄 등록
            </button>
            <button onClick={handleAddTeam} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg text-sm text-white font-bold transition">
              <PlusCircle size={16} /> 조 추가
            </button>
          </div>
        </div>
        <div className="p-4">
          <table className="w-full text-center text-sm border-collapse">
            <thead>
              <tr className="text-gray-400 border-b border-[#2a3441]">
                <th className="pb-3 font-medium w-1/4">조 이름</th><th className="pb-3">1-1 프로젝트</th><th className="pb-3">2-1 프로젝트</th><th className="pb-3">Final 프로젝트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3441]/50 text-white">
              {realTeams.map(team => (
                <tr key={team.team_id} className="hover:bg-[#1e293b]/30">
                  <td className="py-3 font-bold">{team.team_name}</td>
                  {['1-1', '2-1', 'final'].map(levelStr => {
                    const proj = team.projects?.find(p => p.level === levelStr) || { status: '팀 셋팅 중' };
                    return <td key={levelStr} className="py-3"><span className="px-3 py-1 bg-gray-800 text-gray-400 rounded-full text-xs font-semibold">{proj.status}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. 하단: 조별 인원 편성 (칸반) */}
      <section className="flex-grow flex flex-col min-h-0">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>조별 인원 편성</h2>
        <div className="flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar">
          
          {/* 미배정 칸 */}
          {unassignedTeam && (
            <div className="flex flex-col bg-[#111722] border-2 border-dashed border-gray-700 rounded-xl w-[280px] shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, unassignedTeam.team_id)}>
              <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#111722] shrink-0">
                <span className="font-bold text-gray-400">미배정 대기열</span>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{unassignedTeam.members.length}명</span>
              </div>
              <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-grow">
                {unassignedTeam.members.map(member => (
                  <div key={member.id} draggable onDragStart={(e) => handleDragStart(e, member.id, null)} className="bg-[#1e293b] border border-[#334155] p-3 rounded-lg flex justify-between items-center cursor-grab hover:border-gray-500">
                    <div className="flex items-center gap-2"><GripVertical size={14} className="text-gray-500" /><span className="text-sm font-medium text-gray-300">{member.name}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 생성된 N개 조 칸 */}
          {realTeams.map(team => (
            <div key={team.team_id} className="flex flex-col bg-[#111722] border border-[#2a3441] rounded-xl w-[280px] shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, team.team_id)}>
              <div className="px-4 py-3 border-b border-[#2a3441] flex justify-between items-center bg-[#151b28] rounded-t-xl shrink-0">
                <span className="font-bold text-white">{team.team_name}</span>
                <span className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full">{team.members.length}명</span>
              </div>
              <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-grow">
                {team.members.map(member => (
                  <div key={member.id} draggable onDragStart={(e) => handleDragStart(e, member.id, team.team_id)} className="bg-[#1e293b] border border-blue-900/30 p-3 rounded-lg flex justify-between items-center cursor-grab hover:border-blue-500">
                    <div className="flex items-center gap-2"><GripVertical size={14} className="text-blue-500/50" /><span className="text-sm font-medium text-white">{member.name}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 🚀 명단 일괄 등록 모달창 */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-[#111722] border border-[#2a3441] rounded-xl w-[600px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#2a3441] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">명단 일괄 등록 및 조 배정</h3>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">1. 스프레드시트 텍스트 붙여넣기 (이름과 이메일이 포함된 텍스트)</label>
                <textarea 
                  value={bulkText}
                  onChange={handleBulkTextChange}
                  placeholder="강경모kkm2000@hanmail.net김연후dusgn0330@naver.com..."
                  className="w-full h-32 bg-[#151b28] border border-[#334155] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500"
                ></textarea>
              </div>

              <div className="flex gap-4">
                <div className="w-1/2">
                  <label className="block text-sm text-gray-400 mb-2">2. 분석 결과 ({parsedList.length}명 인식됨)</label>
                  <div className="bg-[#151b28] border border-[#334155] rounded-lg h-40 overflow-y-auto p-2 space-y-1">
                    {parsedList.length === 0 ? <p className="text-xs text-gray-500 p-2">입력된 데이터가 없습니다.</p> : 
                      parsedList.map((t, i) => (
                        <div key={i} className="text-xs text-gray-300 flex justify-between bg-[#1e293b] p-2 rounded">
                          <span className="font-bold">{t.name}</span>
                          <span className="text-gray-500 truncate ml-2">{t.email}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div className="w-1/2 flex flex-col justify-between">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">3. 배정할 조 선택</label>
                    <select 
                      value={targetTeamId} 
                      onChange={(e) => setTargetTeamId(e.target.value)}
                      className="w-full bg-[#151b28] border border-[#334155] rounded-lg p-2.5 text-sm text-white focus:outline-none"
                    >
                      <option value="unassigned">미배정 대기열</option>
                      {realTeams.map(t => (
                        <option key={t.team_id} value={t.team_id}>{t.team_name}로 바로 넣기</option>
                      ))}
                    </select>
                  </div>
                  
                  <button onClick={handleBulkSubmit} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold mt-4 shadow-lg shadow-blue-900/20">
                    DB에 일괄 등록하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TeamManagement;