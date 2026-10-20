import './Layout.css';
// src/components/Layout.jsx
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';

export default function Layout() {
  return (
    <div className="layout__shell">
      <Topbar />
      <main className="layout__content">
        <Outlet />
      </main>
    </div>
  );
}
