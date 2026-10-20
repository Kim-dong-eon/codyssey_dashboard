import './Topbar.css';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { GlobalContext } from '../context/GlobalContext';
import { cohortsApi } from '../api/cohorts';
import { traineesApi } from '../api/trainees';
import { Search, Command, BookOpen, Sun, Moon } from 'lucide-react';

const formatCohortDate = (value) => value ? value.replaceAll('-', '.') : '미설정';
const isDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const cohortErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join('\n') || fallback;
  return fallback;
};

const Topbar = () => {
  const { selectedCohort, setSelectedCohort } = useContext(GlobalContext);
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const [cohorts, setCohorts] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fcfcfc' : '#192635');
    localStorage.setItem('codyssey-theme', theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    cohortsApi.list()
      .then((items) => {
        if (!active) return;
        setCohorts(items);
        if (items.length && !items.some((cohort) => cohort.cohort_id === selectedCohort)) {
          setSelectedCohort(items[0].cohort_id);
        }
      })
      .catch((error) => console.error('기수 목록을 불러오지 못했습니다.', error));
    return () => { active = false; };
  }, [setSelectedCohort]);

  useEffect(() => {
    if (!selectedCohort) return;
    let active = true;
    traineesApi.list(selectedCohort)
      .then((items) => { if (active) setTrainees(items); })
      .catch((error) => console.error('교육생 목록을 불러오지 못했습니다.', error));
    return () => { active = false; };
  }, [selectedCohort]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (event.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const matchingTrainees = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    if (!query) return [];
    return trainees
      .filter((trainee) => `${trainee.name} ${trainee.email}`.toLocaleLowerCase().includes(query))
      .slice(0, 6);
  }, [searchTerm, trainees]);
  const selectedCohortInfo = cohorts.find((cohort) => cohort.cohort_id === selectedCohort);

  const goToSearch = (value = searchTerm) => {
    const query = value.trim();
    if (!query) return;
    navigate(`/trainees?search=${encodeURIComponent(query)}`);
    setSearchTerm(query);
    setIsSearchOpen(false);
  };

  const handleCohortChange = async (event) => {
    const selectElement = event.currentTarget;
    const value = event.target.value;
    if (value === '__create__') {
      const cohortName = window.prompt('새 기수 이름을 입력하세요.');
      if (!cohortName?.trim()) {
        selectElement.value = String(selectedCohort);
        return;
      }
      const endDate = window.prompt('이 기수의 기한을 입력하세요. (YYYY-MM-DD)');
      if (endDate === null) {
        selectElement.value = String(selectedCohort);
        return;
      }
      if (!isDateInput(endDate.trim())) {
        window.alert('기한을 YYYY-MM-DD 형식으로 입력해주세요.');
        selectElement.value = String(selectedCohort);
        return;
      }
      try {
        const cohort = await cohortsApi.create({ cohort_name: cohortName.trim(), end_date: endDate.trim() });
        const updatedCohorts = await cohortsApi.list();
        setCohorts(updatedCohorts);
        setSelectedCohort(cohort.cohort_id);
      } catch (error) {
        selectElement.value = String(selectedCohort);
        window.alert(cohortErrorMessage(error, '기수를 만들지 못했습니다.'));
      }
      return;
    }
    setSelectedCohort(Number(value));
  };

  const handleDeadlineEdit = async () => {
    if (!selectedCohortInfo) return;
    const answer = window.prompt(
      `${selectedCohortInfo.cohort_name} 기한을 입력하세요. (YYYY-MM-DD)`,
      selectedCohortInfo.end_date || ''
    );
    if (answer === null) return;
    const endDate = answer.trim();
    if (!isDateInput(endDate)) {
      window.alert('기한을 YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }
    if (selectedCohortInfo.start_date && endDate < selectedCohortInfo.start_date) {
      window.alert('기한은 시작일보다 빠를 수 없습니다.');
      return;
    }
    try {
      const updated = await cohortsApi.updateDeadline(selectedCohortInfo.cohort_id, endDate);
      setCohorts((items) => items.map((cohort) =>
        cohort.cohort_id === updated.cohort_id ? updated : cohort
      ));
    } catch (error) {
      window.alert(cohortErrorMessage(error, '기한을 수정하지 못했습니다.'));
    }
  };

  const navLinkClass = ({ isActive }) =>
    `topbar__nav_link ${
      isActive ? 'topbar__nav_link_active' : 'topbar__nav_link_inactive'
    }`;

  return (
    <header className="topbar__shell">
      <div className="topbar__main">
        {/* 로고 영역 */}
        <div className="topbar__brand">
          <div className="topbar__brand_mark">
            <BookOpen size={18} className="topbar__strong_text" />
          </div>
          Codyssey
        </div>

        {/* 메인 탭 */}
        <nav className="topbar__navigation">
          <NavLink to="/dashboard" end className={navLinkClass}>대시보드</NavLink>
          <NavLink to="/facilitator-teams" className={navLinkClass}>퍼실 전담팀</NavLink>
          <NavLink to="/team-memos" className={navLinkClass}>팀 메모</NavLink>
          <NavLink to="/projects" className={navLinkClass}>팀플 진행 현황판</NavLink>
          <NavLink to="/trainees" className={navLinkClass}>전체 교육생</NavLink>
          <NavLink to="/schedule" className={navLinkClass}>전체 일정</NavLink>
        </nav>
      </div>

      <div className="topbar__actions">
        {/* 통합 검색창 */}
        <form className="topbar__search_form" onSubmit={(event) => { event.preventDefault(); goToSearch(); }}>
          <Search size={16} className="topbar__search_icon" />
          <input 
            type="text" 
            placeholder="교육생 검색..." 
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={() => setIsSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setIsSearchOpen(false), 120)}
            className="topbar__search_input"
          />
          <div className="topbar__search_shortcut">
            <Command size={12} /> K
          </div>
          {isSearchOpen && searchTerm.trim() && (
            <div className="topbar__search_results">
              {matchingTrainees.length ? matchingTrainees.map((trainee) => (
                <button
                  key={trainee.id}
                  type="button"
                  onMouseDown={() => goToSearch(trainee.name)}
                  className="topbar__search_result"
                >
                  <span className="topbar__strong_text">{trainee.name}</span>
                  <span className="topbar__muted_label">{trainee.team_name || '미배정'}</span>
                </button>
              )) : (
                <button type="submit" className="topbar__search_submit">
                  “{searchTerm}” 검색 결과 보기
                </button>
              )}
            </div>
          )}
        </form>

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          className="topbar__theme_toggle"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? '라이트' : '다크'}
        </button>

        {/* 기수 선택 글로벌 필터 */}
        <div className="topbar__cohort_control">
          <div className="topbar__cohort_metadata">
            <span className="topbar__muted_label">조회 기준</span>
            <button
              type="button"
              className="topbar__cohort_deadline"
              onClick={handleDeadlineEdit}
              disabled={!selectedCohortInfo}
              title={selectedCohortInfo?.start_date
                ? `시작 ${formatCohortDate(selectedCohortInfo.start_date)} · 기한 수정`
                : '기한 수정'}
            >
              기한 {formatCohortDate(selectedCohortInfo?.end_date)}
            </button>
          </div>
          <select 
            value={cohorts.some((cohort) => cohort.cohort_id === selectedCohort) ? selectedCohort : ''}
            onChange={handleCohortChange}
            className="topbar__cohort_select"
          >
            <option value="" disabled>{cohorts.length ? '기수 선택' : '기수를 추가하세요'}</option>
            {cohorts.map((cohort) => (
              <option key={cohort.cohort_id} value={cohort.cohort_id}>{cohort.cohort_name}</option>
            ))}
            <option value="__create__" className="topbar__new_cohort">+ 새 기수 추가</option>
          </select>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
