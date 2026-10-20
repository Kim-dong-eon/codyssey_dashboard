import './TeamMemos.css';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { GlobalContext } from '../context/GlobalContext';
import { dashboardApi } from '../api/dashboard';
import { schedulesApi } from '../api/schedules';
import { teamsApi } from '../api/teams';
import { traineesApi } from '../api/trainees';
import { Bell, CalendarClock, CalendarDays, CheckCircle2, Circle, MessageSquare, NotebookPen, Pencil, PhoneCall, Pin, Plus, Search, Trash2, Users, X } from 'lucide-react';

const dateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = dateValue(value);
  return date ? date.toLocaleString('ko-KR') : '날짜 정보 없음';
};

const sourceOptions = [
  { id: 'all', label: '전체 기록', icon: Users },
  { id: 'team_memo', label: '팀 메모', icon: NotebookPen },
  { id: 'trainee_memo', label: '개인 메모', icon: NotebookPen },
  { id: 'counseling', label: '상담', icon: MessageSquare },
  { id: 'call_campaign', label: '팀 전화 기록', icon: PhoneCall },
  { id: 'notice', label: '공지', icon: Bell },
  { id: 'schedule', label: '일정·행사', icon: CalendarDays },
];

const sourceLabels = Object.fromEntries(sourceOptions.map(({ id, label }) => [id, label]));

