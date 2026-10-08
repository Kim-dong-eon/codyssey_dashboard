import React, { useState, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import FacilitatorTeams from './pages/FacilitatorTeams'; // ✅ 새 파일 1
import TeamProjects from './pages/TeamProjects'; // ✅ 새 파일 2
import TraineeList from './pages/TraineeList';
import Schedule from './pages/Schedule';
import TeamDetail from './pages/TeamDetail'; // ✅ 임포트 추가
import TechSupportTeam from './pages/TechSupportTeam';


export const GlobalContext = createContext();

const Layout = () => (
  <div className="min-h-screen bg-[#0b111e] text-gray-200 font-sans">
    <Topbar />
    <main className="pt-16 h-screen overflow-y-auto"><Outlet /></main>
  </div>
);

function App() {
  const [selectedCohort, setSelectedCohort] = useState(1);
  return (
    <GlobalContext.Provider value={{ selectedCohort, setSelectedCohort }}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="facilitator-teams" element={<FacilitatorTeams />} /> {/* ✅ 분리 */}
            <Route path="/facilitator-teams/:teamId" element={<TeamDetail />} /> {/* ✅ 신규 라우트 추가 */}
            <Route path="projects" element={<TeamProjects />} /> {/* ✅ 분리 */}
            <Route path="/tech-support" element={<TechSupportTeam />} />
            <Route path="trainees" element={<TraineeList />} />
            <Route path="schedule" element={<Schedule />} />
          </Route>
        </Routes>
      </Router>
    </GlobalContext.Provider>
  );
}
export default App;