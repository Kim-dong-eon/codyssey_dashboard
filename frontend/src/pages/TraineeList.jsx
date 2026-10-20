import './TraineeList.css';
import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GlobalContext } from '../context/GlobalContext';
import { teamsApi } from '../api/teams';
import { traineesApi } from '../api/trainees';
import { User, MessageSquare, X, Search, TrendingUp, Trash2, Filter, Headset, AlertTriangle, NotebookPen, Plus, Pencil, UserRoundX, UserRoundCheck } from 'lucide-react';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const TraineeList = () => {
  const { selectedCohort } = useContext(GlobalContext);
  const [searchParams] = useSearchParams();
  const [trainees, setTrainees] = useState([]);
  const [teams, setTeams] = useState([]);

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || "");
  const [teamFilter, setTeamFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");

  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [detailData, setDetailData] = useState(null);

  // ✅ 신규: 상담 기록 모달 상태 관리
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactTarget, setContactTarget] = useState(null);
  const [contactForm, setContactForm] = useState({ method: '대면', topic: '', content: '' });
  const [memoTitle, setMemoTitle] = useState('');
  const [memoContent, setMemoContent] = useState('');

  useEffect(() => {
    setSearchTerm(searchParams.get('search') || '');
  }, [searchParams]);

  useEffect(() => {
    fetchTrainees();
    fetchTeams();
  }, [selectedCohort]);

  const fetchTrainees = async () => {
    setTrainees(await traineesApi.list(selectedCohort));
  };

  const fetchTeams = async () => {
    setTeams(await teamsApi.list(selectedCohort));
  };

  const handleRowClick = async (trainee) => {
    if (selectedTrainee === trainee.id) {
      setSelectedTrainee(null);
      setDetailData(null);
      return;
    }
    setSelectedTrainee(trainee.id);
    setMemoTitle('');
    setMemoContent('');
    setDetailData(await traineesApi.getDetail(trainee.id));
  };

  const handleTeamChange = async (e) => {
    const newTeamId = e.target.value === "null" ? null : parseInt(e.target.value);
    await traineesApi.move(selectedTrainee, { to_team_id: newTeamId });
    alert("편성조가 변경되었습니다.");
    await fetchTrainees();
    setDetailData(await traineesApi.getDetail(selectedTrainee));
  };

  const handleDropToggle = async () => {
    const isDropping = !detailData.trainee.is_dropped;
    if(window.confirm(`이 학생을 ${isDropping ? '드랍(중도포기)' : '복구'} 처리하시겠습니까?`)) {
      let dropDate;
      let dropReason;
      if (isDropping) {
        const reason = window.prompt('드랍 사유를 입력하세요. (선택)');
        if (reason === null) return;
        const today = new Date();
        dropDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        dropReason = reason.trim() || null;
      }
      await traineesApi.updateDropStatus(selectedTrainee, { is_dropped: isDropping, drop_date: dropDate, drop_reason: dropReason });
      await fetchTrainees();
      setDetailData(await traineesApi.getDetail(selectedTrainee));
    }
  };

  const handleQuickDrop = async (event, trainee) => {
    event.stopPropagation();
    const isDropping = !trainee.is_dropped;
    if (!window.confirm(`${trainee.name} 교육생을 ${isDropping ? '드랍' : '복구'} 처리할까요?`)) return;
    const reason = isDropping ? window.prompt('드랍 사유를 입력하세요. (선택)') : '';
    if (reason === null) return;
    const today = new Date();
    const dropDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    try {
      await traineesApi.updateDropStatus(trainee.id, {
        is_dropped: isDropping,
        drop_date: isDropping ? dropDate : null,
        drop_reason: isDropping ? reason.trim() || null : null,
      });
      await fetchTrainees();
      if (selectedTrainee === trainee.id) setDetailData(await traineesApi.getDetail(trainee.id));
    } catch (error) {
      window.alert(error.response?.data?.detail || '드랍 상태를 변경하지 못했습니다.');
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!contactId) return alert("오류: 삭제할 기록의 고유 번호를 찾을 수 없습니다.");

    if(window.confirm("이 상담 기록을 삭제하시겠습니까?")) {
      await traineesApi.deleteContact(contactId);
      setDetailData(prev => ({
        ...prev,
        logs: prev.logs.filter(log => log.contact_id !== contactId)
      }));
    }
  };

  const handleAddMemo = async () => {
    if (!memoContent.trim()) return alert('메모 내용을 입력해주세요.');
    await traineesApi.createMemo(selectedTrainee, { title: memoTitle.trim() || null, content: memoContent.trim() });
    setMemoTitle('');
    setMemoContent('');
    setDetailData(await traineesApi.getDetail(selectedTrainee));
  };

  const handleDeleteMemo = async (memoId) => {
    if (!window.confirm('이 교육생 메모를 삭제할까요?')) return;
    await traineesApi.deleteMemo(memoId);
    setDetailData((previous) => ({
      ...previous,
      memos: (previous.memos || []).filter((memo) => memo.memo_id !== memoId),
    }));
  };

  const handleEditMemo = async (memo) => {
    const title = window.prompt('메모 제목', memo.title || '');
    if (title === null) return;
    const content = window.prompt('메모 내용', memo.content);
    if (content === null) return;
    if (!content.trim()) return alert('메모 내용을 입력해주세요.');
    await traineesApi.updateMemo(memo.memo_id, { title: title.trim() || null, content: content.trim() });
    setDetailData(await traineesApi.getDetail(selectedTrainee));
  };

  // ✅ 신규: 상담 모달 열기
  const openContactModal = (e, trainee) => {
    e.stopPropagation();
    setContactTarget(trainee);
    setContactForm({ method: '대면', topic: '', content: '' });
    setIsContactModalOpen(true);
  };

  // ✅ 신규: 상담 폼 제출 (연락 방식, 주제, 내용 모두 저장)
  const handleContactSubmit = async () => {
    if (!contactForm.topic || !contactForm.content) {
      return alert("주제와 내용을 모두 입력해주세요.");
    }

    await traineesApi.createContact(contactTarget.id, {
      contact_date: new Date().toISOString(),
      contact_method: contactForm.method,
      topic: contactForm.topic,
      content: contactForm.content,
      manager_name: "퍼실리테이터"
    });

    setIsContactModalOpen(false);
    if (selectedTrainee === contactTarget.id) setDetailData(await traineesApi.getDetail(contactTarget.id));
  };

  const filteredAndSortedTrainees = trainees
    .filter(t => {
      const query = searchTerm.trim().toLocaleLowerCase();
      const matchName = !query || `${t.name} ${t.email}`.toLocaleLowerCase().includes(query);
      let matchTeam = false;
      if (teamFilter === "all") matchTeam = true;
      else if (teamFilter === "unassigned") matchTeam = !t.team_name;
      else if (teamFilter === "tech_support") matchTeam = t.is_tech_linked === true;
      else matchTeam = t.team_name === teamFilter;

      const matchLevel = levelFilter === "all" || t.level === parseInt(levelFilter);
      return matchName && matchTeam && matchLevel;
    })
    .sort((a, b) => {
      if (a.is_dropped && !b.is_dropped) return 1;
      if (!a.is_dropped && b.is_dropped) return -1;
      return 0;
    });

  return (
    <div className="traineelist__group_001">

      {/* 왼쪽 교육생 목록 */}
      <div className="traineelist__group_002">

        <div className="traineelist__group_003">
          <div className="traineelist__group_004">
            <div className="traineelist__group_005">
              <div className="traineelist__group_006">
                <User size={20} className="traineelist__user_001" />
              </div>
              <h2 className="traineelist__title_001">교육생 전체 명부</h2>
            </div>

            <div className="traineelist__group_007">
              <Search size={16} className="traineelist__search_001" />
              <input
                type="text"
                placeholder="교육생 이름 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="traineelist__input_001"
              />
            </div>
          </div>

          <div className="traineelist__group_008">
            <Filter size={16} className="traineelist__filter_001" />
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="traineelist__select_001"
            >
              <option value="all">모든 조 보기</option>
              <option value="tech_support">🎧 기술지원 연계 인원</option>
              <option value="unassigned">미배정 인원만</option>
              <optgroup label="퍼실 전담팀">
                {teams.filter(t => t.team_id !== null).map(t => (
                  <option key={t.team_id} value={t.team_name}>{t.team_name}</option>
                ))}
              </optgroup>
            </select>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="traineelist__select_001"
            >
              <option value="all">모든 단계 보기</option>
              <option value="1">1단계 진행중</option>
              <option value="2">2단계 진행중</option>
              <option value="3">3단계 진행중</option>
            </select>

            <span className="traineelist__label_001">검색 결과: {filteredAndSortedTrainees.length}명</span>
          </div>
        </div>

        <div className="hide-scroll traineelist__group_009">
          <table className="traineelist__table_001">
            <thead className="traineelist__thead_001">
              <tr>
                <th className="traineelist__heading_001">이름</th>
                <th className="traineelist__heading_001">소속 조</th>
                <th className="traineelist__heading_001">진도 단계</th>
            <th className="traineelist__heading_002">관리</th>
              </tr>
            </thead>
            <tbody className="traineelist__tbody_001">
              {filteredAndSortedTrainees.map(t => {
                const isSelected = selectedTrainee === t.id;
                const rowStyle = t.is_dropped ? (isSelected ? 'traineelist__variant_001' : 'traineelist__variant_002') : (isSelected ? 'traineelist__variant_003' : 'traineelist__variant_004');
                const textColor = t.is_dropped ? 'traineelist__variant_005' : 'traineelist__variant_006';

                return (
                  <tr key={t.id} onClick={() => handleRowClick(t)} className={`traineelist__variant_007 ${rowStyle}`}>
                    <td className={`traineelist__variant_008 ${textColor}`}>
                      {t.name}
                      {t.requires_attention && <AlertTriangle size={14} className="traineelist__alerttriangle_001" title="위험/집중관리 인원" />}
                      {t.is_tech_linked && <Headset size={14} className="traineelist__headset_001" title="기술지원 연계됨" />}
                      {t.is_dropped && <span className="traineelist__label_002">드랍</span>}
                    </td>
                    <td className="traineelist__cell_001">
                      <span className={`traineelist__variant_009 ${t.is_dropped ? 'traineelist__variant_010' : (t.team_name ? 'traineelist__variant_011' : 'traineelist__variant_012')}`}>
                        {t.team_name || '미배정'}
                      </span>
                    </td>
                    <td className={`traineelist__variant_013 ${t.is_dropped ? 'traineelist__variant_014' : 'traineelist__variant_015'}`}>{t.level}단계</td>
                    <td className="traineelist__cell_002">
                      <div className="traineelist__group_010">
                        <button onClick={(e) => openContactModal(e, t)} className={`traineelist__variant_016 ${t.is_dropped ? 'traineelist__variant_017' : 'traineelist__variant_018'}`}><MessageSquare size={14} /> 상담</button>
                        <button onClick={(event) => handleQuickDrop(event, t)} title={t.is_dropped ? '교육생 복구' : '교육생 드랍 처리'} aria-label={`${t.name} ${t.is_dropped ? '복구' : '드랍 처리'}`} className={`traineelist__variant_019 ${t.is_dropped ? 'traineelist__variant_020' : 'traineelist__variant_021'}`}>{t.is_dropped ? <UserRoundCheck size={15} /> : <UserRoundX size={15} />}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAndSortedTrainees.length === 0 && (
                <tr>
                  <td colSpan="4" className="traineelist__cell_003">
                    <div className="traineelist__group_011">
                      <Search size={32} className="traineelist__search_002" />
                      <p>조건에 일치하는 교육생이 없습니다.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 오른쪽 사이드 패널 (상세 프로필) */}
      {selectedTrainee && detailData && (
        <div className="animate-fade-in-right traineelist__group_012">

          <div className="traineelist__group_013">
            <h3 className="traineelist__title_002">교육생 상세 프로필</h3>
            <button onClick={() => setSelectedTrainee(null)} className="traineelist__button_001"><X size={20} /></button>
          </div>

          <div className="hide-scroll traineelist__group_014">

            <div className="traineelist__group_015">
              <div
                onClick={handleDropToggle}
                className={`traineelist__variant_022 ${detailData.trainee.is_dropped ? 'traineelist__variant_023' : 'traineelist__variant_024'}`}
              >
                <span className="traineelist__label_003">드랍 상태</span>
                <div className={`traineelist__variant_025 ${detailData.trainee.is_dropped ? 'traineelist__variant_026' : 'traineelist__variant_027'}`}>
                  {detailData.trainee.is_dropped && <X size={16} className="traineelist__x_001" />}
                </div>
              </div>

              <div className="traineelist__group_016">
                <div className="traineelist__group_017">
                  <div className="traineelist__group_018"><span className="traineelist__label_004">이름</span><span className="traineelist__label_005">{detailData.trainee.name}</span></div>
                  <div className="traineelist__group_019">
                    <span className="traineelist__label_004">편성조 (변경 가능)</span>
                    <select value={detailData.trainee.team_id || "null"} onChange={handleTeamChange} className="traineelist__select_002">
                      <option value="null">미배정</option>
                      {teams.filter(t => t.team_id !== null).map(team => (
                        <option key={team.team_id} value={team.team_id}>{team.team_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="traineelist__group_017">
                  <div className="traineelist__group_018"><span className="traineelist__label_004">연락처</span><span className="traineelist__label_006">{detailData.trainee.phone || "미입력"}</span></div>
                  <div className="traineelist__group_019"><span className="traineelist__label_004">전공</span><span className="traineelist__label_006">{detailData.trainee.major}</span></div>
                </div>
                <div className="traineelist__group_017">
                  <div className="traineelist__group_018"><span className="traineelist__label_004">이메일</span><span className="traineelist__label_007" title={detailData.trainee.email}>{detailData.trainee.email}</span></div>
                  <div className="traineelist__group_019"><span className="traineelist__label_004">학력</span><span className="traineelist__label_006">{detailData.trainee.education}</span></div>
                </div>
                <div className="traineelist__group_020">
                  <div className="traineelist__group_018"><span className="traineelist__label_004">전공여부</span><span className="traineelist__label_006">{detailData.trainee.is_major}</span></div>
                  <div className="traineelist__group_019"><span className="traineelist__label_004">재직여부</span><span className="traineelist__label_006">{detailData.trainee.is_employed}</span></div>
                </div>
              </div>
            </div>

            <div className="traineelist__group_021">
              <div className="traineelist__group_022">
                <span className="traineelist__label_008">{detailData.trainee.team_name || "미배정"} <span className="traineelist__label_009">/</span> {detailData.trainee.current_level || 1}단계</span>
                <span className="traineelist__label_010">진행 과제: {detailData.trainee.personal_tasks_done || 0}개</span>
              </div>

              <h4 className="traineelist__title_003"><TrendingUp size={14} /> 날짜별 단계 · 과제 변화</h4>
              <div className="traineelist__group_023">
                {detailData.progress && detailData.progress.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={detailData.progress} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="level" stroke="var(--chart-axis)" fontSize={10} tickLine={false} axisLine={false} domain={[1, 3]} ticks={[1, 2, 3]} />
                      <YAxis yAxisId="tasks" orientation="right" stroke="var(--chart-cyan)" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                      <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''} contentStyle={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-strong)', borderRadius: '8px' }} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar yAxisId="tasks" dataKey="tasks" name="필수 과제 수" fill="var(--chart-cyan)" opacity={0.35} radius={[2, 2, 0, 0]} />
                      <Line yAxisId="level" type="stepAfter" dataKey="level" name="단계" stroke="var(--chart-blue)" strokeWidth={3} dot={{ r: 3, fill: 'var(--surface-background)', strokeWidth: 2, stroke: 'var(--chart-blue)' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="traineelist__group_024">진도 데이터가 존재하지 않습니다.</div>
                )}
              </div>
            </div>

            <div className="traineelist__group_025">
              <div className="traineelist__group_026">
                <span className="traineelist__label_011"><NotebookPen size={16} className="traineelist__notebookpen_001" /> 교육생 전담 메모</span>
                <span className="traineelist__label_012">상세 프로필에 저장</span>
              </div>
              <div className="traineelist__group_027">
                <input
                  value={memoTitle}
                  onChange={(event) => setMemoTitle(event.target.value)}
                  placeholder="메모 제목 (선택)"
                  className="traineelist__input_002"
                />
                <div className="traineelist__group_028">
                  <textarea
                    value={memoContent}
                    onChange={(event) => setMemoContent(event.target.value)}
                    placeholder="학습 상황, 상담 후속 조치, 담당자 전달 사항을 기록하세요."
                    className="traineelist__textarea_001"
                  />
                  <button onClick={handleAddMemo} className="traineelist__button_002">
                    <Plus size={14} /> 저장
                  </button>
                </div>
                <div className="traineelist__group_029">
                  {(detailData.memos || []).map((memo) => (
                    <article key={memo.memo_id} className="group traineelist__card_001">
                      <div className="traineelist__group_030">
                        <div className="traineelist__group_031">
                          <div className="traineelist__group_032">
                            <p className="traineelist__text_001">{memo.title || '전담 메모'}</p>
                            <span className="traineelist__label_013">{memo.team_name || '조 미배정'} · {memo.author}</span>
                          </div>
                          <p className="traineelist__text_002">{memo.content}</p>
                          <time className="traineelist__time_001">{new Date(memo.created_at).toLocaleString()}</time>
                        </div>
                        <div className="traineelist__group_033">
                          <button onClick={() => handleEditMemo(memo)} title="메모 수정" className="traineelist__button_003"><Pencil size={14} /></button>
                          <button onClick={() => handleDeleteMemo(memo.memo_id)} title="메모 삭제" className="traineelist__button_004"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {(!detailData.memos || detailData.memos.length === 0) && <p className="traineelist__text_003">아직 저장된 전담 메모가 없습니다.</p>}
                </div>
              </div>
            </div>

            <div className="traineelist__group_025">
              <div className="traineelist__group_034">
                <span className="traineelist__label_014"><MessageSquare size={16} className="traineelist__messagesquare_001" /> 상담 및 지원 내역</span>
                <span className="traineelist__label_015">{detailData.logs?.length || 0}건</span>
              </div>

              <div className="hide-scroll traineelist__group_035">
                <table className="traineelist__table_002">
                  <thead className="traineelist__thead_002">
                    <tr>
                      <th className="traineelist__heading_003">날짜 및 방식</th>
                      <th className="traineelist__heading_004">기록 내용</th>
                      <th className="traineelist__heading_005">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="traineelist__tbody_002">
                    {detailData.logs && detailData.logs.length > 0 ? (
                      detailData.logs.map((log) => {
                        return (
                          <tr key={log.contact_id} className="group traineelist__row_001">
                            <td className="traineelist__cell_004">
                              {new Date(log.contact_date).toLocaleDateString()}
                              {/* ✅ 연락 방식 뱃지 추가 */}
                              <div className="traineelist__group_036">
                                <span className="traineelist__label_016">
                                  {log.contact_method}
                                </span>
                              </div>
                            </td>
                            <td className="traineelist__cell_005">
                              <span className="traineelist__label_017">{log.topic}</span>
                              <span className="traineelist__label_018">{log.content}</span>
                            </td>
                            <td className="traineelist__cell_006">
                              <button onClick={() => handleDeleteContact(log.contact_id)} className="traineelist__button_005">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan="3" className="traineelist__cell_007">기록된 상담 내역이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ✅ 신규: 상담 기록 추가 모달창 */}
      {isContactModalOpen && contactTarget && (
        <div className="animate-fade-in traineelist__group_037">
          <div className="traineelist__group_038">
             <div className="traineelist__group_039">
               <h3 className="traineelist__title_004"><MessageSquare size={18} className="traineelist__messagesquare_002"/> 상담 기록 작성</h3>
               <button onClick={() => setIsContactModalOpen(false)}><X size={20} className="traineelist__x_002"/></button>
             </div>

             <div className="traineelist__group_040">
               <div>
                 <p className="traineelist__text_004">대상 학생</p>
                 <p className="traineelist__text_005">{contactTarget.name} <span className="traineelist__label_019">{contactTarget.team_name || "미배정"}</span></p>
               </div>

               <div>
                 <p className="traineelist__text_006">연락 방식 (채널)</p>
                 <select
                   value={contactForm.method}
                   onChange={(e) => setContactForm({...contactForm, method: e.target.value})}
                   className="traineelist__select_003"
                 >
                   <option value="대면">👥 대면 상담</option>
                   <option value="전화">📞 전화 통화</option>
                   <option value="슬랙/메신저">💬 슬랙 / 메신저</option>
                   <option value="온라인 화상">💻 온라인 화상회의</option>
                   <option value="기타">기타</option>
                 </select>
               </div>

               <div>
                 <p className="traineelist__text_006">상담 주제</p>
                 <input
                   type="text"
                   value={contactForm.topic}
                   onChange={(e) => setContactForm({...contactForm, topic: e.target.value})}
                   className="traineelist__input_003"
                   placeholder="예) 진도 부진 사유 파악, 프로젝트 팀장 면담 등"
                 />
               </div>

               <div>
                 <p className="traineelist__text_006">상세 내용 (메모)</p>
                 <textarea
                   value={contactForm.content}
                   onChange={(e) => setContactForm({...contactForm, content: e.target.value})}
                   className="hide-scroll traineelist__textarea_002"
                   placeholder="학생과 나눈 주요 대화 내용이나 특이사항을 기록해주세요."
                 />
               </div>

               <button onClick={handleContactSubmit} className="traineelist__button_006">
                 상담 내역 DB 저장
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TraineeList;
