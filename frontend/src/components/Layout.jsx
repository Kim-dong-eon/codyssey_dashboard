// src/components/Layout.jsx
import React, { useContext } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { GlobalContext } from '../App';

const Layout = () => {
  const { selectedCohort, setSelectedCohort } = useContext(GlobalContext);

  const handleCohortChange = (e) => {
    const value = e.target.value;
    if (value === 'new') {
      alert('새 기수 추가 모달 띄우기');
      // TODO: 새 기수 생성 로직 연동
    } else {
      setSelectedCohort(Number(value));
    }
  };

  return (
    <div className="min-h-screen bg-[#0b111e] text-white font-sans flex flex-col">
      
      {/* GNB (상단 고정 영역) */}
      <header className="border-b border-[#2a3441] bg-[#0b111e] px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        
        {/* 1. 좌측: 로고 및 통합 검색창 (Quick Search) */}
        <div className="flex items-center gap-4 w-1/3">
          <div className="bg-white text-blue-600 font-bold px-3 py-1.5 rounded-lg text-sm shadow-sm cursor-pointer">
            <span className="text-yellow-500">▲</span> Codyssey
          </div>
          <div className="relative w-64">
            <input 
              type="text" 
              placeholder="교육생 검색..." 
              className="w-full bg-[#151b28] border border-[#2a3441] rounded-lg py-1.5 pl-3 pr-10 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            <div className="absolute right-2 top-1.5 text-[10px] font-bold text-gray-500 border border-gray-600 rounded px-1.5 py-0.5">
              Ctrl K
            </div>
          </div>
        </div>

        {/* 2. 중앙: 기수 선택기 (글로벌 필터) */}
        <div className="flex justify-center w-1/3">
          <select 
            value={selectedCohort} 
            onChange={handleCohortChange}
            className="bg-[#1e293b] border border-[#334155] text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
          >
            <option value={1}>AI 네이티브 1기</option>
            <option value={2}>AI 네이티브 2기</option>
            <option value="new" className="text-blue-400 font-bold">+ 새 기수 추가</option>
          </select>
        </div>

        {/* 3. 우측: 메인 탭 (1 Depth) */}
        <nav className="flex justify-end gap-2 w-1/3">
          {[
            { name: '대시보드', path: '/dashboard' },
            { name: '조별/팀플 관리', path: '/teams' },
            { name: '전체 교육생', path: '/trainees' },
            { name: '전체 일정', path: '/schedule' },
          ].map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) => 
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-[#1e293b] border border-[#334155] text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* 메인 렌더링 영역 (App.jsx에 정의된 라우터 컴포넌트가 이 위치에 들어옵니다) */}
      <main className="flex-grow">
        <Outlet />
      </main>

    </div>
  );
};

export default Layout;