import './FacilitatorTeams.css';
import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../context/GlobalContext';
import { dashboardApi } from '../api/dashboard';
import { teamsApi } from '../api/teams';
import { traineesApi } from '../api/trainees';
import { GripVertical, PlusCircle, UsersIcon, X, ExternalLink, Headset, Trash2, Search, NotebookPen, LayoutGrid, Table2, UserRound, UserRoundX, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FacilitatorTeams = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [cohortTrainees, setCohortTrainees] = useState([]);

  // ✅ 신규: 연계된 학생들(기술지원팀) 명단을 담을 상태
  const [techLinkedStudents, setTechLinkedStudents] = useState([]);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [parsedList, setParsedList] = useState([]);
  const [targetTeamId, setTargetTeamId] = useState("unassigned");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [memoTarget, setMemoTarget] = useState(null);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [viewMode, setViewMode] = useState('board');
  const [selectedProfile, setSelectedProfile] = useState(null);

  const fetchData = async (silent = false) => {
    if (!selectedCohort) return;
    if (!silent) {
      setIsLoading(true);
      setLoadError("");
    }
    const [teamResult, dashboardResult] = await Promise.allSettled([
      teamsApi.list(selectedCohort),
      dashboardApi.get(selectedCohort, { roster_only: true })
    ]);
    const errors = [];
    if (teamResult.status === 'fulfilled' && Array.isArray(teamResult.value)) {
      setTeams(teamResult.value);
    } else {
      setTeams([]);
      const reason = teamResult.reason?.response?.data?.detail || teamResult.reason?.message;
      errors.push(`전담팀 명단을 불러오지 못했습니다.${reason ? ` (${reason})` : ''}`);
    }
    if (dashboardResult.status === 'fulfilled') {
      const roster = dashboardResult.value?.trainees || [];
      setCohortTrainees(roster);
      setTechLinkedStudents(roster.filter((trainee) => trainee.is_tech_linked));
    } else {
      setTechLinkedStudents([]);
      const reason = dashboardResult.reason?.response?.data?.detail || dashboardResult.reason?.message;
      errors.push(`학습지원 연계 명단을 불러오지 못했습니다.${reason ? ` (${reason})` : ''}`);
    }
    setLoadError(errors.join(' '));
    if (!silent) setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCohort]);

  const handleAddTeam = async () => {
    const teamName = prompt("추가할 전담팀 이름을 입력하세요 (예: 전담팀 A):");
    if (!teamName?.trim()) return;
    await teamsApi.create({ cohort_id: selectedCohort, team_name: teamName.trim() });
    fetchData();
  };

  const handleDeleteTeam = async (e, teamId, teamName) => {
    e.stopPropagation();
    if (window.confirm(`'${teamName}'을(를) 정말 삭제하시겠습니까?\n\n※ 해당 팀에 소속된 학생들은 '미배정 대기열'로 안전하게 이동됩니다.`)) {
      await teamsApi.delete(teamId);
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
    try {
      await traineesApi.createBulk({ cohort_id: selectedCohort, team_id: finalTeamId, trainees: parsedList });
    } catch (error) {
      return alert(error.response?.data?.detail || '교육생 명단을 저장하지 못했습니다.');
    }
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

    const sourceTeam = teams.find((team) => team.team_id === parsedSourceId);
    const targetTeam = teams.find((team) => team.team_id === dropTeamId);
    const trainee = sourceTeam?.members.find((member) => member.id === traineeId);
    if (!sourceTeam || !targetTeam || !trainee) return;

    setTeams((current) => current.map((team) => {
      if (team.team_id === parsedSourceId) {
        return { ...team, members: team.members.filter((member) => member.id !== traineeId) };
      }
      if (team.team_id === dropTeamId) {
        return { ...team, members: [...team.members, trainee] };
      }
      return team;
    }));

    try {
      await traineesApi.move(traineeId, { to_team_id: dropTeamId });
    } catch (error) {
      await fetchData();
      window.alert(error.response?.data?.detail || '조 이동에 실패했습니다.');
    }
  };

  const goToTeamDetail = (teamId, teamName) => {
    navigate(`/facilitator-teams/${teamId}`, { state: { teamName } });
  };

  const openTraineeMemo = (event, trainee) => {
    event.stopPropagation();
    setMemoTarget(trainee);
    setMemoTitle("");
    setMemoContent("");
  };

  const handleSaveTraineeMemo = async () => {
    if (!memoTarget?.id || !memoContent.trim()) return alert('교육생과 메모 내용을 확인해주세요.');
    try {
      await traineesApi.createMemo(memoTarget.id, {
        title: memoTitle.trim() || null,
        content: memoContent.trim(),
      });
      setMemoTarget(null);
      setMemoTitle("");
      setMemoContent("");
      alert(`${memoTarget.name} 팀 메모를 저장했습니다.`);
    } catch (error) {
      alert(error.response?.data?.detail || '팀 메모를 저장하지 못했습니다.');
    }
  };

  const handleQuickDrop = async (event, trainee) => {
    event.stopPropagation();
    const isDropping = !trainee.is_dropped;
    if (!window.confirm(`${trainee.name} 교육생을 ${isDropping ? '드랍' : '복구'} 처리할까요?`)) return;
    const reason = isDropping ? window.prompt('드랍 사유를 입력하세요. (선택)') : '';
    if (reason === null) return;
    const today = new Date();
    const dropDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    try {
      await traineesApi.updateDropStatus(trainee.id, {
        is_dropped: isDropping,
        drop_date: isDropping ? dropDate : null,
        drop_reason: isDropping ? reason.trim() || null : null,
      });
      if (selectedProfile?.id === trainee.id) setSelectedProfile(null);
      await fetchData();
    } catch (error) {
      window.alert(error.response?.data?.detail || '드랍 상태를 변경하지 못했습니다.');
    }
  };

  const query = searchTerm.trim().toLocaleLowerCase();
  const filterMembers = (members) => members.filter((member) => !query || member.name.toLocaleLowerCase().includes(query));
  const selectableTrainees = teams.flatMap((team) => (team.members || []).map((member) => ({
    ...member,
    teamLabel: team.team_name,
  })));
  const renderMemberCard = (member, sourceTeamId) => {
    const details = cohortTrainees.find((trainee) => trainee.id === member.id) || member;
    const hasProgress = details.done !== undefined && details.target !== undefined;
    const target = Math.max(Number(details.target) || 0, 1);
    const done = Number(details.done) || 0;
    const percentage = hasProgress ? Math.min(100, Math.round((done / target) * 100)) : 0;
    return (
      <div key={member.id} draggable onClick={() => setSelectedProfile((current) => current?.id === details.id ? null : details)} onDragStart={(e) => handleDragStart(e, member.id, sourceTeamId)} className="facilitatorteams__group_001">
        <div className="facilitatorteams__group_002">
          <div className="facilitatorteams__group_003"><GripVertical size={14} className="facilitatorteams__gripvertical_001" /><span className="facilitatorteams__label_001">{member.name}</span></div>
          <div className="facilitatorteams__group_004">
            <button onClick={(event) => openTraineeMemo(event, member)} title={`${member.name} 메모 작성`} aria-label={`${member.name} 메모 작성`} className="facilitatorteams__button_001"><NotebookPen size={14} /></button>
            <button onClick={(event) => handleQuickDrop(event, details)} title={`${member.name} 드랍 처리`} aria-label={`${member.name} 드랍 처리`} className="facilitatorteams__button_002"><UserRoundX size={14} /></button>
          </div>
        </div>
        <div className="facilitatorteams__group_005"><span>{details.level || member.level || 1}단계 진도</span><span className={percentage >= 100 ? 'facilitatorteams__variant_001' : 'facilitatorteams__variant_002'}>{hasProgress ? `${done}/${target} · ${percentage}%` : '진도 정보 없음'}</span></div>
        <div role="progressbar" aria-label={`${member.name} 필수 과제 진도`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} className="facilitatorteams__group_006">
          <div className={`facilitatorteams__variant_003 ${percentage >= 100 ? 'facilitatorteams__variant_004' : 'facilitatorteams__variant_005'}`} style={{ '--progress-width': `${percentage}%` }} />
        </div>
      </div>
    );
  };

  const realTeams = teams.filter(t => t.team_id !== null);
  const unassignedTeam = teams.find(t => t.team_id === null);
  const visibleTechLinkedStudents = techLinkedStudents.filter((member) => !query || `${member.name} ${member.team || ''}`.toLocaleLowerCase().includes(query));
  const visibleMemberCount = filterMembers(unassignedTeam?.members || []).length + realTeams.reduce((total, team) => total + filterMembers(team.members || []).length, 0);

  return (
    <div className="facilitatorteams__group_007">

      <div className="facilitatorteams__group_008">
        <div>
          <h2 className="facilitatorteams__title_001"><span className="facilitatorteams__label_002"></span>퍼실 전담팀 편성</h2>
          <p className="facilitatorteams__text_001">보드에서 팀을 편성하고, 표에서는 교육생을 선택해 상세 정보를 확인합니다.</p>
        </div>
        <div className="facilitatorteams__group_009">
          <label className="facilitatorteams__label_003">
            <Search size={16} className="facilitatorteams__search_001" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="교육생 이름 검색" className="facilitatorteams__input_001" />
          </label>
          {query && <span className="facilitatorteams__label_004">검색 결과 {visibleMemberCount}명</span>}
          <div className="facilitatorteams__group_010">
            <button type="button" onClick={() => setViewMode('board')} className={`facilitatorteams__variant_006 ${viewMode === 'board' ? 'facilitatorteams__variant_007' : 'facilitatorteams__variant_008'}`}><LayoutGrid size={14} /> 보드</button>
            <button type="button" onClick={() => setViewMode('table')} className={`facilitatorteams__variant_006 ${viewMode === 'table' ? 'facilitatorteams__variant_007' : 'facilitatorteams__variant_008'}`}><Table2 size={14} /> 표</button>
          </div>
          <button onClick={() => { setMemoTarget({ id: '', name: '' }); setMemoTitle(''); setMemoContent(''); }} className="facilitatorteams__button_003">
            <NotebookPen size={15} /> 팀 메모
          </button>
          <button onClick={() => setIsBulkModalOpen(true)} className="facilitatorteams__button_004">
            <UsersIcon size={16} /> 명단 일괄 등록
          </button>
          <button onClick={handleAddTeam} className="facilitatorteams__button_005">
            <PlusCircle size={16} /> 전담팀 추가
          </button>
        </div>
      </div>

      {loadError && <div role="alert" className="facilitatorteams__group_011">{loadError} 화면을 새로고침하거나 서버 연결을 확인해주세요.</div>}
      {isLoading && <p className="facilitatorteams__text_002">전담팀 명단을 불러오는 중...</p>}
      {!isLoading && !loadError && teams.length === 0 && <p className="facilitatorteams__text_003">이 기수에는 등록된 전담팀이 없습니다. 전담팀을 추가하거나 교육생을 미배정 대기열에 등록해주세요.</p>}

      {viewMode === 'board' ? <div className="facilitatorteams__group_012">

        {/* ✅ 개선됨: 연계 명단 리스트가 바로 보이도록 수정된 기술지원팀 보드 */}
        <div className="facilitatorteams__group_013">
          <div
            onClick={() => navigate('/tech-support')}
            className="group facilitatorteams__group_014"
          >
            <div className="facilitatorteams__group_015">
              <Headset size={16} className="facilitatorteams__headset_001" />
              <span className="facilitatorteams__label_005">학습지원 연계팀</span>
            </div>
            {/* 총 연계 인원수 표시 */}
            <span className="facilitatorteams__label_006">{techLinkedStudents.length}명</span>
          </div>

          <div className="hide-scroll facilitatorteams__group_016">
            {visibleTechLinkedStudents.map(m => (
              <div key={m.id} className="facilitatorteams__group_017">
                <div className="facilitatorteams__group_018">
                  <Headset size={14} className="facilitatorteams__headset_002" />
                  <span className="facilitatorteams__label_007">{m.name}</span>
                </div>
                {/* 원소속 전담팀 이름 표시 */}
                <span className="facilitatorteams__label_008">{m.team}</span>
              </div>
            ))}
            {visibleTechLinkedStudents.length === 0 && (
              <div className="facilitatorteams__group_019">
                 <Headset size={24} className="facilitatorteams__headset_003" />
                 <p>{query ? '검색 결과가 없습니다.' : '현재 연계 접수된 학생이 없습니다.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* 미배정 대기열 */}
        {unassignedTeam && (
          <div className="facilitatorteams__group_020" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, unassignedTeam.team_id)}>
            <div className="facilitatorteams__group_021">
              <span className="facilitatorteams__label_009">미배정 대기열</span><span className="facilitatorteams__label_010">{unassignedTeam.members.length}명</span>
            </div>
            <div className="hide-scroll facilitatorteams__group_016">
              {filterMembers(unassignedTeam.members).map(m => renderMemberCard(m, null))}
              {filterMembers(unassignedTeam.members).length === 0 && query && <p className="facilitatorteams__text_004">검색 결과가 없습니다.</p>}
            </div>
          </div>
        )}

        {/* 일반 퍼실팀들 */}
        {realTeams.map(team => (
          <div key={team.team_id} className="facilitatorteams__group_022" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, team.team_id)}>
            <div
              onClick={() => goToTeamDetail(team.team_id, team.team_name)}
              className="group facilitatorteams__group_023"
            >
              <div className="facilitatorteams__group_015">
                <span className="facilitatorteams__label_011">{team.team_name}</span>
                <ExternalLink size={12} className="facilitatorteams__externallink_001" />
              </div>

              <div className="facilitatorteams__group_018">
                <span className="facilitatorteams__label_012">{team.members.length}명</span>
                <button
                  onClick={(e) => handleDeleteTeam(e, team.team_id, team.team_name)}
                  className="facilitatorteams__button_006"
                  title="이 팀 삭제하기"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="hide-scroll facilitatorteams__group_016">
              {filterMembers(team.members).map(m => renderMemberCard(m, team.team_id))}
              {filterMembers(team.members).length === 0 && query && <p className="facilitatorteams__text_004">검색 결과가 없습니다.</p>}
            </div>
          </div>
        ))}
      </div> : <div className="facilitatorteams__group_024">
        <table className="facilitatorteams__table_001">
          <thead className="facilitatorteams__thead_001">
            <tr><th className="facilitatorteams__heading_001">교육생</th><th className="facilitatorteams__heading_001">전담팀</th><th className="facilitatorteams__heading_001">단계</th><th className="facilitatorteams__heading_001">최근 진도</th><th className="facilitatorteams__heading_002">상태</th></tr>
          </thead>
          <tbody className="facilitatorteams__tbody_001">
            {cohortTrainees.filter((trainee) => !query || `${trainee.name} ${trainee.team}`.toLocaleLowerCase().includes(query)).map((trainee) => (
              <tr key={trainee.id} onClick={() => setSelectedProfile((current) => current?.id === trainee.id ? null : trainee)} className="facilitatorteams__row_001">
                <td className="facilitatorteams__cell_001">{trainee.name}<span className="facilitatorteams__label_013">#{trainee.id}</span></td>
                <td className="facilitatorteams__heading_001">{trainee.team || '미배정'}</td>
                <td className="facilitatorteams__heading_001">{trainee.level}단계 · {trainee.done}/{trainee.target}</td>
                <td className="facilitatorteams__cell_002">{trainee.last_progress_at ? new Date(trainee.last_progress_at).toLocaleDateString('ko-KR') : '기록 없음'}</td>
                <td className="facilitatorteams__heading_002"><span className={`facilitatorteams__variant_009 ${trainee.requires_attention ? 'facilitatorteams__variant_010' : trainee.is_tech_linked ? 'facilitatorteams__variant_011' : 'facilitatorteams__variant_012'}`}>{trainee.requires_attention ? '관심 필요' : trainee.is_tech_linked ? '학습지원 연계' : '정상'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {isBulkModalOpen && (
        <div className="facilitatorteams__group_025">
          <div className="facilitatorteams__group_026">
             <div className="facilitatorteams__group_027">
               <h3 className="facilitatorteams__title_002">명단 일괄 등록</h3>
               <button onClick={() => setIsBulkModalOpen(false)}><X size={20} className="facilitatorteams__x_001"/></button>
             </div>
             <textarea value={bulkText} onChange={handleBulkTextChange} className="hide-scroll facilitatorteams__textarea_001" placeholder="엑셀 복사본 붙여넣기..." />
             <select value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)} className="facilitatorteams__select_001">
               <option value="unassigned">미배정 대기열</option>
               {realTeams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}로 배정</option>)}
             </select>
             <button onClick={handleBulkSubmit} className="facilitatorteams__button_007">DB에 일괄 등록하기</button>
          </div>
        </div>
      )}

      {memoTarget && (
        <div className="facilitatorteams__group_028" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemoTarget(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="trainee-memo-title" className="facilitatorteams__group_029">
            <div className="facilitatorteams__group_030">
            <div><h3 id="trainee-memo-title" className="facilitatorteams__title_002">교육생 개인 메모</h3><p className="facilitatorteams__text_001">선택한 교육생의 개인 메모와 메모장 페이지에 표시됩니다.</p></div>
              <button onClick={() => setMemoTarget(null)} aria-label="닫기"><X size={20} className="facilitatorteams__x_001" /></button>
            </div>
            <label className="facilitatorteams__label_014">메모를 남길 교육생 <span className="facilitatorteams__label_015">(trainee_id)</span>
              <select value={memoTarget.id || ''} onChange={(event) => {
                const target = selectableTrainees.find((trainee) => String(trainee.id) === event.target.value);
                setMemoTarget(target || { id: '', name: '' });
              }} className="facilitatorteams__select_002">
                <option value="">교육생을 선택하세요</option>
                {selectableTrainees.map((trainee) => <option key={trainee.id} value={trainee.id}>{trainee.name} · {trainee.teamLabel} · #{trainee.id}</option>)}
              </select>
            </label>
            <input value={memoTitle} onChange={(event) => setMemoTitle(event.target.value)} maxLength={255} placeholder="메모 제목 (선택)" className="facilitatorteams__input_002" />
            <textarea value={memoContent} onChange={(event) => setMemoContent(event.target.value)} rows={5} placeholder="상담 외 학습 상황, 후속 조치, 인계 사항 등을 기록하세요." className="facilitatorteams__textarea_002" />
            <div className="facilitatorteams__group_031">
              <button onClick={() => setMemoTarget(null)} className="facilitatorteams__button_008">취소</button>
              <button onClick={handleSaveTraineeMemo} disabled={!memoTarget.id || !memoContent.trim()} className="facilitatorteams__button_009"><NotebookPen size={15} /> 메모 저장</button>
            </div>
          </div>
        </div>
      )}

      {selectedProfile && (
        <div className="facilitatorteams__group_032" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProfile(null); }}>
          <aside role="dialog" aria-modal="true" aria-label={`${selectedProfile.name} 교육생 상세`} className="facilitatorteams__aside_001">
            <div className="facilitatorteams__group_033">
              <div><p className="facilitatorteams__text_005">교육생 상세</p><h3 className="facilitatorteams__title_003">{selectedProfile.name}</h3><p className="facilitatorteams__text_001">교육생 ID · {selectedProfile.id}</p></div>
              <button onClick={() => setSelectedProfile(null)} aria-label="상세 닫기" className="facilitatorteams__button_010"><X size={18} /></button>
            </div>
            <div className="facilitatorteams__group_034">
              <div className="facilitatorteams__group_035">
                <div className="facilitatorteams__group_036"><p className="facilitatorteams__text_006">전담팀</p><p className="facilitatorteams__text_007">{selectedProfile.team || '미배정'}</p></div>
                <div className="facilitatorteams__group_036"><p className="facilitatorteams__text_006">현재 진도</p><p className="facilitatorteams__text_007">{selectedProfile.level}단계 · {selectedProfile.done}/{selectedProfile.target}</p></div>
              </div>
              <div className="facilitatorteams__group_036">
                <div className="facilitatorteams__group_037"><CalendarClock size={16} className="facilitatorteams__calendarclock_001" /> 최근 진도 업데이트</div>
                <p className="facilitatorteams__text_008">{selectedProfile.last_progress_at ? new Date(selectedProfile.last_progress_at).toLocaleString('ko-KR') : '완료된 미션 날짜 기록이 없습니다.'}</p>
              </div>
              <div className="facilitatorteams__group_038">
                {selectedProfile.requires_attention && <span className="facilitatorteams__label_016">관심 필요</span>}
                {selectedProfile.is_tech_linked && <span className="facilitatorteams__label_017">학습지원 연계</span>}
              </div>
              <p className="facilitatorteams__text_009">상세 프로필의 전체 이력과 개인 메모를 열려면 교육생 페이지에서 {selectedProfile.name}을 선택하세요.</p>
            </div>
            <div className="facilitatorteams__group_039">
              <button onClick={() => { setMemoTarget({ id: selectedProfile.id, name: selectedProfile.name }); setMemoTitle(''); setMemoContent(''); setSelectedProfile(null); }} className="facilitatorteams__button_011"><NotebookPen size={15} /> 이 사람에게 메모</button>
              <button onClick={() => { navigate(`/trainees?search=${encodeURIComponent(selectedProfile.name)}`); setSelectedProfile(null); }} className="facilitatorteams__button_012"><UserRound size={15} /> 상세 페이지</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default FacilitatorTeams;
