import React from 'react';

const Header = ({ onSync, isSyncing }) => {
  return (
    <header style={{ borderBottom: '1px solid var(--border-color)', padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ backgroundColor: 'white', color: 'var(--accent-blue)', fontWeight: 'bold', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.875rem' }}>
          <span style={{ color: '#eab308' }}>▲</span> Codyssey
        </div>
        <div>
          <p style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: '600', letterSpacing: '0.05em', margin: 0 }}>CODYSSEY GYEONGNAM • PROGRESS HUB</p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0 0 0' }}>학습 진도 대시보드</h1>
        </div>
      </div>
      
      <button 
        onClick={onSync} 
        disabled={isSyncing}
        style={{
          backgroundColor: isSyncing ? '#1e3a8a' : 'var(--accent-blue)',
          color: isSyncing ? '#d1d5db' : 'white',
          fontWeight: '600',
          padding: '0.5rem 1.5rem',
          borderRadius: '0.5rem',
          border: 'none',
          cursor: isSyncing ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        {isSyncing ? '동기화 진행 중...' : '데이터 동기화'}
      </button>
    </header>
  );
};

export default Header;