const TeamMemos = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [feed, setFeed] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingMemo, setEditingMemo] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [entryMode, setEntryMode] = useState('team_memo');
  const [callReason, setCallReason] = useState('');
  const [callRecipients, setCallRecipients] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editCallReason, setEditCallReason] = useState('');
  const [editCallRecipients, setEditCallRecipients] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [memoRows, teamRows, contacts, notices, events, callCampaigns] = await Promise.all([
        teamsApi.listCohortMemos(selectedCohort),
        teamsApi.list(selectedCohort),
        traineesApi.listCohortContacts(selectedCohort),
        dashboardApi.listNotices(selectedCohort),
        schedulesApi.list(selectedCohort),
        teamsApi.listCallCampaigns(selectedCohort),
      ]);
      const teamList = (teamRows || []).filter((team) => team.team_id !== null);
      setTeams(teamList);

      const memoFeed = (memoRows || []).map((memo) => ({
        ...memo,
        source: memo.memo_type === 'team' ? 'team_memo' : 'trainee_memo',
        feed_id: `memo-${memo.memo_id}`,
        displayTitle: memo.title || (memo.memo_type === 'team' ? `${memo.team_name} 팀 메모` : `${memo.trainee_name || '교육생'} 개인 메모`),
        displayDate: memo.created_at,
        displayContent: memo.content,
      }));
      const contactFeed = (contacts || []).map((contact) => ({
        ...contact,
        source: 'counseling',
        feed_id: `contact-${contact.contact_id}`,
        displayTitle: contact.topic || '상담 기록',
        displayDate: contact.contact_date,
        displayContent: contact.content,
        author: contact.manager_name,
        subtitle: contact.contact_method,
      }));
      const callFeed = (callCampaigns || []).map((campaign) => ({
        ...campaign,
        source: 'call_campaign',
        feed_id: `call-${campaign.campaign_id}`,
        displayTitle: campaign.reason,
        displayDate: campaign.created_at,
        displayContent: '',
        author: campaign.manager_name,
        subtitle: '전화',
      }));
      const noticeFeed = (notices || []).map((notice) => ({
        ...notice,
        source: 'notice',
        feed_id: `notice-${notice.notice_id}`,
        displayTitle: notice.title || '공지',
        displayDate: notice.created_at,
        displayContent: notice.content,
        author: notice.author || '퍼실리테이터',
        subtitle: notice.category || '일반',
      }));
      const scheduleFeed = (events || []).map((event) => ({
        ...event,
        source: 'schedule',
        feed_id: `schedule-${event.event_id}`,
        displayTitle: event.title || '일정',
        displayDate: event.event_date,
        displayContent: event.description || '상세 내용 없음',
        author: event.cohort_id === 0 ? '전체 공통' : `${selectedCohort}기`,
        subtitle: event.event_type || '일정',
      }));
      setFeed([...memoFeed, ...contactFeed, ...callFeed, ...noticeFeed, ...scheduleFeed]);
    } catch (reason) {
      setError(reason.response?.data?.detail || '팀 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedCohort]);

  const visibleFeed = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return feed.filter((item) => {
      const recipientSearch = (item.recipients || []).map((recipient) => `${recipient.trainee_name} ${recipient.note || ''}`).join(' ');
      const matchesSearch = !query || `${item.displayTitle} ${item.displayContent} ${item.trainee_name || ''} ${item.team_name || ''} ${item.author || ''} ${item.category || ''} ${recipientSearch}`.toLocaleLowerCase().includes(query);
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesTeam = teamFilter === 'all'
        || (teamFilter === 'unassigned' ? item.team_id == null && item.trainee_id != null : String(item.team_id) === teamFilter);
      return matchesSearch && matchesSource && matchesTeam;
    }).sort((a, b) => (dateValue(b.updated_at || b.displayDate)?.getTime() || 0) - (dateValue(a.updated_at || a.displayDate)?.getTime() || 0));
  }, [feed, search, sourceFilter, teamFilter]);

  const sourceCounts = useMemo(() => feed.reduce((counts, item) => {
    counts[item.source] = (counts[item.source] || 0) + 1;
    counts.all += 1;
    return counts;
  }, { all: 0 }), [feed]);

  const urgentNotices = useMemo(() => feed
    .filter((item) => item.source === 'notice' && item.category === '긴급' && item.status !== '완료')
    .sort((a, b) => (dateValue(b.displayDate)?.getTime() || 0) - (dateValue(a.displayDate)?.getTime() || 0)), [feed]);

  const selectedTeam = teams.find((team) => String(team.team_id) === String(selectedTeamId));
  const selectedCallRecipients = (selectedTeam?.members || [])
    .filter((member) => callRecipients[member.id]?.selected)
    .map((member) => ({ ...member, ...callRecipients[member.id] }));
  const handleTeamSelect = (teamId) => {
    setSelectedTeamId(teamId);
    const team = teams.find((item) => String(item.team_id) === String(teamId));
    setCallRecipients(Object.fromEntries((team?.members || []).map((member) => [member.id, { selected: false, received: true, note: '', noteOpen: false }])));
  };

  const updateCallRecipient = (traineeId, changes) => {
    setCallRecipients((current) => ({
      ...current,
      [traineeId]: { selected: false, received: true, note: '', noteOpen: false, ...current[traineeId], ...changes },
    }));
  };

  const handleSaveCallCampaign = async () => {
    if (!selectedTeamId || !callReason.trim() || !selectedCallRecipients.length) return;
    setSaving(true);
    try {
      await teamsApi.createCallCampaign(selectedCohort, {
        team_id: Number(selectedTeamId),
        reason: callReason.trim(),
        recipients: selectedCallRecipients.map((recipient) => ({
          trainee_id: Number(recipient.id),
          received: Boolean(recipient.received),
          note: recipient.note.trim() || null,
        })),
      });
      setCallReason('');
      setCallRecipients({});
      setEntryMode('team_memo');
      setTeamFilter(selectedTeamId);
      setSourceFilter('call_campaign');
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '팀 전화 기록을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTeamId || !content.trim()) return;
    setSaving(true);
    try {
      await teamsApi.createMemo(Number(selectedTeamId), { title: title.trim() || null, content: content.trim() });
      setTitle('');
      setContent('');
      setTeamFilter(selectedTeamId);
      setSourceFilter('team_memo');
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '팀 메모를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (memo) => {
    setEditingMemo(memo);
    setEditTitle(memo.title || '');
    setEditContent(memo.content || '');
  };

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setEditCallReason(campaign.reason || '');
    setEditCallRecipients((campaign.recipients || []).map((recipient) => ({ ...recipient })));
  };

  const updateEditCallRecipient = (traineeId, changes) => {
    setEditCallRecipients((current) => current.map((recipient) => Number(recipient.trainee_id) === Number(traineeId) ? { ...recipient, ...changes } : recipient));
  };

  const saveEditCampaign = async () => {
    if (!editCallReason.trim() || !editCallRecipients.length) return;
    try {
      await teamsApi.updateCallCampaign(selectedCohort, editingCampaign.campaign_id, {
        reason: editCallReason.trim(),
        recipients: editCallRecipients.map((recipient) => ({ trainee_id: Number(recipient.trainee_id), received: Boolean(recipient.received), note: recipient.note?.trim() || null })),
      });
      setEditingCampaign(null);
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '전화 기록을 수정하지 못했습니다.');
    }
  };

  const saveEdit = async () => {
    if (!editContent.trim()) return window.alert('메모 내용을 입력해주세요.');
    try {
      if (editingMemo.memo_type === 'team') {
        await teamsApi.updateMemo(editingMemo.team_id, editingMemo.memo_id, { title: editTitle.trim() || null, content: editContent.trim() });
      } else {
        await traineesApi.updateMemo(editingMemo.memo_id, { title: editTitle.trim() || null, content: editContent.trim() });
      }
      setEditingMemo(null);
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '메모를 수정하지 못했습니다.');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`${item.displayTitle} 기록을 삭제할까요?`)) return;
    try {
      if (item.source === 'team_memo') await teamsApi.deleteMemo(item.team_id, item.memo_id);
      else if (item.source === 'trainee_memo') await traineesApi.deleteMemo(item.memo_id);
      else if (item.source === 'counseling') await traineesApi.deleteContact(item.contact_id);
      else if (item.source === 'call_campaign') await teamsApi.deleteCallCampaign(selectedCohort, item.campaign_id);
      else if (item.source === 'notice') await dashboardApi.deleteNotice(item.notice_id);
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '기록을 삭제하지 못했습니다.');
    }
  };

  const handleCompleteUrgentNotice = async (item) => {
    try {
      await dashboardApi.updateNotice(item.notice_id, { status: '완료' });
      await fetchData();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '긴급 공지 상태를 바꾸지 못했습니다.');
    }
  };

  const getItemColor = (source) => ({
    team_memo: 'teammemos__variant_001',
    trainee_memo: 'teammemos__variant_002',
    counseling: 'teammemos__variant_003',
    call_campaign: 'teammemos__variant_004',
    notice: 'teammemos__variant_005',
    schedule: 'teammemos__variant_006',
  }[source] || 'teammemos__variant_007');

  const getItemIcon = (source) => {
    const Icon = sourceOptions.find((option) => option.id === source)?.icon || NotebookPen;
    return <Icon size={14} />;
  };

  return (
    <main className="teammemos__main_001">
      <header className="teammemos__header_001">
        <div className="teammemos__group_001">
          <div className="teammemos__group_002"><NotebookPen size={22} className="teammemos__notebookpen_001" /></div>
          <div><h1 className="teammemos__title_001">팀 기록 모음</h1><p className="teammemos__text_001">팀 메모, 상담, 공지와 일정·행사 기록을 한곳에서 확인합니다.</p></div>
        </div>
        <div className="teammemos__group_003">{visibleFeed.length}건 표시</div>
      </header>

      {urgentNotices.length > 0 && <section aria-label="긴급 공지" className="teammemos__section_001">
        <header className="teammemos__header_002">
          <h2 className="teammemos__title_002"><Bell size={15} />긴급 공지 · 확인할 일</h2>
          <span className="teammemos__label_001">{urgentNotices.length}건</span>
        </header>
        <div className="teammemos__group_004">
          {urgentNotices.map((item) => <article key={item.feed_id} className="teammemos__card_001">
            <button type="button" onClick={() => handleCompleteUrgentNotice(item)} title="완료 처리" aria-label="긴급 공지 완료 처리" className="teammemos__button_001"><Circle size={17} /></button>
            <div className="teammemos__group_005"><div className="teammemos__group_006"><span className="teammemos__label_002">긴급</span><span className="teammemos__label_003">{item.author || '퍼실리테이터'}</span></div><p className="teammemos__text_002">{item.displayContent}</p><time className="teammemos__time_001">{formatDate(item.displayDate)}</time></div>
          </article>)}
        </div>
      </section>}

      {error && <p role="alert" className="teammemos__text_003">{error}</p>}

      <div className="teammemos__group_007">
        <aside className="teammemos__aside_001">
          <header className="teammemos__header_003">
            <div><p className="teammemos__text_004">새 기록</p><h2 className="teammemos__title_003">{entryMode === 'call_campaign' ? <><PhoneCall size={16} /> 팀 전화 기록</> : <><Pin size={16} /> 팀 메모 작성</>}</h2></div>
            <NotebookPen size={18} className="teammemos__notebookpen_001" />
          </header>
          <div className="teammemos__group_008">
            <div className="teammemos__group_009">
              <button type="button" onClick={() => setEntryMode('team_memo')} className={`teammemos__variant_008 ${entryMode === 'team_memo' ? 'teammemos__variant_009' : 'teammemos__variant_010'}`}><NotebookPen size={13} className="teammemos__notebookpen_002" />팀 메모</button>
              <button type="button" onClick={() => setEntryMode('call_campaign')} className={`teammemos__variant_008 ${entryMode === 'call_campaign' ? 'teammemos__variant_011' : 'teammemos__variant_010'}`}><PhoneCall size={13} className="teammemos__notebookpen_002" />전화 기록</button>
            </div>
            <label className="teammemos__label_004">{entryMode === 'call_campaign' ? '전화할 팀' : '메모를 남길 팀'}
              <select value={selectedTeamId} onChange={(event) => handleTeamSelect(event.target.value)} className="teammemos__select_001">
                <option value="">팀 선택</option>
                {teams.map((team) => <option key={team.team_id} value={team.team_id}>{team.team_name} · {team.members?.length || 0}명</option>)}
              </select>
            </label>
            {entryMode === 'team_memo' ? <>
            <label className="teammemos__label_004">제목 <span className="teammemos__label_005">선택</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} placeholder="예: 다음 주 팀 과제 확인" className="teammemos__input_001" />
            </label>
            <label className="teammemos__label_004">내용
              <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} maxLength={5000} placeholder="팀에 전달할 학습 상황, 후속 조치, 인계 사항을 적어주세요." className="teammemos__textarea_001" />
            </label>
            <div className="teammemos__group_010"><span>선택한 team에 연결해 저장합니다.</span><span>{content.length}/5000</span></div>
            <button onClick={handleSave} disabled={saving || !selectedTeamId || !content.trim()} className="teammemos__button_002"><Plus size={16} />{saving ? '저장 중...' : '팀 메모 저장'}</button>
            </> : <>
            <label className="teammemos__label_004">공통 전화 사유
              <input value={callReason} onChange={(event) => setCallReason(event.target.value)} maxLength={255} placeholder="예: 필수 과제 진행 상황 확인" className="teammemos__input_002" />
            </label>
            <div className="teammemos__group_011">
              <div className="teammemos__group_012"><span>연락할 교육생</span><span>{selectedCallRecipients.length}명 선택</span></div>
              {selectedTeam ? <div className="teammemos__group_013">
                {(selectedTeam.members || []).map((member) => {
                  const recipient = callRecipients[member.id] || { selected: false, received: true, note: '', noteOpen: false };
                  return <div key={member.id} className={`teammemos__variant_012 ${recipient.selected ? 'teammemos__variant_013' : 'teammemos__variant_014'}`}>
                    <label className="teammemos__label_006"><input type="checkbox" checked={Boolean(recipient.selected)} onChange={(event) => updateCallRecipient(member.id, { selected: event.target.checked })} className="teammemos__input_003" /><span>{member.name}</span><span className="teammemos__label_003">#{member.id}</span></label>
                    {recipient.selected && <div className="teammemos__group_014">
                      <div className="teammemos__group_015">
                        <label className="teammemos__label_007"><input type="checkbox" aria-label={`${member.name} 연락 받음`} checked={Boolean(recipient.received)} onChange={(event) => updateCallRecipient(member.id, { received: event.target.checked })} className="teammemos__input_004" /><span>연락 받음</span></label>
                        <button type="button" onClick={(event) => { event.stopPropagation(); updateCallRecipient(member.id, { noteOpen: !recipient.noteOpen }); }} aria-expanded={Boolean(recipient.noteOpen)} className="teammemos__button_003"><MessageSquare size={12} />{recipient.noteOpen ? '특이사항 숨기기' : recipient.note?.trim() ? '특이사항 보기' : '특이사항 추가'}</button>
                      </div>
                      {recipient.noteOpen && <textarea aria-label={`${member.name} 특이사항`} value={recipient.note || ''} onChange={(event) => updateCallRecipient(member.id, { note: event.target.value })} maxLength={1000} rows={4} placeholder="통화 내용과 후속 조치를 적어주세요." className="teammemos__textarea_002" />}
                    </div>}
                  </div>;
                })}
                {selectedTeam.members?.length === 0 && <p className="teammemos__text_005">현재 연락할 수 있는 교육생이 없습니다.</p>}
              </div> : <p className="teammemos__text_006">먼저 전담팀을 선택해주세요.</p>}
            </div>
            <p className="teammemos__text_007">한 번의 전화 사유 아래 교육생별 수신 여부와 특이사항을 함께 저장합니다.</p>
            <button onClick={handleSaveCallCampaign} disabled={saving || !selectedTeamId || !callReason.trim() || !selectedCallRecipients.length} className="teammemos__button_004"><PhoneCall size={16} />{saving ? '저장 중...' : '팀 전화 기록 저장'}</button>
            </>}
          </div>
        </aside>

        <section className="teammemos__section_002">
          <div className="teammemos__group_016">
            <label className="teammemos__label_008">
              <Search size={16} className="teammemos__search_001" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="내용, 교육생, 담당팀 검색" className="teammemos__input_005" />
            </label>
            <div className="teammemos__group_006">
              <div className="teammemos__group_017">
                {sourceOptions.map((option) => {
                  const Icon = option.icon;
                  return <button key={option.id} onClick={() => setSourceFilter(option.id)} className={`teammemos__variant_015 ${sourceFilter === option.id ? 'teammemos__variant_016' : 'teammemos__variant_017'}`}><Icon size={13} />{option.label}<span className="teammemos__label_009">{sourceCounts[option.id] || 0}</span></button>;
                })}
              </div>
              <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="teammemos__select_002">
                <option value="all">모든 담당팀</option>
                <option value="unassigned">미배정</option>
                {teams.map((team) => <option key={team.team_id} value={team.team_id}>{team.team_name}</option>)}
              </select>
            </div>
          </div>

          {loading ? <p className="teammemos__text_008">기록을 불러오는 중...</p> : visibleFeed.length ? (
            <div className="teammemos__group_018">
              {visibleFeed.map((item) => {
                const isMemo = item.source === 'team_memo' || item.source === 'trainee_memo';
                const canDelete = isMemo || item.source === 'counseling' || item.source === 'call_campaign' || item.source === 'notice';
                const titleText = item.displayTitle;
                return <article key={item.feed_id} className={`teammemos__variant_018 ${getItemColor(item.source)}`}>
                  <div className="teammemos__group_019">
                    <div className="teammemos__group_020">
                      <span className="teammemos__label_010">{getItemIcon(item.source)}{sourceLabels[item.source]}{item.subtitle ? ` · ${item.subtitle}` : ''}</span>
                      <h2 className="teammemos__title_004">{titleText}</h2>
                      <p className="teammemos__text_009">{item.trainee_name ? `${item.trainee_name} · ` : ''}{item.team_name || (item.source.includes('notice') || item.source === 'schedule' ? item.author : '미배정')}</p>
                    </div>
                    <div className="teammemos__group_021">
                      {isMemo && <button onClick={() => handleEdit(item)} aria-label="메모 수정" title="메모 수정" className="teammemos__button_005"><Pencil size={14} /></button>}
                      {item.source === 'call_campaign' && <button onClick={() => handleEditCampaign(item)} aria-label="전화 기록 수정" title="전화 기록 수정" className="teammemos__button_005"><Pencil size={14} /></button>}
                      {canDelete && <button onClick={() => handleDelete(item)} aria-label="기록 삭제" title="기록 삭제" className="teammemos__button_006"><Trash2 size={14} /></button>}
                      {item.is_pinned && <Pin size={14} className="teammemos__pin_001" />}
                    </div>
                  </div>
                  {item.source === 'call_campaign' ? <div className="teammemos__group_022">
                    {(item.recipients || []).map((recipient) => <div key={recipient.recipient_id} className="teammemos__group_023">
                      <div className="teammemos__group_024">
                        <span className="teammemos__label_011">{recipient.trainee_name}</span>
                        <span className={`teammemos__variant_019 ${recipient.received ? 'teammemos__variant_020' : 'teammemos__variant_021'}`}>{recipient.received ? <CheckCircle2 size={11} /> : <Circle size={11} />}{recipient.received ? '연락 받음' : '연락 못 받음'}</span>
                      </div>
                      {recipient.note && <p className="teammemos__text_010">{recipient.note}</p>}
                    </div>)}
                  </div> : <p className="teammemos__text_011">{item.displayContent}</p>}
                  <footer className="teammemos__footer_001">
                    <span>{item.author || (item.source === 'counseling' ? '담당자 미기록' : '퍼실리테이터')}{item.status ? ` · ${item.status}` : ''}</span>
                    <time className="teammemos__time_002"><CalendarClock size={12} />{formatDate(item.updated_at && dateValue(item.updated_at) > dateValue(item.displayDate) ? item.updated_at : item.displayDate)}{item.updated_at && dateValue(item.updated_at) > dateValue(item.displayDate) ? ' · 수정' : ''}</time>
                  </footer>
                </article>;
              })}
            </div>
          ) : (
            <div className="teammemos__group_025">
              <NotebookPen size={28} className="teammemos__notebookpen_003" />
              <p className="teammemos__text_012">{search || sourceFilter !== 'all' || teamFilter !== 'all' ? '조건에 맞는 기록이 없습니다.' : '아직 등록된 팀 기록이 없습니다.'}</p>
              <p className="teammemos__text_013">왼쪽에서 팀을 선택해 새 메모를 작성하거나 필터를 바꿔보세요.</p>
            </div>
          )}
        </section>
      </div>

      {editingMemo && (
        <div className="teammemos__group_026" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingMemo(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-memo-title" className="teammemos__section_003">
            <header className="teammemos__header_004">
              <div><h2 id="edit-memo-title" className="teammemos__title_005">메모 수정</h2><p className="teammemos__text_014">{editingMemo.memo_type === 'team' ? editingMemo.team_name : editingMemo.trainee_name}</p></div>
              <button onClick={() => setEditingMemo(null)} aria-label="수정 창 닫기" className="teammemos__button_007"><X size={18} /></button>
            </header>
            <div className="teammemos__group_008">
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={255} placeholder="메모 제목" className="teammemos__input_006" />
              <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={7} maxLength={5000} className="teammemos__textarea_003" />
              <div className="teammemos__group_027"><button onClick={() => setEditingMemo(null)} className="teammemos__button_008">취소</button><button onClick={saveEdit} disabled={!editContent.trim()} className="teammemos__button_009">수정 저장</button></div>
            </div>
          </section>
        </div>
      )}

      {editingCampaign && (
        <div className="teammemos__group_026" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCampaign(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-call-title" className="teammemos__section_004">
            <header className="teammemos__header_004">
              <div><h2 id="edit-call-title" className="teammemos__title_005">전화 기록 수정</h2><p className="teammemos__text_014">{editingCampaign.team_name} · 수정 날짜가 기록됩니다.</p></div>
              <button onClick={() => setEditingCampaign(null)} aria-label="수정 창 닫기" className="teammemos__button_007"><X size={18} /></button>
            </header>
            <div className="teammemos__group_028">
              <label className="teammemos__label_004">전화 사유
                <input value={editCallReason} onChange={(event) => setEditCallReason(event.target.value)} maxLength={255} className="teammemos__input_007" />
              </label>
              <div className="teammemos__group_029">{editCallRecipients.map((recipient) => <section key={recipient.trainee_id} className="teammemos__section_005">
                <div className="teammemos__group_030"><h3 className="teammemos__title_005">{recipient.trainee_name}</h3><label className="teammemos__label_007"><input type="checkbox" checked={Boolean(recipient.received)} onChange={(event) => updateEditCallRecipient(recipient.trainee_id, { received: event.target.checked })} className="teammemos__input_004" />연락 받음</label></div>
                <label className="teammemos__label_012">특이사항
                  <textarea value={recipient.note || ''} onChange={(event) => updateEditCallRecipient(recipient.trainee_id, { note: event.target.value })} maxLength={1000} rows={4} placeholder="통화 내용과 후속 조치를 적어주세요." className="teammemos__textarea_004" />
                </label>
              </section>)}</div>
              <div className="teammemos__group_027"><button onClick={() => setEditingCampaign(null)} className="teammemos__button_008">취소</button><button onClick={saveEditCampaign} disabled={!editCallReason.trim() || !editCallRecipients.length} className="teammemos__button_010">수정 저장</button></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default TeamMemos;
