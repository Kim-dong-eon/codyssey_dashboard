import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { GlobalContext } from '../App';
import { Search, Command, BookOpen } from 'lucide-react';

const Topbar = () => {
  const { selectedCohort, setSelectedCohort } = useContext(GlobalContext);

  const navLinkClass = ({ isActive }) =>
    `px-4 py-4 text-sm font-bold border-b-2 transition-colors ${
      isActive ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
    }`;

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-[#111722] border-b border-[#2a3441] z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        {/* 로고 영역 */}
        <div className="flex items-center gap-2 text-white font-bold text-xl">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <BookOpen size={18} className="text-white" />
          </div>
          Codyssey
        </div>

        {/* 메인 탭 */}
        <nav className="flex gap-2 h-16">
          <NavLink to="/dashboard" className={navLinkClass}>대시보드</NavLink>
          <NavLink to="/facilitator-teams" className={navLinkClass}>퍼실 전담팀</NavLink> {/* ✅ 변경 */}
          <NavLink to="/projects" className={navLinkClass}>팀플 진행 현황판</NavLink> {/* ✅ 분리 */}
          <NavLink to="/trainees" className={navLinkClass}>전체 교육생</NavLink>
          <NavLink to="/schedule" className={navLinkClass}>전체 일정</NavLink>
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {/* 통합 검색창 */}
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3 text-gray-400" />
          <input 
            type="text" 
            placeholder="교육생 검색..." 
            className="bg-[#1e293b] border border-[#334155] rounded-full py-1.5 pl-9 pr-12 text-sm text-white focus:outline-none focus:border-blue-500 w-64"
          />
          <div className="absolute right-3 flex items-center gap-1 text-gray-500 text-xs">
            <Command size={12} /> K
          </div>
        </div>

        {/* 기수 선택 글로벌 필터 */}
        <div className="flex items-center gap-2 border-l border-[#2a3441] pl-6">
          <span className="text-xs text-gray-400">조회 기준</span>
          <select 
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(Number(e.target.value))}
            className="bg-[#151b28] border border-[#2a3441] text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value={1}>AI 네이티브 1기</option>
            <option value={2}>AI 올인원 1기</option>
          </select>
        </div>
      </div>
    </header>
  );
};

export default Topbar;