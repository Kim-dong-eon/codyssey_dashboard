import './App.css';
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GlobalContext } from './context/GlobalContext';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const FacilitatorTeams = lazy(() => import('./pages/FacilitatorTeams'));
const TeamProjects = lazy(() => import('./pages/TeamProjects'));
const TraineeList = lazy(() => import('./pages/TraineeList'));
const Schedule = lazy(() => import('./pages/Schedule'));
const TeamDetail = lazy(() => import('./pages/TeamDetail'));
const TechSupportTeam = lazy(() => import('./pages/TechSupportTeam.jsx'));
const TeamMemos = lazy(() => import('./pages/TeamMemos'));

function App() {
  const [selectedCohort, setSelectedCohort] = useState(1);
  return (
    <GlobalContext.Provider value={{ selectedCohort, setSelectedCohort }}>
      <BrowserRouter>
        <Suspense fallback={<div className="app__loading">화면을 불러오는 중...</div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/facilitator-teams" element={<FacilitatorTeams />} />
              <Route path="/facilitator-teams/:teamId" element={<TeamDetail />} />
              <Route path="/team-memos" element={<TeamMemos />} />
              <Route path="/projects" element={<TeamProjects />} />
              <Route path="/tech-support" element={<TechSupportTeam />} />
              <Route path="/trainees" element={<TraineeList />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GlobalContext.Provider>
  );
}
export default App;
