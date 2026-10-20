import './Schedule.css';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalContext } from '../context/GlobalContext';
import { schedulesApi } from '../api/schedules';
import { traineesApi } from '../api/trainees';
import { Calendar as CalIcon, CalendarDays, Plus, X, Trash2, Globe, ChevronLeft, ChevronRight, SlidersHorizontal, Pencil, Save, Users, UserPlus, XCircle, Search } from 'lucide-react';

const getLocalDateString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const Schedule = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [roster, setRoster] = useState([]);
  const [allTrainees, setAllTrainees] = useState([]);
  const [traineeSearchTerm, setTraineeSearchTerm] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [isTraineeDropdownOpen, setIsTraineeDropdownOpen] = useState(false);
  const traineeSearchRef = useRef(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [eventEditForm, setEventEditForm] = useState({ title: '', event_type: '행사', description: '', event_date: '', isCommon: false });
  const [viewMode, setViewMode] = useState('current');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', event_type: '행사', description: '', isCommon: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = new Date();
  const [currYear, setCurrYear] = useState(today.getFullYear());
  const [currMonth, setCurrMonth] = useState(today.getMonth());

  const fetchEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = viewMode === 'all' ? 'all' : selectedCohort;
      setEvents(await schedulesApi.list(endpoint));
    } catch (reason) {
      setError(reason.response?.data?.detail || '일정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, [selectedCohort, viewMode]);

  useEffect(() => {
    traineesApi.list(selectedCohort).then((rows) => setAllTrainees(rows || [])).catch(() => setAllTrainees([]));
  }, [selectedCohort]);

  useEffect(() => {
    if (!isTraineeDropdownOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!traineeSearchRef.current?.contains(event.target)) setIsTraineeDropdownOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isTraineeDropdownOpen]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsEventModalOpen(false);
        setSelectedEvent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim()) return window.alert('일정/행사 이름을 입력해주세요.');
    try {
      await schedulesApi.create({
        cohort_id: eventForm.isCommon ? 0 : selectedCohort,
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        event_date: selectedDate,
        event_type: eventForm.event_type,
      });
      setIsEventModalOpen(false);
      setEventForm({ title: '', event_type: '행사', description: '', isCommon: false });
      await fetchEvents();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '일정을 저장하지 못했습니다.');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('이 일정을 삭제할까요?')) return;
    try {
      await schedulesApi.delete(eventId);
      setSelectedEvent(null);
      setRoster([]);
      await fetchEvents();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '일정을 삭제하지 못했습니다.');
    }
  };

  const fetchRoster = async (eventId) => {
    try {
      setRoster(await schedulesApi.listRoster(eventId));
    } catch (reason) {
      setRoster([]);
      window.alert(reason.response?.data?.detail || '참석 명단을 불러오지 못했습니다.');
    }
  };

  const handleAddTraineeToEvent = async () => {
    if (!selectedEvent || !selectedTraineeId) return window.alert('추가할 교육생을 검색해 선택해주세요.');
    try {
      await schedulesApi.registerTrainee(selectedEvent.event_id, Number(selectedTraineeId));
      setSelectedTraineeId('');
      setTraineeSearchTerm('');
      setIsTraineeDropdownOpen(false);
      await fetchRoster(selectedEvent.event_id);
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '명단에 추가하지 못했습니다.');
    }
  };

  const handleCancelRegistration = async (registrationId) => {
    if (!window.confirm('이 참석자의 상태를 취소로 바꿀까요?')) return;
    try {
      await schedulesApi.cancelRegistration(registrationId);
      await fetchRoster(selectedEvent.event_id);
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '참석을 취소하지 못했습니다.');
    }
  };

  const startEditingEvent = () => {
    setEventEditForm({
      title: selectedEvent.title || '',
      event_type: selectedEvent.event_type || '행사',
      description: selectedEvent.description || '',
      event_date: String(selectedEvent.event_date || '').slice(0, 10),
      isCommon: Number(selectedEvent.cohort_id) === 0,
    });
    setIsEditingEvent(true);
  };

  const handleUpdateEvent = async () => {
    if (!eventEditForm.title.trim() || !eventEditForm.event_date) return window.alert('일정 이름과 날짜를 입력해주세요.');
    const cohortId = eventEditForm.isCommon
      ? 0
      : Number(selectedEvent.cohort_id) === 0 ? selectedCohort : selectedEvent.cohort_id;
    try {
      await schedulesApi.update(selectedEvent.event_id, {
        cohort_id: cohortId,
        title: eventEditForm.title.trim(),
        description: eventEditForm.description.trim(),
        event_date: eventEditForm.event_date,
        event_type: eventEditForm.event_type,
      });
      setSelectedEvent(null);
      setIsEditingEvent(false);
      await fetchEvents();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '일정 내용을 수정하지 못했습니다.');
    }
  };

  const eventTypes = useMemo(() => ['all', ...new Set(events.map((event) => event.event_type).filter(Boolean))], [events]);
  const visibleEvents = useMemo(() => events.filter((event) => eventTypeFilter === 'all' || event.event_type === eventTypeFilter), [events, eventTypeFilter]);
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(currYear, currMonth, 1).getDay();
  const days = Array.from({ length: getDaysInMonth(currYear, currMonth) }, (_, index) => index + 1);
  const blanks = Array.from({ length: firstDay }, (_, index) => index);

  const changeMonth = (offset) => {
    const next = new Date(currYear, currMonth + offset, 1);
    setCurrYear(next.getFullYear());
    setCurrMonth(next.getMonth());
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  };

  const openEvent = (event, dateString) => {
    setSelectedDate(dateString);
    setIsEditingEvent(false);
    setTraineeSearchTerm('');
    setSelectedTraineeId('');
    setIsTraineeDropdownOpen(false);
    setRoster([]);
    setSelectedEvent(event);
    fetchRoster(event.event_id);
  };

  return (
    <main className="schedule__main_001">
      <header className="schedule__header_001">
        <div className="schedule__group_001">
          <div className="schedule__group_002">
            <span className="schedule__label_001"><CalIcon size={21} className="schedule__calicon_001" /></span>
            <div><h1 className="schedule__title_001">일정 및 행사</h1><p className="schedule__text_001">날짜를 눌러 일정을 고르고, 행사를 누르면 상세 내용을 엽니다.</p></div>
          </div>
          <div className="schedule__group_003">
            <button onClick={() => setViewMode('current')} className={`schedule__variant_001 ${viewMode === 'current' ? 'schedule__variant_002' : 'schedule__variant_003'}`}>{selectedCohort}기 + 공통</button>
            <button onClick={() => setViewMode('all')} className={`schedule__variant_004 ${viewMode === 'all' ? 'schedule__variant_002' : 'schedule__variant_003'}`}><Globe size={13} /> 전체 기수</button>
          </div>
        </div>
        <div className="schedule__group_004">
          <div className="schedule__group_005">
            <button onClick={() => changeMonth(-1)} aria-label="이전 달" className="schedule__button_001"><ChevronLeft size={17} /></button>
            <span className="schedule__label_002">{currYear}년 {currMonth + 1}월</span>
            <button onClick={() => changeMonth(1)} aria-label="다음 달" className="schedule__button_001"><ChevronRight size={17} /></button>
          </div>
          <button onClick={() => setIsEventModalOpen(true)} className="schedule__button_002"><Plus size={16} /> 새 일정</button>
        </div>
      </header>

      <div className="schedule__group_006">
        <div className="schedule__group_007"><SlidersHorizontal size={14} /> 일정 유형</div>
        <div className="schedule__group_008">
          {eventTypes.map((type) => (
            <button key={type} onClick={() => setEventTypeFilter(type)} className={`schedule__variant_001 ${eventTypeFilter === type ? 'schedule__variant_002' : 'schedule__variant_003'}`}>
              {type === 'all' ? `전체 (${events.length})` : `${type} (${events.filter((event) => event.event_type === type).length})`}
            </button>
          ))}
        </div>
        {selectedDate && <span className="schedule__label_003">선택 날짜 · {selectedDate.replaceAll('-', '.')}</span>}
      </div>

      {error && <p role="alert" className="schedule__text_002">{error}</p>}
      {loading && <p className="schedule__text_003">일정을 불러오는 중...</p>}

      <section className="schedule__section_001">
        <div className="schedule__group_009">
          <span className="schedule__label_004">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span className="schedule__label_005">토</span>
        </div>
        <div className="schedule__group_010">
          {blanks.map((blank) => <div key={`blank-${blank}`} className="schedule__group_011" />)}
          {days.map((day) => {
            const dateString = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = visibleEvents.filter((event) => event.event_date === dateString);
            const isSelected = selectedDate === dateString;
            return (
              <div
                key={dateString}
                onClick={() => setSelectedDate(dateString)}
                onDoubleClick={() => { setSelectedDate(dateString); setIsEventModalOpen(true); }}
                className={`schedule__variant_005 ${isSelected ? 'schedule__variant_006' : 'schedule__variant_007'}`}
              >
                <div className={`schedule__variant_008 ${isSelected ? 'schedule__variant_009' : 'schedule__variant_010'}`}>
                  <span>{day}</span>{dayEvents.length > 0 && <span className="schedule__label_006">{dayEvents.length}</span>}
                </div>
                <div className="schedule__group_012">
                  {dayEvents.map((event) => (
                    <button
                      type="button"
                      key={event.event_id}
                      onClick={(clickEvent) => { clickEvent.stopPropagation(); openEvent(event, dateString); }}
                      className={`schedule__variant_011 ${event.event_type === '행사' ? 'schedule__variant_012' : 'schedule__variant_013'} hover:brightness-125`}
                    >
                      <span className={`schedule__variant_014 ${event.cohort_id === 0 ? 'schedule__variant_015' : 'schedule__variant_016'}`}>{event.cohort_id === 0 ? '공통' : `${event.cohort_id}기`}</span>
                      <span className="schedule__label_007">{event.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {!loading && visibleEvents.length === 0 && <p className="schedule__text_004">이 유형으로 등록된 일정이 없습니다.</p>}
      </section>

      {selectedEvent && (
        <div className="schedule__group_013" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedEvent(null); setIsEditingEvent(false); } }}>
          <section role="dialog" aria-modal="true" aria-label={`${selectedEvent.title} 상세`} className="schedule__section_002">
            <header className="schedule__header_002">
              <div><p className="schedule__text_005">행사 상세</p><h2 className="schedule__title_002">{selectedEvent.title}</h2></div>
              <button onClick={() => { setSelectedEvent(null); setIsEditingEvent(false); }} aria-label="상세 닫기" className="schedule__button_003"><X size={18} /></button>
            </header>
            {isEditingEvent ? <div className="schedule__group_014">
              <label className="schedule__label_008">일정 이름<input value={eventEditForm.title} onChange={(event) => setEventEditForm({ ...eventEditForm, title: event.target.value })} maxLength={255} className="schedule__input_001" /></label>
              <label className="schedule__label_008">일정 날짜<input type="date" value={eventEditForm.event_date} onChange={(event) => setEventEditForm({ ...eventEditForm, event_date: event.target.value })} className="schedule__input_001" /></label>
              <label className="schedule__label_008">유형<select value={eventEditForm.event_type} onChange={(event) => setEventEditForm({ ...eventEditForm, event_type: event.target.value })} className="schedule__input_001"><option value="행사">행사</option><option value="교육/특강">교육/특강</option><option value="휴일">휴일</option><option value="공지">공지</option></select></label>
              <label className="schedule__label_008">상세 내용<textarea value={eventEditForm.description} onChange={(event) => setEventEditForm({ ...eventEditForm, description: event.target.value })} rows={6} maxLength={2000} className="schedule__textarea_001" /></label>
              <label className="schedule__label_009"><input type="checkbox" checked={eventEditForm.isCommon} onChange={(event) => setEventEditForm({ ...eventEditForm, isCommon: event.target.checked })} className="schedule__input_002" />모든 기수 공통 일정</label>
              <footer className="schedule__footer_001"><button onClick={() => setIsEditingEvent(false)} className="schedule__button_004">취소</button><button onClick={handleUpdateEvent} disabled={!eventEditForm.title.trim() || !eventEditForm.event_date} className="schedule__button_005"><Save size={15} />수정 저장</button></footer>
            </div> : <div className="schedule__group_015">
              <div className="schedule__group_004">
                <span className={`schedule__variant_017 ${selectedEvent.cohort_id === 0 ? 'schedule__variant_018' : 'schedule__variant_019'}`}>{selectedEvent.cohort_id === 0 ? '전체 공통' : `${selectedEvent.cohort_id}기 전용`}</span>
                <span className="schedule__label_010">{selectedEvent.event_type}</span>
                <span className="schedule__label_011"><CalendarDays size={13} className="schedule__calendardays_001" />{String(selectedEvent.event_date || '').slice(0, 10)}</span>
              </div>
              <div className="schedule__group_016">
                <h3 className="schedule__title_003">상세 내용</h3>
                <p className="schedule__text_006">{selectedEvent.description || '등록된 상세 내용이 없습니다.'}</p>
              </div>
              <section className="schedule__section_003">
                <header className="schedule__header_003">
                  <h3 className="schedule__title_004"><Users size={16} className="schedule__users_001" /> 참석 명단</h3>
                  <span className="schedule__label_012">{roster.filter((person) => person.status === '신청완료').length}명</span>
                </header>
                <div className="schedule__group_017">
                  <div ref={traineeSearchRef} className="schedule__group_018">
                    <Search size={15} className="schedule__search_001" />
                    <input value={traineeSearchTerm} onFocus={() => setIsTraineeDropdownOpen(true)} onChange={(event) => { setTraineeSearchTerm(event.target.value); setSelectedTraineeId(''); setIsTraineeDropdownOpen(true); }} placeholder={`${selectedCohort}기 교육생 이름 또는 팀 검색`} className="schedule__input_003" />
                    {isTraineeDropdownOpen && (
                      <div className="schedule__group_019">
                        {allTrainees.filter((person) => !person.is_dropped && `${person.name} ${person.team_name || ''}`.toLocaleLowerCase().includes(traineeSearchTerm.trim().toLocaleLowerCase())).map((person) => (
                          <button key={person.id} type="button" onClick={() => { setSelectedTraineeId(String(person.id)); setTraineeSearchTerm(`${person.name} (${person.team_name || '미배정'})`); setIsTraineeDropdownOpen(false); }} className="schedule__button_006">
                            <span className="schedule__label_013">{person.name}</span><span className="schedule__label_014">{person.team_name || '미배정'}</span>
                          </button>
                        ))}
                        {!allTrainees.some((person) => !person.is_dropped && `${person.name} ${person.team_name || ''}`.toLocaleLowerCase().includes(traineeSearchTerm.trim().toLocaleLowerCase())) && <p className="schedule__text_007">검색 결과가 없습니다.</p>}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={handleAddTraineeToEvent} disabled={!selectedTraineeId} title="명단에 추가" className="schedule__button_007"><UserPlus size={16} />추가</button>
                </div>
                <div className="attendance-roster-scroll schedule__group_020">
                  {roster.map((person) => (
                    <div key={person.reg_id} className={`schedule__variant_020 ${person.status === '취소됨' ? 'schedule__variant_021' : ''}`}>
                      <div className="schedule__group_021"><p className="schedule__text_008">{person.trainee_name}</p><p className="schedule__text_009">{person.team_name} · {person.reg_date ? new Date(person.reg_date).toLocaleString('ko-KR') : '등록 시각 없음'}</p></div>
                      {person.status === '신청완료' ? <button onClick={() => handleCancelRegistration(person.reg_id)} className="schedule__button_008">취소</button> : <span className="schedule__label_015"><XCircle size={13} />취소됨</span>}
                    </div>
                  ))}
                  {!roster.length && <p className="schedule__text_010">등록된 참석 명단이 없습니다.</p>}
                </div>
              </section>
              <footer className="schedule__footer_001">
                <button onClick={() => setSelectedEvent(null)} className="schedule__button_009">닫기</button>
                <button onClick={startEditingEvent} className="schedule__button_010"><Pencil size={15} />일정 수정</button>
                <button onClick={() => handleDeleteEvent(selectedEvent.event_id)} className="schedule__button_011"><Trash2 size={15} /> 일정 삭제</button>
              </footer>
            </div>}
          </section>
        </div>
      )}

      {isEventModalOpen && (
        <div className="schedule__group_013" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsEventModalOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="event-create-title" className="schedule__section_004">
            <header className="schedule__header_004">
              <h2 id="event-create-title" className="schedule__title_005"><CalIcon size={18} className="schedule__calicon_001" /> 새 일정 등록</h2>
              <button onClick={() => setIsEventModalOpen(false)} aria-label="등록 창 닫기" className="schedule__button_012"><X size={19} /></button>
            </header>
            <div className="schedule__group_014">
              <div className="schedule__group_022">{selectedDate}</div>
              <label className="schedule__label_008">일정 이름
                <input value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} maxLength={255} placeholder="예: 프로젝트 발표" className="schedule__input_001" />
              </label>
              <label className="schedule__label_008">유형
                <select value={eventForm.event_type} onChange={(event) => setEventForm({ ...eventForm, event_type: event.target.value })} className="schedule__input_001">
                  <option value="행사">행사</option><option value="교육/특강">교육/특강</option><option value="휴일">휴일</option><option value="공지">공지</option>
                </select>
              </label>
              <label className="schedule__label_008">상세 내용
                <textarea value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} rows={5} maxLength={2000} placeholder="장소, 준비물, 안내 사항 등을 적어주세요." className="schedule__textarea_001" />
              </label>
              <label className="schedule__label_009">
                <input type="checkbox" checked={eventForm.isCommon} onChange={(event) => setEventForm({ ...eventForm, isCommon: event.target.checked })} className="schedule__input_002" />
                모든 기수 공통 일정
              </label>
              <button onClick={handleCreateEvent} disabled={!eventForm.title.trim()} className="schedule__button_013">일정 등록</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default Schedule;
