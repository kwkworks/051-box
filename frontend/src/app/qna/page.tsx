'use client';

import { useState } from 'react';
import { BoardShell } from '@/components/BoardShell';
import { ErrorBox, Guard, Loading } from '@/components/Guard';
import { QnaItem } from '@/components/QnaItem';
import { api } from '@/lib/api';
import type { Me, QnaQuestion } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function QnaPage() {
  return <Guard need="member">{(me) => <Qna me={me} />}</Guard>;
}

// Q&A 문의: 회원은 내 문의만, 관리자는 모든 문의를 보고 답한다
function Qna({ me }: { me: Me }) {
  const isAdmin = me.profile.role === 'admin';
  const { data, error, loading, reload } = useLoad(() => api.get<{ questions: QnaQuestion[] }>('/qna'), 'qna');
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting'>('all');

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/qna', { title, body });
      setTitle('');
      setBody('');
      setWriting(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '문의를 남기지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  const list = (data?.questions ?? []).filter((q) => filter === 'all' || !q.answer);
  const waiting = (data?.questions ?? []).filter((q) => !q.answer).length;

  return (
    <BoardShell title="💬 Q&A 문의" subtitle={isAdmin ? '회원 문의를 확인하고 답변해요' : '관리자에게 1:1 문의 (나와 관리자만 볼 수 있어요)'}>
      {!isAdmin && !writing && (
        <button type="button" className="btn btn-dark mb-4 w-full" onClick={() => setWriting(true)}>
          + 문의 남기기
        </button>
      )}
      {writing && (
        <section className="card mb-4 flex flex-col gap-3 p-4" aria-label="문의 남기기">
          <div>
            <label className="label" htmlFor="q-title">
              제목
            </label>
            <input id="q-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="휴회 신청은 어떻게 하나요?" />
          </div>
          <div>
            <label className="label" htmlFor="q-body">
              내용
            </label>
            <textarea id="q-body" className="input min-h-28" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-xs text-muted">문의는 나와 관리자만 볼 수 있어요.</p>
          </div>
          {formError && (
            <p className="text-sm font-bold text-[var(--danger)]" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-dark flex-1" disabled={saving || !title.trim() || !body.trim()} onClick={submit}>
              {saving ? '보내는 중…' : '문의 보내기'}
            </button>
            <button type="button" className="btn" onClick={() => setWriting(false)}>
              취소
            </button>
          </div>
        </section>
      )}

      {isAdmin && (
        <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="문의 보기">
          <button type="button" className={`btn btn-sm ${filter === 'all' ? 'btn-dark' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            전체
          </button>
          <button type="button" className={`btn btn-sm ${filter === 'waiting' ? 'btn-dark' : ''}`} aria-pressed={filter === 'waiting'} onClick={() => setFilter('waiting')}>
            {`답변 대기 ${waiting}`}
          </button>
        </div>
      )}

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && list.length === 0 && (
        <p className="card p-6 text-center text-muted">
          {isAdmin ? (filter === 'waiting' ? '답변을 기다리는 문의가 없어요' : '아직 들어온 문의가 없어요') : '아직 남긴 문의가 없어요'}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {list.map((q) => (
          <QnaItem
            key={q.id}
            q={q}
            isAdmin={isAdmin}
            onDelete={async () => {
              await api.del(`/qna/${q.id}`);
              await reload();
            }}
            onAnswer={async (answer) => {
              await api.put(`/qna/${q.id}/answer`, { answer: answer?.trim() ? answer : null });
              await reload();
            }}
          />
        ))}
      </ul>
    </BoardShell>
  );
}
