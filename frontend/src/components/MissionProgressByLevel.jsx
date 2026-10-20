import './MissionProgressByLevel.css';
import React, { useMemo, useState } from 'react';

const STAGES = [
  { level: 1, label: '1단계', tint: 'missionprogressbylevel__variant_001' },
  { level: 2, label: '2단계', tint: 'missionprogressbylevel__variant_002' },
  { level: 3, label: 'Final', tint: 'missionprogressbylevel__variant_003' },
];

const MissionRows = ({ rows, eligibleTrainees, type }) => {
  const eligibleIds = new Set(eligibleTrainees.map((trainee) => Number(trainee.id)));
  const labels = [...new Set(rows
    .filter((row) => row.mission_type === type && row.mission_label)
    .map((row) => row.mission_label))]
    .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));

  if (!labels.length) return <p className="missionprogressbylevel__text_001">크롤링된 미션이 없습니다.</p>;

  return (
    <div className="missionprogressbylevel__group_001">
      {labels.map((label) => {
        const completedIds = new Set(rows
          .filter((row) => row.mission_type === type && row.mission_label === label && row.is_completed && eligibleIds.has(Number(row.trainee_id)))
          .map((row) => Number(row.trainee_id)));
        const completed = completedIds.size;
        const total = eligibleTrainees.length;
        const percent = total ? Math.round((completed / total) * 100) : 0;
        return (
          <div key={`${type}-${label}`} className="missionprogressbylevel__group_002">
            <div className="missionprogressbylevel__group_003">
              <span className="missionprogressbylevel__label_001">{label}</span>
              <span className="missionprogressbylevel__label_002">{completed} / {total}명 완료</span>
            </div>
            <div className="missionprogressbylevel__group_004" role="img" aria-label={`${label} ${completed}/${total}명 완료`}>
              <div className={`missionprogressbylevel__variant_004 ${type === 'team' ? 'missionprogressbylevel__variant_005' : 'missionprogressbylevel__variant_006'}`} style={{ '--progress-width': `${percent}%` }} />
            </div>
            <p className="missionprogressbylevel__text_002">미완료 {Math.max(0, total - completed)}명 · 완료율 {percent}%</p>
          </div>
        );
      })}
    </div>
  );
};

const MissionProgressByLevel = ({ trainees = [], missionRows = [], title = '단계별 미션 진행 현황' }) => {
  const activeTrainees = useMemo(() => trainees.filter((trainee) => !trainee.is_dropped), [trainees]);
  const [targetMode, setTargetMode] = useState('stage');

  return (
    <section className="missionprogressbylevel__section_001">
      <header className="missionprogressbylevel__header_001">
        <h2 className="missionprogressbylevel__title_001">{title}</h2>
        <div className="missionprogressbylevel__group_005">
          <p className="missionprogressbylevel__text_003">전체 인원 또는 해당 단계 대상 인원을 기준으로 미션 완료율을 봅니다.</p>
          <div className="missionprogressbylevel__group_006" role="group" aria-label="미션 대상 인원 기준">
            <button onClick={() => setTargetMode('stage')} aria-pressed={targetMode === 'stage'} className={`missionprogressbylevel__variant_007 ${targetMode === 'stage' ? 'missionprogressbylevel__variant_008' : 'missionprogressbylevel__variant_009'}`}>단계별 대상</button>
            <button onClick={() => setTargetMode('all')} aria-pressed={targetMode === 'all'} className={`missionprogressbylevel__variant_007 ${targetMode === 'all' ? 'missionprogressbylevel__variant_008' : 'missionprogressbylevel__variant_009'}`}>전체 인원</button>
          </div>
        </div>
      </header>
      <div className="missionprogressbylevel__group_007">
        {STAGES.map((stage) => {
          const stageEligibleTrainees = activeTrainees.filter((trainee) => Number(trainee.level || 1) === stage.level);
          const eligibleTrainees = targetMode === 'all' ? activeTrainees : stageEligibleTrainees;
          const stageRows = missionRows.filter((row) => Number(row.level) === stage.level);
          return (
            <article key={stage.level} className={`missionprogressbylevel__variant_010 ${stage.tint} missionprogressbylevel__variant_011`}>
              <header className="missionprogressbylevel__header_002">
                <h3 className="missionprogressbylevel__title_002">{stage.label}</h3>
                <span className="missionprogressbylevel__label_003">대상 {eligibleTrainees.length}명</span>
              </header>
              <div className="missionprogressbylevel__group_008">
                <section className="missionprogressbylevel__section_002">
                  <h4 className="missionprogressbylevel__title_003">개인 미션 · 완료 인원</h4>
                  <MissionRows rows={stageRows} eligibleTrainees={eligibleTrainees} type="personal" />
                </section>
                <section className="missionprogressbylevel__section_003">
                  <h4 className="missionprogressbylevel__title_004">팀 미션 · 완료 인원</h4>
                  <MissionRows rows={stageRows} eligibleTrainees={eligibleTrainees} type="team" />
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default MissionProgressByLevel;
