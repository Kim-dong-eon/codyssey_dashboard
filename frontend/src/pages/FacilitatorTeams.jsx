import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../App';
import { GripVertical, PlusCircle, UsersIcon, X, ExternalLink, Headset, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FacilitatorTeams = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const navigate = useNavigate(); 
  const [teams, setTeams] = useState([]);
  
  // ✅ 신규: 연계된 학생들(기술지원팀) 명단을 담을 상태
  const [techLinkedStudents, setTechLinkedStudents] = useState([]);
  
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [parsedList, setParsedList] = useState([]);
  const [targetTeamId, setTargetTeamId] = useState("unassigned");

  const fetchData = async () => {
    // 1. 일반 팀 데이터 가져오기
    const resTeams = await fetch(`http://localhost:8000/api/teams/cohort/${selectedCohort}`);
    if (resTeams.ok) setTeams(await resTeams.json());

    // 2. 대시보드 API에서 '기술지원 연계(is_tech_linked)' 켜진 학생들만 추출
    const resDashboard = await fetch(`http://localhost:8000/api/dashboard/${selectedCohort}`);
    if (resDashboard.ok) {
      const data = await resDashboard.json();
      const linked = (data.trainees || []).filter(t => t.is_tech_linked === true);
      setTechLinkedStudents(linked);
    }
  };

  useEffect(() => { fetchData(); }, [selectedCohort]);

  const handleAddTeam = async () => {
    const teamName = prompt("추가할 전담팀 이름을 입력하세요 (예: 김재은 퍼실님):");
    if (!teamName) return;
    await fetch(`http://localhost:8000/api/teams/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohort_id: selectedCohort, team_name: teamName })
    });
    fetchData();
  };

  const handleDeleteTeam = async (e, teamId, teamName) => {
    e.stopPropagation(); 
    if (window.confirm(`'${teamName}'을(를) 정말 삭제하시겠습니까?\n\n※ 해당 팀에 소속된 학생들은 '미배정 대기열'로 안전하게 이동됩니다.`)) {
      await fetch(`http://localhost:8000/api/teams/${teamId}`, { method: 'DELETE' });
      fetchData(); 
    }
  };

  const handleBulkTextChange = (e) => {
    const text = e.target.value;
    setBulkText(text);
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = [...text.matchAll(emailRegex)];
    let result = [];
    let lastIndex = 0;
    matches.forEach(match => {
      const email = match[0];
      const name = text.substring(lastIndex, match.index).replace(/[\s\r\n]/g, '');
      if (name && email) result.push({ name, email });
      lastIndex = match.index + email.length;
    });
    setParsedList(result);
  };

  const handleBulkSubmit = async () => {
    if (parsedList.length === 0) return alert("인식된 명단이 없습니다.");
    const finalTeamId = targetTeamId === "unassigned" ? null : parseInt(targetTeamId);
    await fetch(`http://localhost:8000/api/trainees/bulk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohort_id: selectedCohort, team_id: finalTeamId, trainees: parsedList })
    });
    alert(`${parsedList.length}명이 성공적으로 배정되었습니다!`);
    setIsBulkModalOpen(false); setBulkText(""); setParsedList([]); fetchData();
  };

  const handleDragStart = (e, traineeId, sourceTeamId) => {
    e.dataTransfer.setData('traineeId', traineeId);
    e.dataTransfer.setData('sourceTeamId', sourceTeamId);
  };
  const handleDragOver = (e) => e.preventDefault(); 
  const handleDrop = async (e, dropTeamId) => {
    e.preventDefault();
    const traineeId = parseInt(e.dataTransfer.getData('traineeId'));
    const parsedSourceId = e.dataTransfer.getData('sourceTeamId') === "null" ? null : parseInt(e.dataTransfer.getData('sourceTeamId'));
    if (parsedSourceId === dropTeamId) return; 

    const newTeams = [...teams];
    const sourceTeam = newTeams.find(t => t.team_id === parsedSourceId);
    const targetTeam = newTeams.find(t => t.team_id === dropTeamId);
    const trainee = sourceTeam.members.find(m => m.id === traineeId);
    
    sourceTeam.members = sourceTeam.members.filter(m => m.id !== traineeId);
    targetTeam.members.push(trainee);
    setTeams(newTeams);

    await fetch(`http://localhost:8000/api/trainees/${traineeId}/team`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_team_id: dropTeamId })
    });
  };

  const goToTeamDetail = (teamId, teamName) => {
    navigate(`/facilitator-teams/${teamId}`, { state: { teamName } });
  };

  const realTeams = teams.filter(t => t.team_id !== null);
  const unassignedTeam = teams.find(t => t.team_id === null);

  return (
    <div className="p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col gap-6">
      
      <style>{`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>퍼실 전담팀 편성 (Drag & Drop)</h2>
        <div className="flex gap-2">
          <button onClick={() => setIsBulkModalOpen(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-sm text-white font-bold transition">
            <UsersIcon size={16} /> 명단 일괄 등록
          </button>
          <button onClick={handleAddTeam} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm text-white font-bold transition">
            <PlusCircle size={16} /> 전담팀 추가
          </button>
        </div>
      </div>
      
      <div className="flex gap-4 h-full overflow-x-auto pb-4 hide-scroll">
        
        {/* ✅ 개선됨: 연계 명단 리스트가 바로 보이도록 수정된 기술지원팀 보드 */}
        <div className="flex flex-col bg-cyan-950/30 border-2 border-cyan-800/50 rounded-xl w-[280px] shrink-0 shadow-lg">
          <div 
            onClick={() => navigate('/tech-support')}
            className="px-4 py-3 border-b border-cyan-800/50 flex justify-between items-center bg-cyan-950/80 rounded-t-xl shrink-0 cursor-pointer hover:bg-cyan-900/60 transition group"
          >
            <div className="flex items-center gap-1.5">
              <Headset size={16} className="text-cyan-400" />
              <span className="font-bold text-cyan-300 group-hover:text-cyan-100 transition">학습지원 연계팀</span>
            </div>
            {/* 총 연계 인원수 표시 */}
            <span className="text-xs font-bold bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-700">{techLinkedStudents.length}명</span>
          </div>
          
          <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-grow hide-scroll">
            {techLinkedStudents.map(m => (
              <div key={m.id} className="bg-cyan-950/40 border border-cyan-800/50 p-3 rounded-lg flex justify-between items-center cursor-default">
                <div className="flex items-center gap-2">
                  <Headset size={14} className="text-cyan-600" />
                  <span className="text-sm font-medium text-cyan-100">{m.name}</span>
                </div>
                {/* 🚨 진짜 원소속 팀 이름(예: 김재은 퍼실님) 표시 */}
                <span className="text-[10px] text-cyan-500 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-900">{m.team}</span>
              </div>
            ))}
            {techLinkedStudents.length === 0 && (
              <div className="flex flex-col items-center justify-center text-cyan-600/70 text-xs h-full text-center mt-4">
                 <Headset size={24} className="mb-2 opacity-50" />
                 <p>현재 연계 접수된<br/>학생이 없습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 미배정 대기열 */}
        {unassignedTeam && (
          <div className="flex flex-col bg-[#111722] border-2 border-dashed border-gray-700 rounded-xl w-[280px] shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, unassignedTeam.team_id)}>
            <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center shrink-0">
              <span className="font-bold text-gray-400">미배정 대기열</span><span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{unassignedTeam.members.length}명</span>
            </div>
            <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-grow hide-scroll">
              {unassignedTeam.members.map(m => (
                <div key={m.id} draggable onDragStart={(e) => handleDragStart(e, m.id, null)} className="bg-[#1e293b] border border-[#334155] p-3 rounded-lg flex justify-between items-center cursor-grab hover:border-gray-500">
                  <div className="flex items-center gap-2"><GripVertical size={14} className="text-gray-500" /><span className="text-sm font-medium text-gray-300">{m.name}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 일반 퍼실팀들 */}
        {realTeams.map(team => (
          <div key={team.team_id} className="flex flex-col bg-[#111722] border border-[#2a3441] rounded-xl w-[280px] shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, team.team_id)}>
            <div 
              onClick={() => goToTeamDetail(team.team_id, team.team_name)}
              className="px-4 py-3 border-b border-[#2a3441] flex justify-between items-center bg-[#151b28] rounded-t-xl shrink-0 cursor-pointer hover:bg-[#1e293b] transition group"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white group-hover:text-blue-400 transition">{team.team_name}</span>
                <ExternalLink size={12} className="text-gray-500 opacity-0 group-hover:opacity-100 transition" />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-800 text-blue-400 px-2 py-0.5 rounded-full group-hover:bg-blue-900/50 transition">{team.members.length}명</span>
                <button 
                  onClick={(e) => handleDeleteTeam(e, team.team_id, team.team_name)}
                  className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1 hover:bg-gray-800 rounded"
                  title="이 팀 삭제하기"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-grow hide-scroll">
              {team.members.map(m => (
                <div key={m.id} draggable onDragStart={(e) => handleDragStart(e, m.id, team.team_id)} className="bg-[#1e293b] border border-blue-900/30 p-3 rounded-lg flex justify-between items-center cursor-grab hover:border-blue-500">
                  <div className="flex items-center gap-2"><GripVertical size={14} className="text-blue-500/50" /><span className="text-sm font-medium text-white">{m.name}</span></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-[#111722] border border-[#2a3441] rounded-xl w-[600px] shadow-2xl flex flex-col p-6 space-y-4">
             <div className="flex justify-between items-center border-b border-[#2a3441] pb-2">
               <h3 className="font-bold text-white">명단 일괄 등록</h3>
               <button onClick={() => setIsBulkModalOpen(false)}><X size={20} className="text-gray-400"/></button>
             </div>
             <textarea value={bulkText} onChange={handleBulkTextChange} className="w-full h-32 bg-[#151b28] border border-[#334155] rounded-lg p-3 text-sm text-white hide-scroll" placeholder="엑셀 복사본 붙여넣기..." />
             <select value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)} className="w-full bg-[#151b28] p-2.5 text-white rounded-lg border border-[#334155]">
               <option value="unassigned">미배정 대기열</option>
               {realTeams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}로 배정</option>)}
             </select>
             <button onClick={handleBulkSubmit} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold">DB에 일괄 등록하기</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacilitatorTeams;