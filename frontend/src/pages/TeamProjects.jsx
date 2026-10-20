import './TeamProjects.css';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { GlobalContext } from '../context/GlobalContext';
import { teamsApi } from '../api/teams';
import {
  CalendarClock, CheckCircle2, Clock3, Filter, MessageSquareText, NotebookPen,
  PlayCircle, Search, Trash2, Users, X,
} from 'lucide-react';

const formatDate = (value, withTime = true) => {
  if (!value) return '갱신일 미기록';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '갱신일 미기록';
  return date.toLocaleString('ko-KR', withTime
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const phaseLabel = (level = '') => {
  const value = String(level).toLowerCase();
  if (value.startsWith('1-')) return '1단계';
  if (value.startsWith('2-')) return '2단계';
  if (value.includes('final') || value.startsWith('3-')) return 'Final';
  return '프로젝트';
};

const statusPresentation = (status = '') => {
  if (status.includes('완료')) return { tone: 'emerald', Icon: CheckCircle2 };
  if (status.includes('시작') || status.includes('진행')) return { tone: 'blue', Icon: PlayCircle };
  if (status.includes('대기') || status.includes('셋팅')) return { tone: 'amber', Icon: Clock3 };
  return { tone: 'slate', Icon: Clock3 };
};

const TeamProjects = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [teamData, setTeamData] = useState([]);
  const [boardMemos, setBoardMemos] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [memoDraft, setMemoDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMemos = async () => {
    try {
      setBoardMemos(await teamsApi.listBoardMemos(selectedCohort));
    } catch (reason) {
      setError(reason.response?.data?.detail || '현황판 메모를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSelectedProject(null);
    Promise.allSettled([teamsApi.listProjects(selectedCohort), teamsApi.listBoardMemos(selectedCohort)])
      .then(([projectsResult, memosResult]) => {
        if (!active) return;
        if (projectsResult.status === 'fulfilled') setTeamData(projectsResult.value || []);
        else setError(projectsResult.reason.response?.data?.detail || '팀 프로젝트 현황을 불러오지 못했습니다.');
        if (memosResult.status === 'fulfilled') setBoardMemos(memosResult.value || []);
        else setError(memosResult.reason.response?.data?.detail || '현황판 메모를 불러오지 못했습니다.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedCohort]);

  const projects = useMemo(() => teamData.flatMap((team) => Object.entries(team.projects || {}).map(([levelStr, project]) => ({
    team_id: team.team_id,
    team_name: team.team_name || '미배정 팀',
    levelStr,
    ...project,
  }))), [teamData]);

  const latestUpdate = projects
    .filter((project) => project.status_changed_date)
    .map((project) => project.status_changed_date)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const visibleStageGroups = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    const filtered = projects.filter((project) => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'waiting' && (project.status || '').includes('대기'))
        || (statusFilter === 'progress' && ((project.status || '').includes('시작') || (project.status || '').includes('진행')))
        || (statusFilter === 'completed' && (project.status || '').includes('완료'));
      const matchesQuery = !query || `${project.team_name} ${project.levelStr} ${project.member_names || ''}`.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
    const stages = ['1단계', '2단계', 'Final'].map((label) => ({
      label,
      projects: filtered.filter((project) => phaseLabel(project.levelStr) === label).sort((a, b) => {
        const aDate = a.status_changed_date ? new Date(a.status_changed_date).getTime() : 0;
        const bDate = b.status_changed_date ? new Date(b.status_changed_date).getTime() : 0;
        return bDate - aDate || String(a.team_name).localeCompare(String(b.team_name), 'ko', { numeric: true });
      }),
    }));
    return stages;
  }, [projects, searchTerm, statusFilter]);

  const handleSaveMemo = async () => {
    if (!memoDraft.trim()) return;
    try {
      await teamsApi.createBoardMemo(selectedCohort, { content: memoDraft.trim() });
      setMemoDraft('');
      await fetchMemos();
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '현황판 메모를 저장하지 못했습니다.');
    }
  };

  const handleDeleteMemo = async (memoId) => {
    if (!window.confirm('현황판 메모를 삭제할까요?')) return;
    try {
      await teamsApi.deleteBoardMemo(selectedCohort, memoId);
      setBoardMemos((previous) => previous.filter((memo) => memo.memo_id !== memoId));
    } catch (reason) {
      window.alert(reason.response?.data?.detail || '현황판 메모를 삭제하지 못했습니다.');
    }
  };

  const filters = [
    { id: 'all', label: '전체', Icon: Filter },
    { id: 'waiting', label: '대기', Icon: Clock3 },
    { id: 'progress', label: '진행 중', Icon: PlayCircle },
    { id: 'completed', label: '완료', Icon: CheckCircle2 },
  ];

  return (
    <main className="teamprojects__main_001">
      <header className="teamprojects__header_001">
        <div className="teamprojects__group_001">
          <div className="teamprojects__group_002"><Users size={22} className="teamprojects__users_001" /></div>
          <div><h1 className="teamprojects__title_001">팀 프로젝트 현황판</h1><p className="teamprojects__text_001">최근 확인된 팀이 위에 오며, 각 팀의 갱신일과 세부 내용을 볼 수 있습니다.</p></div>
        </div>
        <div className="teamprojects__group_003">
          <div className="teamprojects__group_004"><span className="teamprojects__label_001">팀</span><strong className="teamprojects__strong_001">{teamData.length}</strong></div>
          <div className="teamprojects__group_004"><span className="teamprojects__label_001">프로젝트</span><strong className="teamprojects__strong_001">{projects.length}</strong></div>
          <div className="teamprojects__group_004"><span className="teamprojects__label_001">최근 갱신</span><strong className="teamprojects__strong_002">{formatDate(latestUpdate, false)}</strong></div>
        </div>
      </header>

      <div className="teamprojects__group_005">
        <label className="teamprojects__label_002">
          <Search size={16} className="teamprojects__search_001" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="팀, 단계, 참여자 검색" className="teamprojects__input_001" />
        </label>
        <div className="teamprojects__group_006">
          {filters.map(({ id, label, Icon }) => <button key={id} onClick={() => setStatusFilter(id)} className={`teamprojects__variant_001 ${statusFilter === id ? 'teamprojects__variant_002' : 'teamprojects__variant_003'}`}><Icon size={13} />{label}</button>)}
        </div>
      </div>

      {error && <div role="alert" className="teamprojects__group_007">{error}</div>}

      <div className="teamprojects__group_008">
        <section className="teamprojects__section_001">
          {loading ? <p className="teamprojects__text_002">현황을 불러오는 중...</p> : (
            <div className="teamprojects__group_009">
              {visibleStageGroups.map((stage) => (
                <article key={stage.label} className="teamprojects__card_001">
                  <header className="teamprojects__header_002">
                    <div><h2 className="teamprojects__title_002">{stage.label} 프로젝트</h2><p className="teamprojects__text_003">팀 프로젝트별 상태와 최근 확인</p></div>
                    <span className="teamprojects__label_003">{stage.projects.length}팀</span>
                  </header>
                  <div className="teamprojects__group_010">
                    {stage.projects.map((project) => {
                      const { tone, Icon } = statusPresentation(project.status || '');
                      const toneClasses = {
                        emerald: 'teamprojects__variant_004',
                        blue: 'teamprojects__variant_005',
                        amber: 'teamprojects__variant_006',
                        slate: 'teamprojects__variant_007',
                      }[tone];
                      return <button key={project.project_id || `${project.team_id}-${project.levelStr}`} onClick={() => setSelectedProject(project)} className="teamprojects__button_001">
                        <div className="teamprojects__group_011"><div className="teamprojects__group_012"><p className="teamprojects__text_004">{project.team_name}</p><p className="teamprojects__text_003">{project.levelStr}</p></div><span className={`teamprojects__variant_008 ${toneClasses}`}><Icon size={12} />{project.status || '상태 없음'}</span></div>
                        <div className="teamprojects__group_013"><span className="teamprojects__label_004">{project.member_names || '명단 미등록'}</span><span className="teamprojects__label_005">{formatDate(project.status_changed_date)}</span></div>
                      </button>;
                    })}
                    {!stage.projects.length && <div className="teamprojects__group_014">조건에 맞는 프로젝트가 없습니다.</div>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="teamprojects__aside_001">
          <header className="teamprojects__header_003">
            <div className="teamprojects__group_015"><h2 className="teamprojects__title_003"><MessageSquareText size={17} className="teamprojects__messagesquaretext_001" /> 현황판 메모</h2><span className="teamprojects__label_006">{boardMemos.length}</span></div>
            <p className="teamprojects__text_005">팀이나 프로젝트 하나에 묶이지 않는 이 페이지 전용 메모입니다.</p>
          </header>
          <div className="teamprojects__group_016">
            <textarea value={memoDraft} onChange={(event) => setMemoDraft(event.target.value)} rows={3} maxLength={1000} placeholder="전체 프로젝트 관련 메모나 확인할 내용을 적어주세요." className="teamprojects__textarea_001" />
            <div className="teamprojects__group_017"><span className="teamprojects__label_007">{memoDraft.length}/1000</span><button onClick={handleSaveMemo} disabled={!memoDraft.trim()} className="teamprojects__button_002"><NotebookPen size={14} /> 메모 저장</button></div>
          </div>
          <div className="teamprojects__group_018">
            {boardMemos.map((memo) => <article key={memo.memo_id} className="group teamprojects__card_002"><div className="teamprojects__group_011"><p className="teamprojects__text_006">{memo.content}</p><button onClick={() => handleDeleteMemo(memo.memo_id)} aria-label="메모 삭제" title="메모 삭제" className="teamprojects__button_003"><Trash2 size={14} /></button></div><div className="teamprojects__group_019"><span>{memo.author || '퍼실리테이터'}</span><time>{formatDate(memo.created_at)}</time></div></article>)}
            {!boardMemos.length && <div className="teamprojects__group_020">아직 현황판 메모가 없습니다.<br />위 입력란에서 페이지 공통 메모를 작성하세요.</div>}
          </div>
        </aside>
      </div>

      {selectedProject && (
        <div className="teamprojects__group_021" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProject(null); }}>
          <aside role="dialog" aria-modal="true" aria-label={`${selectedProject.team_name} 프로젝트 상세`} className="teamprojects__aside_002">
            <header className="teamprojects__header_004">
              <div><p className="teamprojects__text_007">{selectedProject.team_name} · {selectedProject.levelStr}</p><h2 className="teamprojects__title_004">프로젝트 상세</h2></div>
              <button onClick={() => setSelectedProject(null)} aria-label="상세 닫기" className="teamprojects__button_004"><X size={18} /></button>
            </header>
            <div className="teamprojects__group_022">
              <section className="teamprojects__section_002">
                <div className="teamprojects__group_023"><div><p className="teamprojects__text_008">현재 상태</p><p className="teamprojects__text_009">{selectedProject.status || '상태 없음'}</p></div><span className="teamprojects__label_008"><Users size={20} /></span></div>
                <div className="teamprojects__group_024"><div className="teamprojects__group_025"><p className="teamprojects__text_010">팀</p><p className="teamprojects__text_011">{selectedProject.team_name}</p></div><div className="teamprojects__group_025"><p className="teamprojects__text_010">단계</p><p className="teamprojects__text_011">{phaseLabel(selectedProject.levelStr)} · {selectedProject.levelStr}</p></div></div>
              </section>
              <section className="teamprojects__section_002">
                <h3 className="teamprojects__title_005"><CalendarClock size={16} className="teamprojects__calendarclock_001" /> 최근 크롤링 확인</h3>
                <p className="teamprojects__text_012">{formatDate(selectedProject.status_changed_date)}</p>
                <p className="teamprojects__text_003">크롤러가 이 팀 프로젝트의 상태와 명단을 마지막으로 확인한 시각입니다.</p>
              </section>
              <section className="teamprojects__section_002">
                <div className="teamprojects__group_026"><h3 className="teamprojects__title_005"><Users size={16} className="teamprojects__users_002" /> 참여 명단</h3><span className="teamprojects__label_009">팀 프로젝트 정보</span></div>
                <p className="teamprojects__text_013">{selectedProject.member_names || '명단 미등록'}</p>
              </section>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
};

export default TeamProjects;
