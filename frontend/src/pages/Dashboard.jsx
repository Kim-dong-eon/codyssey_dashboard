import './Dashboard.css';
import React, { useState, useEffect, useContext } from 'react';
import { GlobalContext } from '../context/GlobalContext';
import { dashboardApi } from '../api/dashboard';
import { traineesApi } from '../api/trainees';
import MissionProgressByLevel from '../components/MissionProgressByLevel';
import { ChevronDown, ChevronUp, User, Search, CheckCircle2, Circle, Bell, Trash2, Pin, AlertCircle, UserRoundX, CalendarDays, Clock3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const localDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const previousWeekRange = () => {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset - 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start_date: localDateValue(monday), end_date: localDateValue(sunday) };
};

const formatNoticeDate = (value) => {
  if (!value) return '등록 날짜 정보 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '등록 날짜 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const Dashboard = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [trainees, setTrainees] = useState([]);
  const [missionRows, setMissionRows] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [historyMode, setHistoryMode] = useState('none');
  const [range, setRange] = useState(previousWeekRange);
  const [rangeDraft, setRangeDraft] = useState(previousWeekRange);
  const [staleAsOf, setStaleAsOf] = useState(() => localDateValue(new Date()));
  const [staleAfterDays, setStaleAfterDays] = useState(7);
  const [includeNoProgressRecord, setIncludeNoProgressRecord] = useState(true);
  const [staleTeamFilter, setStaleTeamFilter] = useState('all');
  const [staleSortOrder, setStaleSortOrder] = useState('desc');
  
  // 🚨 수정됨: 초기값을 null로 설정하여 처음 진입 시 모든 아코디언이 닫혀있도록 변경
  const [openLevel, setOpenLevel] = useState(null); 
  const [searchTerm, setSearchTerm] = useState("");
  const [taskFilter, setTaskFilter] = useState('all'); 

  // 공지사항 상태
  const [notices, setNotices] = useState([]);
  const [newNotice, setNewNotice] = useState("");
  const [newCategory, setNewCategory] = useState("일반");

  useEffect(() => {
    fetchDashboard();
  }, [selectedCohort, range]);

  useEffect(() => {
    fetchNotices();
  }, [selectedCohort]);

  const fetchDashboard = async () => {
    const data = await dashboardApi.get(selectedCohort, range);
    setTrainees(data.trainees || []);
    setMissionRows(data.missionProgressByTrainee || []);
    setChartData(data.chartData || []);
    setHistoryAvailable(Boolean(data.historyAvailable));
    setHistoryMode(data.historyMode || 'none');
  };

  const fetchNotices = async () => {
    setNotices(await dashboardApi.listNotices(selectedCohort));
  };

  const handleAddNotice = async () => {
    if (!newNotice.trim()) return;
    await dashboardApi.createNotice(selectedCohort, { content: newNotice.trim(), category: newCategory });
    setNewNotice("");
    setNewCategory("일반");
    fetchNotices();
  };

  const handleToggleNotice = async (noticeId, field, currentValue) => {
    const newValue = field === 'status' ? (currentValue === '완료' ? '미완료' : '완료') : !currentValue;
    await dashboardApi.updateNotice(noticeId, { [field]: newValue });
    fetchNotices();
  };

  const handleDeleteNotice = async (noticeId) => {
    if (window.confirm("공지를 삭제하시겠습니까?")) {
      await dashboardApi.deleteNotice(noticeId);
      fetchNotices();
    }
  };

  const applyPreset = (preset) => {
    let nextRange;
    const today = new Date();
    if (preset === 'lastWeek') nextRange = previousWeekRange();
    else if (preset === 'month') {
      nextRange = {
        start_date: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
        end_date: localDateValue(today),
      };
    } else {
      nextRange = {
        start_date: localDateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)),
        end_date: localDateValue(today),
      };
    }
    setRangeDraft(nextRange);
    setRange(nextRange);
  };

  const handleQuickDrop = async (event, trainee) => {
    event.stopPropagation();
    if (!window.confirm(`${trainee.name} 교육생을 드랍 처리할까요?`)) return;
    const reason = window.prompt('드랍 사유를 입력하세요. (선택)');
    if (reason === null) return;
    await traineesApi.updateDropStatus(trainee.id, {
      is_dropped: true,
      drop_date: localDateValue(new Date()),
      drop_reason: reason.trim() || null,
    });
    await fetchDashboard();
  };

  const firstPoint = chartData[0];
  const lastPoint = chartData[chartData.length - 1];
  const progressCards = [
    { key: 'level1', label: '1단계', unit: '명', color: 'dashboard__variant_001' },
    { key: 'level2', label: '2단계', unit: '명', color: 'dashboard__variant_002' },
    { key: 'level3', label: 'Final', unit: '명', color: 'dashboard__variant_003' },
    { key: 'completed', label: '수료', unit: '명', color: 'dashboard__variant_004' },
    { key: 'tasksDone', label: '필수 과제 완료', unit: '건', color: 'dashboard__variant_005' },
    { key: 'dropped', label: '드랍 누계', unit: '명', color: 'dashboard__variant_006' },
  ];

  const latestProgressUpdate = trainees
    .map((trainee) => trainee.last_progress_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const facilitatorWorkload = Object.entries(trainees
    .filter((trainee) => !trainee.is_dropped)
    .reduce((counts, trainee) => {
      const teamName = trainee.team || '미배정';
      counts[teamName] = (counts[teamName] || 0) + 1;
      return counts;
    }, {}))
    .map(([name, traineeCount]) => ({ name, traineeCount }))
    .sort((a, b) => b.traineeCount - a.traineeCount || a.name.localeCompare(b.name, 'ko'));

  const elapsedSinceProgress = (lastProgressAt) => {
    if (!lastProgressAt) return null;
    const lastDate = String(lastProgressAt).slice(0, 10);
    const referenceMillis = Date.parse(`${staleAsOf}T00:00:00Z`);
    const progressMillis = Date.parse(`${lastDate}T00:00:00Z`);
    if (Number.isNaN(referenceMillis) || Number.isNaN(progressMillis)) return null;
    return Math.max(0, Math.floor((referenceMillis - progressMillis) / 86400000));
  };

  const teamFilterOptions = [...new Set(trainees.filter((trainee) => !trainee.is_dropped).map((trainee) => trainee.team || '미배정'))]
    .sort((a, b) => a.localeCompare(b, 'ko'));

  const stalledTrainees = trainees
    .filter((trainee) => !trainee.is_dropped)
    .map((trainee) => {
      const latestDate = trainee.last_progress_at ? String(trainee.last_progress_at).slice(0, 10) : null;
      return { ...trainee, latestDate, daysSinceProgress: elapsedSinceProgress(trainee.last_progress_at) };
    })
    .filter((trainee) => (includeNoProgressRecord || trainee.daysSinceProgress !== null)
      && (trainee.daysSinceProgress === null || trainee.daysSinceProgress >= Number(staleAfterDays || 1))
      && (staleTeamFilter === 'all' || (trainee.team || '미배정') === staleTeamFilter))
    .sort((a, b) => {
      if (a.daysSinceProgress === null || b.daysSinceProgress === null) {
        if (a.daysSinceProgress === null && b.daysSinceProgress !== null) return staleSortOrder === 'desc' ? -1 : 1;
        if (b.daysSinceProgress === null && a.daysSinceProgress !== null) return staleSortOrder === 'desc' ? 1 : -1;
      }
      const difference = (a.daysSinceProgress || 0) - (b.daysSinceProgress || 0);
      return (staleSortOrder === 'asc' ? difference : -difference) || a.name.localeCompare(b.name, 'ko');
    });

  const renderAccordion = (level) => {
    let students = trainees.filter(t => t.level === level);
    if (searchTerm) students = students.filter(t => t.name.includes(searchTerm));
    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);

    const isOpen = openLevel === level;
    
    return (
      <div key={level} className="dashboard__group_001">
        <div className="dashboard__group_002" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="dashboard__group_003">
            <span className={`dashboard__variant_007 ${level === 3 ? 'dashboard__variant_008' : level === 2 ? 'dashboard__variant_009' : 'dashboard__variant_010'}`}>
              {level === 3 ? 'Final' : `${level}단계`} 진입
            </span>
            <span className="dashboard__label_001">{students.length}명 검색됨</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="dashboard__chevronup_001" /> : <ChevronDown size={20} className="dashboard__chevronup_001" />}
        </div>
        
        {isOpen && (
          <div className="dashboard__group_004">
            {students.length === 0 ? (
              <p className="dashboard__text_001">조건에 맞는 학생이 없습니다.</p>
            ) : students.map(t => {
              const pct = Math.round((t.done / t.target) * 100);
              const daysSinceProgress = elapsedSinceProgress(t.last_progress_at);
              return (
                <div key={t.id} className="dashboard__group_005">
                  <div className="dashboard__group_006">
                    <User size={16} className="dashboard__chevronup_001"/>
                    <span className="dashboard__label_002">{t.name}</span>
                    <span className={`dashboard__variant_011 ${daysSinceProgress === null ? 'dashboard__variant_012' : daysSinceProgress >= Number(staleAfterDays || 1) ? 'dashboard__variant_013' : 'dashboard__variant_014'}`} title={t.last_progress_at ? `마지막 진도: ${String(t.last_progress_at).slice(0, 10)}` : '완료된 미션 기록이 없습니다.'}>
                      {daysSinceProgress === null ? 'X' : `${daysSinceProgress}일`}
                    </span>
                    <span className="dashboard__label_003">{t.team}</span>
                  </div>
                  <div className="dashboard__group_007">
                    <div className="dashboard__group_008">
                      <span className="dashboard__chevronup_001">필수 진도율 ({t.done}/{t.target})</span>
                      <span className={pct >= 100 ? 'dashboard__variant_015' : 'dashboard__variant_002'}>{pct}%</span>
                    </div>
                    <div className="dashboard__group_009"><div className={`dashboard__variant_016 ${pct >= 100 ? 'dashboard__variant_017' : 'dashboard__variant_018'}`} style={{ '--progress-width': `${Math.min(pct,100)}%`}}></div></div>
                  </div>
                  <div className="dashboard__group_010">
                    <span className="dashboard__label_004">선택과제</span>
                    {t.optional_task_done === 1 ? (
                      <span className="dashboard__label_005"><CheckCircle2 size={14} /> 완료</span>
                    ) : (
                      <span className="dashboard__label_006"><Circle size={14} /> 미완료</span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => handleQuickDrop(event, t)}
                      title="대시보드에서 바로 드랍 처리"
                      className="dashboard__button_001"
                    >
                      <UserRoundX size={16} />
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
    <div className="dashboard__group_011">
      
      <div className="dashboard__group_012">
        <div className="dashboard__group_013">
          <Search size={16} className="dashboard__search_001" />
          <input type="text" placeholder="학생 이름 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="dashboard__input_001" />
        </div>
        
        <div className="dashboard__group_014">
          <button onClick={() => setTaskFilter('all')} className={`dashboard__variant_019 ${taskFilter === 'all' ? 'dashboard__variant_020' : 'dashboard__variant_021'}`}>전체 보기</button>
          <button onClick={() => setTaskFilter('completed')} className={`dashboard__variant_022 ${taskFilter === 'completed' ? 'dashboard__variant_023' : 'dashboard__variant_021'}`}><CheckCircle2 size={14} /> 완료자</button>
          <button onClick={() => setTaskFilter('incomplete')} className={`dashboard__variant_022 ${taskFilter === 'incomplete' ? 'dashboard__variant_024' : 'dashboard__variant_021'}`}><Circle size={14} /> 미완료자</button>
        </div>
      </div>

      <div className="dashboard__group_015">
        
        <div className="dashboard__group_016">
          <section>{[3, 2, 1].map(renderAccordion)}</section>
          
          <section className="dashboard__section_001">
            <div className="dashboard__group_017">
              <div>
                <h2 className="dashboard__title_001"><CalendarDays size={18} className="dashboard__calendardays_001"/> 기간별 진도 현황</h2>
                <p className="dashboard__text_002">지난주와 월초·월말, 원하는 날짜의 진도 차이를 비교합니다.</p>
              </div>
              <div className="dashboard__group_018">
                <button onClick={() => applyPreset('lastWeek')} className="dashboard__button_002">지난주</button>
                <button onClick={() => applyPreset('7days')} className="dashboard__button_002">최근 7일</button>
                <button onClick={() => applyPreset('month')} className="dashboard__button_002">이번 달</button>
                <input type="date" value={rangeDraft.start_date} onChange={(event) => setRangeDraft({ ...rangeDraft, start_date: event.target.value })} className="dashboard__input_002" aria-label="조회 시작일" />
                <span className="dashboard__label_007">부터</span>
                <input type="date" value={rangeDraft.end_date} onChange={(event) => setRangeDraft({ ...rangeDraft, end_date: event.target.value })} className="dashboard__input_002" aria-label="조회 종료일" />
                <button onClick={() => {
                  if (!rangeDraft.start_date || !rangeDraft.end_date || rangeDraft.start_date > rangeDraft.end_date) {
                    window.alert('시작일과 종료일을 확인해주세요.');
                    return;
                  }
                  setRange({ ...rangeDraft });
                }} className="dashboard__button_003">조회</button>
              </div>
            </div>
            <div className="dashboard__group_019">
              {progressCards.map((card) => {
                const startValue = firstPoint?.[card.key] || 0;
                const endValue = lastPoint?.[card.key] || 0;
                const change = endValue - startValue;
                return (
                  <div key={card.key} className="dashboard__group_020">
                    <p className={`dashboard__variant_025 ${card.color}`}>{card.label}</p>
                    <div className="dashboard__group_021">
                      <span className="dashboard__label_008">{endValue}<span className="dashboard__label_009">{card.unit}</span></span>
                      <span className={`dashboard__variant_025 ${change > 0 ? 'dashboard__variant_004' : change < 0 ? 'dashboard__variant_006' : 'dashboard__variant_026'}`}>{change > 0 ? '+' : ''}{change}{card.unit}</span>
                    </div>
                    <p className="dashboard__text_003">시작 {startValue}{card.unit} → 종료 {endValue}{card.unit}</p>
                  </div>
                );
              })}
            </div>
            {!historyAvailable && (
              <div className="dashboard__group_022">
                선택 기간에 완료 날짜가 저장된 미션 기록이 없습니다. 해당 기간 이전에 완료된 미션은 날짜별 진도 추이에 반영할 수 없습니다.
              </div>
            )}
            {historyMode === 'legacy' && (
              <div className="dashboard__group_023">
                선택한 기간은 기존 단계 통과 기록을 바탕으로 표시하고 있습니다. 미션별 완료 날짜가 없는 값은 상세한 날짜별 진도 변화를 복원할 수 없습니다.
              </div>
            )}
            <div className="dashboard__group_024">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis yAxisId="count" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''} contentStyle={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-strong)', color: 'var(--text-strong)', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px' }}/>
                  <Line yAxisId="count" type="monotone" dataKey="level1" name="1단계 인원" stroke="var(--chart-series-neutral)" strokeWidth={2} dot={false} activeDot={{ r: 4 }}/>
                  <Line yAxisId="count" type="monotone" dataKey="level2" name="2단계 인원" stroke="var(--chart-blue)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
                  <Line yAxisId="count" type="monotone" dataKey="level3" name="Final 인원" stroke="var(--chart-purple)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }}/>
                  <Line yAxisId="count" type="monotone" dataKey="completed" name="수료 인원" stroke="var(--chart-green)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="dashboard__section_002">
            <div className="dashboard__group_025"><h2 className="dashboard__title_002">퍼실별 담당팀 인원</h2><p className="dashboard__text_004">담당팀별 교육생 수를 비교합니다.</p></div>
            {facilitatorWorkload.length ? <div className="dashboard__group_026" style={{ '--chart-height': `${Math.max(240, facilitatorWorkload.length * 48)}px` }}><ResponsiveContainer width="100%" height="100%">
              <BarChart data={facilitatorWorkload} layout="vertical" margin={{ top: 4, right: 26, left: 20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} stroke="var(--chart-axis)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}명`, '담당 인원']} contentStyle={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-strong)', color: 'var(--text-strong)', borderRadius: '8px' }} />
                <Bar dataKey="traineeCount" name="담당 인원" radius={[0, 5, 5, 0]}><LabelList dataKey="traineeCount" position="right" formatter={(value) => `${value}명`} fill="var(--chart-axis)" fontSize={11} />{facilitatorWorkload.map((entry) => <Cell key={entry.name} fill={entry.name === '미배정' ? 'var(--chart-muted-bar)' : 'var(--chart-purple)'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer></div> : <p className="dashboard__text_005">담당팀에 배정된 교육생이 없습니다.</p>}
          </section>

        </div>
        
        <div className="dashboard__group_027">
          <section className="dashboard__section_003">
            <h2 className="dashboard__title_003">
              <Bell size={18} className="dashboard__bell_001"/> 할 일 / 공지 보드
            </h2>
            
            <div className="dashboard__group_028">
              <div className="dashboard__group_029">
                {["일반", "긴급", "퍼실 공지", "기술지원"].map((category) => <button key={category} onClick={() => setNewCategory(category)} className={`dashboard__variant_027 ${newCategory === category ? (category === "긴급" ? "dashboard__variant_028" : category === "기술지원" ? "dashboard__variant_029" : category === "퍼실 공지" ? "dashboard__variant_030" : "dashboard__variant_031") : "dashboard__variant_032"}`}>{category === "긴급" && <AlertCircle size={12} className="dashboard__alertcircle_001" />}{category}</button>)}
              </div>
              <textarea 
                value={newNotice}
                onChange={(e) => setNewNotice(e.target.value)}
                placeholder="해야 할 일이나 공지를 적어주세요..." 
                className="custom-scrollbar dashboard__textarea_001"
              />
              <button onClick={handleAddNotice} className="dashboard__button_004">등록하기</button>
            </div>

            <div className="custom-scrollbar dashboard__group_030">
              {notices.map(notice => (
                <div key={notice.notice_id} className={`dashboard__variant_033 group dashboard__variant_034 ${notice.is_pinned ? 'dashboard__variant_035' : 'dashboard__variant_036'}`}>
                  
                  <button onClick={() => handleToggleNotice(notice.notice_id, 'status', notice.status)} className="dashboard__button_005">
                    {notice.status === '완료' ? <CheckCircle2 className="dashboard__checkcircle2_001" size={18}/> : <Circle className="dashboard__circle_001" size={18}/>}
                  </button>
                  
                  <div className="dashboard__group_031">
                    <div className="dashboard__group_032">
                      {notice.category && notice.category !== '일반' && <span className={`dashboard__variant_037 ${notice.category === '긴급' ? 'dashboard__variant_028' : notice.category === '기술지원' ? 'dashboard__variant_029' : 'dashboard__variant_030'}`}>{notice.category}</span>}
                      {notice.is_pinned && <span className="dashboard__label_010">고정됨</span>}
                    </div>
                    <p className={`dashboard__variant_038 ${notice.status === '완료' ? 'dashboard__variant_039' : 'dashboard__variant_040'}`}>
                      {notice.content}
                    </p>
                    <time className="dashboard__time_001" dateTime={notice.created_at || undefined}>
                      <CalendarDays size={12} /> {formatNoticeDate(notice.created_at)}
                    </time>
                  </div>
                  
                  <div className="dashboard__group_033">
                    <button onClick={() => handleToggleNotice(notice.notice_id, 'is_pinned', notice.is_pinned)} className="dashboard__button_006">
                      <Pin size={16} className={notice.is_pinned ? "dashboard__variant_041" : "dashboard__variant_042"} />
                    </button>
                    <button onClick={() => handleDeleteNotice(notice.notice_id)} className="dashboard__button_007">
                      <Trash2 size={16} className="dashboard__trash2_001" />
                    </button>
                  </div>
                </div>
              ))}
              {notices.length === 0 && <div className="dashboard__group_034">등록된 항목이 없습니다.</div>}
            </div>
          </section>
        </div>
        
      </div>

      <MissionProgressByLevel trainees={trainees} missionRows={missionRows} title="단계별 미션 진행 현황" />

      <section className="dashboard__section_004">
        <div className="dashboard__group_035">
          <div>
            <h2 className="dashboard__title_004"><Clock3 size={18} className="dashboard__clock3_001" /> 진도 업데이트 정체 명단</h2>
            <p className="dashboard__text_004">크롤링된 미션 완료 날짜와 시각을 기준으로 마지막 진도 이후 경과일을 계산합니다.</p>
          </div>
          <div className="dashboard__group_036">
            <div className="dashboard__group_037">
              <p className="dashboard__text_006">선택 기수 최근 업데이트</p>
              <p className="dashboard__text_007">{latestProgressUpdate ? String(latestProgressUpdate).slice(0, 10).replaceAll('-', '.') : 'X'}</p>
            </div>
            <label className="dashboard__label_011">기준일
              <input type="date" value={staleAsOf} onChange={(event) => setStaleAsOf(event.target.value)} className="dashboard__input_003" />
            </label>
            <label className="dashboard__label_011">정체 기준
              <span className="dashboard__label_012"><input type="number" min="1" max="3650" value={staleAfterDays} onChange={(event) => setStaleAfterDays(event.target.value)} className="dashboard__input_004" /><span>일 이상</span></span>
            </label>
            <label className="dashboard__label_011">전담팀
              <select value={staleTeamFilter} onChange={(event) => setStaleTeamFilter(event.target.value)} className="dashboard__select_001"><option value="all">전체 팀</option>{teamFilterOptions.map((team) => <option key={team} value={team}>{team}</option>)}</select>
            </label>
            <label className="dashboard__label_011">정렬
              <select value={staleSortOrder} onChange={(event) => setStaleSortOrder(event.target.value)} className="dashboard__select_002"><option value="desc">경과 일수 내림차순</option><option value="asc">경과 일수 오름차순</option></select>
            </label>
          </div>
        </div>
        <div className="dashboard__group_038">
          <p className="dashboard__text_008">{stalledTrainees.length}명 기준에 해당합니다.{includeNoProgressRecord ? ' 완료 기록이 없는 인원도 포함 중입니다.' : ' 완료 기록이 없는 인원은 제외했습니다.'}</p>
          <label className="dashboard__label_013"><input type="checkbox" checked={includeNoProgressRecord} onChange={(event) => setIncludeNoProgressRecord(event.target.checked)} className="dashboard__input_005" />기록 없는 인원 포함</label>
        </div>
        <div className="dashboard__group_039">
          <table className="dashboard__table_001">
            <thead className="dashboard__thead_001"><tr><th className="dashboard__heading_001">교육생</th><th className="dashboard__heading_001">전담팀</th><th className="dashboard__heading_001">단계 / 과제</th><th className="dashboard__heading_001">마지막 업데이트 날짜</th><th className="dashboard__heading_002">경과 일수</th></tr></thead>
            <tbody className="dashboard__tbody_001">
              {stalledTrainees.map((trainee) => <tr key={trainee.id} className="dashboard__row_001"><td className="dashboard__cell_001">{trainee.name}<span className="dashboard__label_014">#{trainee.id}</span></td><td className="dashboard__cell_002">{trainee.team || '미배정'}</td><td className="dashboard__cell_002">{trainee.level === 3 ? 'Final' : `${trainee.level}단계`} · {trainee.done}/{trainee.target}</td><td className="dashboard__cell_003">{trainee.latestDate ? trainee.latestDate.replaceAll('-', '.') : 'X'}</td><td className="dashboard__cell_004"><span className={`dashboard__variant_043 ${trainee.daysSinceProgress === null ? 'dashboard__variant_044' : 'dashboard__variant_013'}`}>{trainee.daysSinceProgress === null ? 'X' : `${trainee.daysSinceProgress}일`}</span></td></tr>)}
              {stalledTrainees.length === 0 && <tr><td colSpan="5" className="dashboard__cell_005">선택한 기준에 해당하는 교육생이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
