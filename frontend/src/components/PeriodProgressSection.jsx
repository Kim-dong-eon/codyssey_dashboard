import './PeriodProgressSection.css';
import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi } from '../api/dashboard';

const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const initialRange = () => {
  const today = new Date();
  const offset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset - 7);
  return { start_date: dateValue(monday), end_date: dateValue(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
};

const PeriodProgressSection = ({ cohortId, teamId, title = '기간별 진도 현황' }) => {
  const [range, setRange] = useState(initialRange);
  const [rangeDraft, setRangeDraft] = useState(initialRange);
  const [chartData, setChartData] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [historyMode, setHistoryMode] = useState('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    dashboardApi.get(cohortId, { ...range, ...(teamId ? { team_id: teamId } : {}) })
      .then((data) => {
        if (!active) return;
        setChartData(data.chartData || []);
        setHistoryAvailable(Boolean(data.historyAvailable));
        setHistoryMode(data.historyMode || 'none');
      })
      .catch((reason) => {
        if (active) setError(reason.response?.data?.detail || '기간별 진도 현황을 불러오지 못했습니다.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cohortId, teamId, range]);

  const firstPoint = chartData[0];
  const lastPoint = chartData[chartData.length - 1];
  const cards = [
    { key: 'level1', label: '1단계', unit: '명', color: 'periodprogresssection__variant_001' },
    { key: 'level2', label: '2단계', unit: '명', color: 'periodprogresssection__variant_002' },
    { key: 'level3', label: 'Final', unit: '명', color: 'periodprogresssection__variant_003' },
    { key: 'completed', label: '수료', unit: '명', color: 'periodprogresssection__variant_004' },
    { key: 'tasksDone', label: '필수 과제 완료', unit: '건', color: 'periodprogresssection__variant_005' },
    { key: 'dropped', label: '드랍 누계', unit: '명', color: 'periodprogresssection__variant_006' },
  ];

  const applyPreset = (preset) => {
    const today = new Date();
    let nextRange;
    if (preset === 'lastWeek') nextRange = initialRange();
    else if (preset === 'month') nextRange = { start_date: dateValue(new Date(today.getFullYear(), today.getMonth(), 1)), end_date: dateValue(today) };
    else nextRange = { start_date: dateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), end_date: dateValue(today) };
    setRangeDraft(nextRange);
    setRange(nextRange);
  };

  return (
    <section className="periodprogresssection__section_001">
      <div className="periodprogresssection__group_001">
        <div>
          <h2 className="periodprogresssection__title_001"><CalendarDays size={18} className="periodprogresssection__calendardays_001" />{title}</h2>
          <p className="periodprogresssection__text_001">선택한 기간의 단계·수료·미션 변화를 비교합니다.</p>
        </div>
        <div className="periodprogresssection__group_002">
          <button onClick={() => applyPreset('lastWeek')} className="periodprogresssection__button_001">지난주</button>
          <button onClick={() => applyPreset('7days')} className="periodprogresssection__button_001">최근 7일</button>
          <button onClick={() => applyPreset('month')} className="periodprogresssection__button_001">이번 달</button>
          <input type="date" value={rangeDraft.start_date} onChange={(event) => setRangeDraft({ ...rangeDraft, start_date: event.target.value })} className="periodprogresssection__input_001" aria-label="조회 시작일" />
          <span className="periodprogresssection__label_001">부터</span>
          <input type="date" value={rangeDraft.end_date} onChange={(event) => setRangeDraft({ ...rangeDraft, end_date: event.target.value })} className="periodprogresssection__input_001" aria-label="조회 종료일" />
          <button onClick={() => {
            if (!rangeDraft.start_date || !rangeDraft.end_date || rangeDraft.start_date > rangeDraft.end_date) return window.alert('시작일과 종료일을 확인해주세요.');
            setRange({ ...rangeDraft });
          }} className="periodprogresssection__button_002">조회</button>
        </div>
      </div>
      {error && <p role="alert" className="periodprogresssection__text_002">{error}</p>}
      <div className="periodprogresssection__group_003">
        {cards.map((card) => {
          const startValue = firstPoint?.[card.key] ?? 0;
          const endValue = lastPoint?.[card.key] ?? 0;
          const change = endValue - startValue;
          return <div key={card.key} className="periodprogresssection__group_004"><p className={`periodprogresssection__variant_007 ${card.color}`}>{card.label}</p><div className="periodprogresssection__group_005"><span className="periodprogresssection__label_002">{endValue}<span className="periodprogresssection__label_003">{card.unit}</span></span><span className={`periodprogresssection__variant_007 ${change > 0 ? 'periodprogresssection__variant_004' : change < 0 ? 'periodprogresssection__variant_006' : 'periodprogresssection__variant_008'}`}>{change > 0 ? '+' : ''}{change}{card.unit}</span></div><p className="periodprogresssection__text_003">시작 {startValue}{card.unit} → 종료 {endValue}{card.unit}</p></div>;
        })}
      </div>
      {!historyAvailable && <div className="periodprogresssection__group_006">선택 기간에 반영할 완료 날짜 기록이 없습니다.</div>}
      {historyMode === 'legacy_logs' && <div className="periodprogresssection__group_007">미션별 완료 날짜가 없는 기간은 기존 단계 기록으로 표시합니다.</div>}
      <div className="periodprogresssection__group_008" aria-busy={loading}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis yAxisId="count" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''} contentStyle={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-strong)', color: 'var(--text-strong)', borderRadius: '8px' }} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <Line yAxisId="count" type="monotone" dataKey="level1" name="1단계 인원" stroke="var(--chart-series-neutral)" strokeWidth={2} dot={false} />
            <Line yAxisId="count" type="monotone" dataKey="level2" name="2단계 인원" stroke="var(--chart-blue)" strokeWidth={3} dot={{ r: 3 }} />
            <Line yAxisId="count" type="monotone" dataKey="level3" name="Final 인원" stroke="var(--chart-purple)" strokeWidth={3} dot={{ r: 3 }} />
            <Line yAxisId="count" type="monotone" dataKey="completed" name="수료 인원" stroke="var(--chart-green)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default PeriodProgressSection;
