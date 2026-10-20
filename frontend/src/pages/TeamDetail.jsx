import './TeamDetail.css';
import React, { useState, useEffect, useContext } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { GlobalContext } from '../context/GlobalContext';
import { dashboardApi } from '../api/dashboard';
import { teamsApi } from '../api/teams';
import { traineesApi } from '../api/trainees';
import PeriodProgressSection from '../components/PeriodProgressSection';
import { ArrowLeft, Users, CheckCircle2, Circle, X, ChevronDown, ChevronUp, User, AlertTriangle, Headset, NotebookPen, Plus, Trash2, UserRoundX, Search, CalendarClock, Pencil, PhoneCall } from 'lucide-react';

const daysSince = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const lastDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.floor((todayStart - lastDay) / 86400000));
};

const localDateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const elapsedFromDate = (value, referenceDate) => {
  if (!value) return null;
  const lastDate = String(value).slice(0, 10);
  const referenceMillis = Date.parse(`${referenceDate}T00:00:00Z`);
  const progressMillis = Date.parse(`${lastDate}T00:00:00Z`);
  if (Number.isNaN(referenceMillis) || Number.isNaN(progressMillis)) return null;
  return Math.max(0, Math.floor((referenceMillis - progressMillis) / 86400000));
};

const TeamDetail = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const { teamId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [teamName, setTeamName] = useState(location.state?.teamName || "전담팀");
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamMemos, setTeamMemos] = useState([]);
  const [teamContacts, setTeamContacts] = useState([]);
  const [teamCallCampaigns, setTeamCallCampaigns] = useState([]);
  const [traineeSearch, setTraineeSearch] = useState('');
  const [selectedMemoTrainee, setSelectedMemoTrainee] = useState(null);
  const [memoMode, setMemoMode] = useState('trainee');
  const [memoHistoryFilter, setMemoHistoryFilter] = useState('all');
  const [staleAsOf, setStaleAsOf] = useState(() => localDateValue(new Date()));
  const [staleAfterDays, setStaleAfterDays] = useState(7);
  const [includeNoProgressRecord, setIncludeNoProgressRecord] = useState(true);
  const [staleSortOrder, setStaleSortOrder] = useState('desc');

  const [openLevel, setOpenLevel] = useState(null);
  
  // ✅ 3가지 독립적인 필터 상태 관리
  const [taskFilter, setTaskFilter] = useState('all'); // all, completed, incomplete
  const [showWarning, setShowWarning] = useState(false); // 위험 인원만
  const [showLinked, setShowLinked] = useState(false); // 연계 인원만

  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");

  useEffect(() => {
    fetchData();
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [selectedCohort, teamId]);

  const fetchData = async () => {
    const [dashboard, teams, cohortMemos, cohortContacts, callCampaigns] = await Promise.all([
      dashboardApi.get(selectedCohort, { team_id: Number(teamId), roster_only: true }),
      teamsApi.list(selectedCohort),
      teamsApi.listCohortMemos(selectedCohort),
      traineesApi.listCohortContacts(selectedCohort),
      teamsApi.listCallCampaigns(selectedCohort),
    ]);
    const members = (dashboard.trainees || []).filter((trainee) => trainee.team_id === Number(teamId));
    setTeamMembers(members);
    const memberIds = new Set(members.map((trainee) => Number(trainee.id)));
    const currentTeam = teams.find((team) => team.team_id === Number(teamId));
    if (currentTeam) setTeamName(currentTeam.team_name);
    setTeamMemos((cohortMemos || []).filter((memo) => (
      Number(memo.team_id) === Number(teamId)
      || (memo.trainee_id && memberIds.has(Number(memo.trainee_id)))
    )));
    setTeamContacts((cohortContacts || []).filter((contact) => memberIds.has(Number(contact.trainee_id))));
    setTeamCallCampaigns((callCampaigns || []).filter((campaign) => Number(campaign.team_id) === Number(teamId)));
  };

  // ✅ 스위치 기능 (누르면 즉시 백엔드로 상태값 전송)
  const handleToggleStatus = async (traineeId, field, currentValue) => {
    await traineesApi.updateStatus(traineeId, { [field]: !currentValue });
    fetchData(); // 화면 즉각 새로고침
  };

  const handleQuickDrop = async (event, trainee) => {
    event.stopPropagation();
    if (!window.confirm(`${trainee.name} 교육생을 드랍 처리할까요?`)) return;
    const reason = window.prompt('드랍 사유를 입력하세요. (선택)');
    if (reason === null) return;
    const today = new Date();
    const dropDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await traineesApi.updateDropStatus(trainee.id, { is_dropped: true, drop_date: dropDate, drop_reason: reason.trim() || null });
    await fetchData();
  };

  const handleAddMemo = async () => {
    if (!memoContent.trim()) return alert('메모 내용을 입력해주세요.');
    if (memoMode === 'trainee' && !selectedMemoTrainee?.id) return alert('메모를 남길 교육생을 선택해주세요.');
    if (memoMode === 'team') {
      await teamsApi.createMemo(Number(teamId), { title: memoTitle.trim() || null, content: memoContent.trim() });
    } else {
      await traineesApi.createMemo(selectedMemoTrainee.id, { title: memoTitle.trim() || null, content: memoContent.trim() });
    }
    setMemoTitle('');
    setMemoContent('');
    await fetchData();
  };

  const handleDeleteMemo = async (memo) => {
    if (!window.confirm('이 팀 메모를 삭제할까요?')) return;
    if (memo.memo_type === 'team') await teamsApi.deleteMemo(Number(teamId), memo.memo_id);
    else await traineesApi.deleteMemo(memo.memo_id);
    setTeamMemos((previous) => previous.filter((item) => item.memo_id !== memo.memo_id));
  };

  const handleEditMemo = async (memo) => {
    const title = window.prompt('메모 제목', memo.title || '');
    if (title === null) return;
    const content = window.prompt('메모 내용', memo.content);
    if (content === null) return;
    if (!content.trim()) return alert('메모 내용을 입력해주세요.');
    if (memo.memo_type === 'team') {
      await teamsApi.updateMemo(Number(teamId), memo.memo_id, { title: title.trim() || null, content: content.trim() });
    } else {
      await traineesApi.updateMemo(memo.memo_id, { title: title.trim() || null, content: content.trim() });
    }
    await fetchData();
  };

  const traineeQuery = traineeSearch.trim().toLocaleLowerCase();
  const latestTeamProgressUpdate = teamMembers
    .map((trainee) => trainee.last_progress_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
  const staleTeamMembers = teamMembers
    .filter((trainee) => !trainee.is_dropped)
    .map((trainee) => ({ ...trainee, staleDate: trainee.last_progress_at ? String(trainee.last_progress_at).slice(0, 10) : null, staleDays: elapsedFromDate(trainee.last_progress_at, staleAsOf) }))
    .filter((trainee) => (includeNoProgressRecord || trainee.staleDays !== null)
      && (trainee.staleDays === null || trainee.staleDays >= Number(staleAfterDays || 1)))
    .sort((a, b) => {
      if (a.staleDays === null || b.staleDays === null) {
        if (a.staleDays === null && b.staleDays !== null) return staleSortOrder === 'desc' ? -1 : 1;
        if (b.staleDays === null && a.staleDays !== null) return staleSortOrder === 'desc' ? 1 : -1;
      }
      const difference = (a.staleDays || 0) - (b.staleDays || 0);
      return (staleSortOrder === 'asc' ? difference : -difference) || a.name.localeCompare(b.name, 'ko');
    });
  const memoHistory = [
    ...teamMemos.map((memo) => ({ ...memo, historyType: memo.memo_type === 'team' ? 'team_memo' : 'trainee_memo', historyId: `memo-${memo.memo_id}`, historyDate: memo.updated_at || memo.created_at })),
    ...teamCallCampaigns.map((campaign) => ({ ...campaign, historyType: 'call_campaign', historyId: `call-${campaign.campaign_id}`, historyDate: campaign.updated_at || campaign.created_at })),
  ].filter((item) => {
    const matchesFilter = memoHistoryFilter === 'all' || item.historyType === memoHistoryFilter;
    const matchesTrainee = !selectedMemoTrainee || item.historyType !== 'trainee_memo' || Number(item.trainee_id) === Number(selectedMemoTrainee.id);
    return matchesFilter && matchesTrainee;
  }).sort((a, b) => new Date(b.historyDate || 0) - new Date(a.historyDate || 0));

  const renderAccordion = (level) => {
    let students = teamMembers.filter(t => t.level === level);
    if (traineeQuery) students = students.filter((trainee) => trainee.name.toLocaleLowerCase().includes(traineeQuery));
    
    // ✅ 모든 필터 조건 적용
    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);
    if (showWarning) students = students.filter(t => t.requires_attention);
    if (showLinked) students = students.filter(t => t.is_tech_linked);

    if (traineeQuery && students.length === 0) return null;
    const isOpen = openLevel === level;
    
    return (
      <div key={level} className="teamdetail__group_001">
        <div className="teamdetail__group_002" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="teamdetail__group_003">
            <span className={`teamdetail__variant_001 ${level === 3 ? 'teamdetail__variant_002' : level === 2 ? 'teamdetail__variant_003' : 'teamdetail__variant_004'}`}>
              {level === 3 ? 'Final' : `${level}단계`} 진입
            </span>
            <span className="teamdetail__label_001">{students.length}명 인원</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="teamdetail__chevronup_001" /> : <ChevronDown size={20} className="teamdetail__chevronup_001" />}
        </div>
        
        {isOpen && (
          <div className="teamdetail__group_004">
            {students.length === 0 ? (
              <p className="teamdetail__text_001">조건에 맞는 인원이 없습니다.</p>
            ) : students.map(t => {
              const pct = Math.round((t.done / t.target) * 100);
              const updateAgeDays = daysSince(t.last_progress_at);
              const latestContactLog = teamContacts.find((contact) => Number(contact.trainee_id) === Number(t.id));
              const latestCall = teamCallCampaigns.find((campaign) => campaign.recipients?.some((recipient) => Number(recipient.trainee_id) === Number(t.id)));
              const latestCallRecipient = latestCall?.recipients.find((recipient) => Number(recipient.trainee_id) === Number(t.id));
              const callIsLatest = latestCall && (!latestContactLog || new Date(latestCall.created_at) >= new Date(latestContactLog.contact_date));
              const latestContactDate = callIsLatest ? latestCall.created_at : latestContactLog?.contact_date;
              const latestContactText = latestContactDate
                ? `${new Date(latestContactDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}${callIsLatest ? ` · ${latestCallRecipient?.received ? '받음' : '미수신'}` : ''}`
                : 'X';
              const latestContactTitle = callIsLatest
                ? `${latestCall.reason}${latestCallRecipient?.note ? ` · ${latestCallRecipient.note}` : ''}`
                : latestContactLog?.topic || '';
              return (
                <div key={t.id} className={`teamdetail__variant_005 ${t.requires_attention ? 'teamdetail__variant_006' : 'teamdetail__variant_007'}`}>
                  <div className="teamdetail__group_005">
                    <div className="teamdetail__group_006">
                      <User size={16} className="teamdetail__chevronup_001"/>
                      <span className="teamdetail__label_002">{t.name}</span>
                      {t.requires_attention && <AlertTriangle size={14} className="teamdetail__alerttriangle_001" />}
                    </div>
                    {t.is_tech_linked && (
                      <span className="teamdetail__label_003">
                        <Headset size={10} /> 학습지원 연계됨
                      </span>
                    )}
                  </div>
                  
                  <div className="teamdetail__group_007">
                    <div className="teamdetail__group_008">
                      <div className={`teamdetail__variant_008 ${pct >= 100 ? 'teamdetail__variant_009' : 'teamdetail__variant_010'}`} style={{ '--progress-width': `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <span className={`teamdetail__variant_011 ${pct >= 100 ? 'teamdetail__variant_012' : 'teamdetail__variant_013'}`}>{pct}%</span>
                  </div>

                  <div className="teamdetail__group_009">
                    <span title={updateAgeDays === null ? '진도 업데이트 기록 없음' : `마지막 진도 업데이트 ${updateAgeDays}일 전`} className={`teamdetail__variant_014 ${updateAgeDays === null || updateAgeDays >= 7 ? 'teamdetail__variant_015' : updateAgeDays >= 3 ? 'teamdetail__variant_016' : 'teamdetail__variant_017'}`}>
                      {updateAgeDays === null ? 'X' : `${updateAgeDays}일`}
                    </span>
                    <span className="teamdetail__label_004" title={latestContactTitle}>최근 연락 {latestContactText}</span>
                  </div>
                  
                  <div className="teamdetail__group_010">
                    {t.optional_task_done === 1 ? <CheckCircle2 size={16} className="teamdetail__checkcircle2_001" /> : <Circle size={16} className="teamdetail__circle_001" />}
                    
                    {/* ✅ 위험 인원 표시 토글 버튼 */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'requires_attention', t.requires_attention); }} 
                      className={`teamdetail__variant_018 ${t.requires_attention ? 'teamdetail__variant_019' : 'teamdetail__variant_020'}`}
                      title="위험 인원 표시"
                    >
                      <AlertTriangle size={14} />
                    </button>

                    {/* ✅ 학습지원 연계 토글 버튼 */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'is_tech_linked', t.is_tech_linked); }} 
                      className={`teamdetail__variant_018 ${t.is_tech_linked ? 'teamdetail__variant_021' : 'teamdetail__variant_020'}`}
                      title="학습지원 세션 연계 (소속 유지)"
                    >
                      <Headset size={14} />
                    </button>
                    <button onClick={() => { setMemoMode('trainee'); setSelectedMemoTrainee(t); }} className="teamdetail__button_001" title={`${t.name} 메모 작성`}>
                      <NotebookPen size={13} /> 메모
                    </button>
                    <button onClick={(event) => handleQuickDrop(event, t)} title="이 화면에서 드랍 처리" className="teamdetail__button_002">
                      <UserRoundX size={14} />
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
    <main className="teamdetail__main_001">
      
      {/* 헤더 */}
      <div className="teamdetail__group_011">
        <button onClick={() => navigate(-1)} className="teamdetail__button_003">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="teamdetail__title_001">
            <Users size={24} className="teamdetail__users_001" /> {teamName} 담당팀
          </h2>
          <p className="teamdetail__text_002">팀 진도와 드랍 상태를 확인하고, 팀 메모와 교육생별 기록을 관리합니다.</p>
        </div>
      </div>

      <div className="teamdetail__group_012">
        
        {/* 좌측 2/3: 아코디언 및 필터 */}
        <div className="teamdetail__group_013">
          
          {/* ✅ 신규 추가된 필터 그룹 */}
          <div className="teamdetail__group_014">
            <label className="teamdetail__label_005">
              <Search size={16} className="teamdetail__search_001" />
              <input value={traineeSearch} onChange={(event) => {
                const value = event.target.value;
                setTraineeSearch(value);
                const firstMatch = teamMembers.find((trainee) => trainee.name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
                if (value.trim() && firstMatch) setOpenLevel(firstMatch.level);
              }} placeholder="이 팀 교육생 이름 검색" className="teamdetail__input_001" />
            </label>
            <div className="teamdetail__group_015">
            {/* 선택과제 필터 */}
            <div className="teamdetail__group_016">
              <button onClick={() => setTaskFilter('all')} className={`teamdetail__variant_022 ${taskFilter === 'all' ? 'teamdetail__variant_023' : 'teamdetail__variant_024'}`}>전체 보기</button>
              <button onClick={() => setTaskFilter('completed')} className={`teamdetail__variant_025 ${taskFilter === 'completed' ? 'teamdetail__variant_026' : 'teamdetail__variant_024'}`}><CheckCircle2 size={14} /> 선택과제 완료</button>
              <button onClick={() => setTaskFilter('incomplete')} className={`teamdetail__variant_025 ${taskFilter === 'incomplete' ? 'teamdetail__variant_027' : 'teamdetail__variant_024'}`}><Circle size={14} /> 미완료</button>
            </div>
            {/* 🚨 위험 인원 및 연계 인원 필터 */}
            <div className="teamdetail__group_017">
              <button onClick={() => setShowWarning(!showWarning)} className={`teamdetail__variant_025 ${showWarning ? 'teamdetail__variant_028' : 'teamdetail__variant_024'}`}><AlertTriangle size={14} /> 위험 인원</button>
              <button onClick={() => setShowLinked(!showLinked)} className={`teamdetail__variant_025 ${showLinked ? 'teamdetail__variant_029' : 'teamdetail__variant_024'}`}><Headset size={14} /> 연계 인원</button>
            </div>
            </div>
          </div>

          <section>
            {[3, 2, 1].map(renderAccordion)}
            {traineeQuery && !teamMembers.some((trainee) => trainee.name.toLocaleLowerCase().includes(traineeQuery)) && (
              <p className="teamdetail__text_003">검색 결과가 없습니다. 이름을 확인해주세요.</p>
            )}
          </section>
          
          <PeriodProgressSection cohortId={selectedCohort} teamId={Number(teamId)} title={`${teamName} 기간별 진도 현황`} />

          <section className="teamdetail__section_001">
            <div className="teamdetail__group_018">
              <div><h2 className="teamdetail__title_002"><CalendarClock size={18} className="teamdetail__calendarclock_001" />진도 업데이트 정체 명단</h2><p className="teamdetail__text_004">이 담당팀의 기준일별 진도 경과 현황</p></div>
              <div className="teamdetail__group_019">
                <div className="teamdetail__group_020"><p className="teamdetail__text_005">팀 내 최근 업데이트</p><p className="teamdetail__text_006">{latestTeamProgressUpdate ? String(latestTeamProgressUpdate).slice(0, 10).replaceAll('-', '.') : 'X'}</p></div>
                <label className="teamdetail__label_006">기준일<input type="date" value={staleAsOf} onChange={(event) => setStaleAsOf(event.target.value)} className="teamdetail__input_002" /></label>
                <label className="teamdetail__label_006">정체 기준<span className="teamdetail__group_006"><input type="number" min="1" max="3650" value={staleAfterDays} onChange={(event) => setStaleAfterDays(event.target.value)} className="teamdetail__input_003" /><span>일 이상</span></span></label>
                <label className="teamdetail__label_006">정렬<select value={staleSortOrder} onChange={(event) => setStaleSortOrder(event.target.value)} className="teamdetail__select_001"><option value="desc">경과 일수 내림차순</option><option value="asc">경과 일수 오름차순</option></select></label>
                <span className="teamdetail__label_007">{staleTeamMembers.length}명</span>
              </div>
            </div>
            <div className="teamdetail__group_021"><p className="teamdetail__text_007">{staleTeamMembers.length}명 기준에 해당합니다.{includeNoProgressRecord ? ' 진도 기록이 없는 인원도 포함 중입니다.' : ' 진도 기록이 없는 인원은 제외했습니다.'}</p><label className="teamdetail__label_008"><input type="checkbox" checked={includeNoProgressRecord} onChange={(event) => setIncludeNoProgressRecord(event.target.checked)} className="teamdetail__input_004" />기록 없는 인원 포함</label></div>
            <div className="teamdetail__group_022">
              <table className="teamdetail__table_001">
                <thead className="teamdetail__thead_001"><tr><th className="teamdetail__heading_001">교육생</th><th className="teamdetail__heading_001">진도 단계 / 과제</th><th className="teamdetail__heading_001">마지막 업데이트 날짜</th><th className="teamdetail__heading_002">경과 일수</th></tr></thead>
                <tbody className="teamdetail__tbody_001">
                  {staleTeamMembers.map((trainee) => <tr key={trainee.id} className="teamdetail__row_001" onClick={() => { setMemoMode('trainee'); setSelectedMemoTrainee(trainee); }}>
                    <td className="teamdetail__cell_001">{trainee.name}<span className="teamdetail__label_009">#{trainee.id}</span></td>
                    <td className="teamdetail__cell_002">{trainee.level === 3 ? 'Final' : `${trainee.level || 1}단계`} · {trainee.done || 0}/{trainee.target || 0}</td>
                    <td className="teamdetail__cell_003">{trainee.staleDate ? trainee.staleDate.replaceAll('-', '.') : 'X'}</td>
                    <td className="teamdetail__cell_004"><span className={`teamdetail__variant_030 ${trainee.staleDays === null ? 'teamdetail__variant_031' : 'teamdetail__variant_032'}`}>{trainee.staleDays === null ? 'X' : `${trainee.staleDays}일`}</span></td>
                  </tr>)}
                  {staleTeamMembers.length === 0 && <tr><td colSpan="4" className="teamdetail__cell_005">7일 이상 정체된 교육생이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 담당팀 메모와 교육생 메모 */}
        <aside className="teamdetail__aside_001">
          <div className="teamdetail__group_023">
            <div className="teamdetail__group_024">
              <div className="teamdetail__group_006"><NotebookPen size={18} className="teamdetail__notebookpen_001" /><h3 className="teamdetail__title_003">팀 기록</h3></div>
              <span className="teamdetail__label_010">{memoHistory.length}건</span>
            </div>
            <p className="teamdetail__text_004">팀 메모와 교육생 메모, 전화 기록을 함께 확인합니다.</p>
          </div>
          <div className="teamdetail__group_025">
            <div className="teamdetail__group_026">
              <button type="button" onClick={() => setMemoMode('team')} className={`teamdetail__variant_033 ${memoMode === 'team' ? 'teamdetail__variant_034' : 'teamdetail__variant_035'}`}>팀 메모</button>
              <button type="button" onClick={() => setMemoMode('trainee')} className={`teamdetail__variant_033 ${memoMode === 'trainee' ? 'teamdetail__variant_036' : 'teamdetail__variant_035'}`}>교육생 메모</button>
            </div>
            <div className="teamdetail__group_027">
              <div className="teamdetail__group_028">
                <span>{memoMode === 'team' ? `${teamName} 팀 메모` : selectedMemoTrainee ? `${selectedMemoTrainee.name} 메모` : '교육생을 선택하세요'}</span>
                {selectedMemoTrainee && <button type="button" onClick={() => setSelectedMemoTrainee(null)} className="teamdetail__button_004"><span>#{selectedMemoTrainee.id}</span><X size={13} /></button>}
              </div>
              <input value={memoTitle} onChange={(event) => setMemoTitle(event.target.value)} placeholder="메모 제목 (선택)" className="teamdetail__input_005" />
              <textarea value={memoContent} onChange={(event) => setMemoContent(event.target.value)} placeholder="학습 상황, 후속 조치, 전달할 내용을 적어주세요." rows={4} className="teamdetail__textarea_001" />
              <button onClick={handleAddMemo} disabled={(memoMode === 'trainee' && !selectedMemoTrainee) || !memoContent.trim()} className="teamdetail__button_005"><Plus size={15} />{memoMode === 'team' ? '팀 메모 저장' : '교육생 메모 저장'}</button>
            </div>
          </div>
          <div className="teamdetail__group_029">
            <div className="teamdetail__group_030">
              {[['all', '전체'], ['team_memo', '팀 메모'], ['trainee_memo', '교육생 메모'], ['call_campaign', '전화 기록']].map(([filter, label]) => <button key={filter} type="button" onClick={() => setMemoHistoryFilter(filter)} className={`teamdetail__variant_037 ${memoHistoryFilter === filter ? 'teamdetail__variant_038' : 'teamdetail__variant_039'}`}>{label}</button>)}
            </div>
            {memoHistory.length === 0 ? <div className="teamdetail__group_031"><NotebookPen size={24} className="teamdetail__notebookpen_002" />조건에 맞는 기록이 없습니다.</div> : memoHistory.map((memo) => memo.historyType === 'call_campaign' ? (
              <article key={memo.historyId} className="teamdetail__card_001">
                <div className="teamdetail__group_032"><div><h4 className="teamdetail__title_004">전화 · {memo.reason}</h4><p className="teamdetail__text_008">{memo.manager_name} · {memo.team_name || teamName}</p></div><PhoneCall size={14} className="teamdetail__phonecall_001" /></div>
                <div className="teamdetail__group_033">{(memo.recipients || []).map((recipient) => <div key={recipient.recipient_id} className="teamdetail__group_034"><div className="teamdetail__group_024"><span className="teamdetail__label_011">{recipient.trainee_name}</span><span className={`teamdetail__variant_040 ${recipient.received ? 'teamdetail__variant_041' : 'teamdetail__variant_042'}`}>{recipient.received ? '연락 받음' : '연락 못 받음'}</span></div>{recipient.note && <p className="teamdetail__text_009">{recipient.note}</p>}</div>)}</div>
                <p className="teamdetail__text_010">{memo.updated_at && memo.created_at && new Date(memo.updated_at) > new Date(memo.created_at) ? `수정 ${new Date(memo.updated_at).toLocaleString('ko-KR')}` : memo.created_at ? new Date(memo.created_at).toLocaleString('ko-KR') : '날짜 정보 없음'}</p>
              </article>
            ) : (
              <article key={memo.historyId} className="group teamdetail__card_002">
                <div className="teamdetail__group_035"><div className="teamdetail__group_036"><div className="teamdetail__group_037"><h4 className="teamdetail__title_005">{memo.title || (memo.memo_type === 'team' ? `${teamName} 팀 메모` : `${memo.trainee_name || '교육생'} 개인 메모`)}</h4><span className="teamdetail__label_012">{memo.memo_type === 'team' ? '팀 전체' : memo.trainee_name}</span></div><p className="teamdetail__text_011">{memo.content}</p><p className="teamdetail__text_012"><CalendarClock size={12} />{memo.author} · {memo.updated_at && memo.created_at && new Date(memo.updated_at) > new Date(memo.created_at) ? `수정 ${new Date(memo.updated_at).toLocaleString('ko-KR')}` : memo.created_at ? new Date(memo.created_at).toLocaleString('ko-KR') : '날짜 정보 없음'}</p></div>
                  <div className="teamdetail__group_038"><button onClick={() => handleEditMemo(memo)} title="메모 수정" className="teamdetail__button_006"><Pencil size={14} /></button><button onClick={() => handleDeleteMemo(memo)} title="메모 삭제" className="teamdetail__button_007"><Trash2 size={14} /></button></div>
                </div>
              </article>
            ))}
          </div>
        </aside>

      </div>

    </main>
  );
};

export default TeamDetail;
