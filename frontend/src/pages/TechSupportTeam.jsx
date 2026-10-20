import './TechSupportTeam.css';
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalContext } from '../context/GlobalContext';
import { dashboardApi } from '../api/dashboard';
import { traineesApi } from '../api/trainees';
import { ArrowLeft, Headset, CheckCircle2, Circle, ChevronDown, ChevronUp, User, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from 'recharts';

const TechSupportTeam = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const navigate = useNavigate();

  const [techMembers, setTechMembers] = useState([]);
  const [openLevel, setOpenLevel] = useState(null);
  const [taskFilter, setTaskFilter] = useState('all');
  const [showWarning, setShowWarning] = useState(false); // 위험 인원 필터

  useEffect(() => { fetchData(); }, [selectedCohort]);

  const fetchData = async () => {
    const data = await dashboardApi.get(selectedCohort, { roster_only: true });
    setTechMembers((data.trainees || []).filter(t => t.is_tech_linked === true));
  };

  const handleToggleStatus = async (traineeId, field, currentValue) => {
    await traineesApi.updateStatus(traineeId, { [field]: !currentValue });
    fetchData();
  };

  const levelCounts = { 1: 0, 2: 0, 3: 0 };
  techMembers.forEach(t => { if (levelCounts[t.level] !== undefined) levelCounts[t.level]++; });
  const chartData = [
    { level: '1단계', count: levelCounts[1] },
    { level: '2단계', count: levelCounts[2] },
    { level: '3단계', count: levelCounts[3] },
  ];
  const COLORS = ['var(--chart-cyan)', 'var(--chart-blue)', 'var(--chart-series-neutral)'];

  const renderAccordion = (level) => {
    let students = techMembers.filter(t => t.level === level);

    if (taskFilter === 'completed') students = students.filter(t => t.optional_task_done === 1);
    if (taskFilter === 'incomplete') students = students.filter(t => t.optional_task_done === 0);
    if (showWarning) students = students.filter(t => t.requires_attention);

    const isOpen = openLevel === level;

    return (
      <div key={level} className="techsupportteam__group_001">
        <div className="techsupportteam__group_002" onClick={() => setOpenLevel(isOpen ? null : level)}>
          <div className="techsupportteam__group_003">
            <span className={`techsupportteam__variant_001`}>
              {level}단계 진입
            </span>
            <span className="techsupportteam__label_001">{students.length}명 인원</span>
          </div>
          {isOpen ? <ChevronUp size={20} className="techsupportteam__chevronup_001" /> : <ChevronDown size={20} className="techsupportteam__chevronup_001" />}
        </div>

        {isOpen && (
          <div className="techsupportteam__group_004">
            {students.length === 0 ? (
              <p className="techsupportteam__text_001">조건에 맞는 연계 인원이 없습니다.</p>
            ) : students.map(t => {
              const pct = Math.round((t.done / t.target) * 100);
              return (
                <div key={t.id} className={`techsupportteam__variant_002 ${t.requires_attention ? 'techsupportteam__variant_003' : 'techsupportteam__variant_004'}`}>
                  <div className="techsupportteam__group_005">
                    <div className="techsupportteam__group_006">
                      <User size={16} className="techsupportteam__user_001"/>
                      <span className="techsupportteam__label_002">{t.name}</span>
                      {t.requires_attention && <AlertTriangle size={14} className="techsupportteam__alerttriangle_001" />}
                    </div>
                    {/* 원소속 팀 표시 */}
                    <span className="techsupportteam__label_003">
                      원소속: {t.team}
                    </span>
                  </div>

                  <div className="techsupportteam__group_007">
                    <div className="techsupportteam__group_008">
                      <div className={`techsupportteam__variant_005 ${pct >= 100 ? 'techsupportteam__variant_006' : 'techsupportteam__variant_007'}`} style={{ '--progress-width': `${Math.min(pct, 100)}%` }}></div>
                    </div>
                    <span className={`techsupportteam__variant_008 ${pct >= 100 ? 'techsupportteam__variant_009' : 'techsupportteam__variant_010'}`}>{pct}%</span>
                  </div>

                  <div className="techsupportteam__group_009">
                    {t.optional_task_done === 1 ? <CheckCircle2 size={16} className="techsupportteam__checkcircle2_001" /> : <Circle size={16} className="techsupportteam__circle_001" />}

                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id, 'requires_attention', t.requires_attention); }}
                      className={`techsupportteam__variant_011 ${t.requires_attention ? 'techsupportteam__variant_012' : 'techsupportteam__variant_013'}`}
                      title="위험 인원 표시"
                    >
                      <AlertTriangle size={14} />
                    </button>

                    {/* ✅ 연계 해제 버튼 (누르면 즉시 이 보드에서 사라지고 원소속팀에만 남음) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if(window.confirm(`${t.name} 학생을 연계 명단에서 해제하시겠습니까? (원소속은 유지됩니다)`)) {
                          handleToggleStatus(t.id, 'is_tech_linked', t.is_tech_linked);
                        }
                      }}
                      className={`techsupportteam__variant_014`}
                    >
                      <Headset size={14} /> 연계 해제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="techsupportteam__group_010">

      {/* 헤더 */}
      <div className="techsupportteam__group_011">
        <button onClick={() => navigate(-1)} className="techsupportteam__button_001">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="techsupportteam__title_001">
            <Headset size={24} /> 학습지원 연계팀 (통합 보드)
          </h2>
          <p className="techsupportteam__text_002">각 퍼실팀에서 지원 요청이 접수된 중복 연계 명단입니다.</p>
        </div>
      </div>

      <div className="techsupportteam__group_012">

        {/* 중앙: 대시보드형 아코디언 */}
        <div className="hide-scroll techsupportteam__group_013">

          <div className="techsupportteam__group_014">
            <div className="techsupportteam__group_015">
              <button onClick={() => setTaskFilter('all')} className={`techsupportteam__variant_015 ${taskFilter === 'all' ? 'techsupportteam__variant_016' : 'techsupportteam__variant_017'}`}>전체 보기</button>
              <button onClick={() => setTaskFilter('completed')} className={`techsupportteam__variant_018 ${taskFilter === 'completed' ? 'techsupportteam__variant_019' : 'techsupportteam__variant_017'}`}><CheckCircle2 size={14} /> 선택과제 완료</button>
              <button onClick={() => setTaskFilter('incomplete')} className={`techsupportteam__variant_018 ${taskFilter === 'incomplete' ? 'techsupportteam__variant_020' : 'techsupportteam__variant_017'}`}><Circle size={14} /> 미완료</button>
            </div>
            <div className="techsupportteam__group_015">
              <button onClick={() => setShowWarning(!showWarning)} className={`techsupportteam__variant_018 ${showWarning ? 'techsupportteam__variant_021' : 'techsupportteam__variant_017'}`}><AlertTriangle size={14} /> 위험 인원</button>
            </div>
          </div>

          <section>
            {[3, 2, 1].map(renderAccordion)}
          </section>
        </div>

        {/* 우측: 통계 차트 */}
        <div className="techsupportteam__group_016">
          <section className="techsupportteam__section_001">
            <h2 className="techsupportteam__title_002">
              <Headset size={18} className="techsupportteam__headset_001"/> 학습지원 연계 인원 분포
            </h2>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="level" stroke="var(--chart-axis)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-strong)', borderRadius: '8px' }} cursor={{ fill: 'var(--surface-muted)' }} />
                <Bar dataKey="count" name="인원(명)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" fill="var(--chart-axis)" fontSize={12} formatter={(val) => val > 0 ? `${val}명` : ''} />
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>

      </div>
    </div>
  );
};

export default TechSupportTeam;
