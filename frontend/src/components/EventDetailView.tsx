"use client";

import { AvatarView } from "./AvatarView";
import { formatDateTime, safeHttpsUrl } from "@/lib/format";
import type { EventDetail } from "@/lib/types";

// 일정 상세 화면 (보이는 부분만). 페이지와 개발용 미리보기가 함께 쓴다
export function EventDetailView({
  ev,
  now,
  busy,
  actionError,
  onToggleJoin,
  onToggleClose,
  onEdit,
  onRemove,
}: {
  ev: EventDetail;
  now: number;
  busy: boolean;
  actionError: string | null;
  onToggleJoin: () => void;
  onToggleClose: (closeNow: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  // 만든 사람·관리자가 마감했거나(closed_at), 신청 마감일이 지났으면 마감
  const manuallyClosed = Boolean(ev.closed_at);
  const deadlinePassed = ev.signup_deadline
    ? new Date(ev.signup_deadline).getTime() < now
    : false;
  const closed = manuallyClosed || deadlinePassed;
  // 시작 후 12시간이 지나면 지난 일정 (목록 기준과 같음)
  const ended = new Date(ev.starts_at).getTime() < now - 12 * 3600 * 1000;
  const full = ev.capacity !== null && ev.participants.length >= ev.capacity;
  const link = safeHttpsUrl(ev.link_url);

  return (
    <>
      <article className="card p-4">
        <h2 className="text-xl font-black">{ev.title}</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-bold text-muted">일시</dt>
          <dd>{formatDateTime(ev.starts_at)}</dd>
          {ev.location && (
            <>
              <dt className="font-bold text-muted">장소</dt>
              <dd>{ev.location}</dd>
            </>
          )}
          {ev.signup_deadline && (
            <>
              <dt className="font-bold text-muted">신청 마감</dt>
              <dd>
                {formatDateTime(ev.signup_deadline)}
                {deadlinePassed && " (마감됨)"}
              </dd>
            </>
          )}
          {manuallyClosed && (
            <>
              <dt className="font-bold text-muted">상태</dt>
              <dd className="font-bold text-[var(--danger)]">🔒 마감됨</dd>
            </>
          )}
          <dt className="font-bold text-muted">인원</dt>
          <dd>
            {ev.participants.length}
            {ev.capacity ? ` / ${ev.capacity}명` : "명"}
          </dd>
          {ev.creator && (
            <>
              <dt className="font-bold text-muted">등록</dt>
              <dd>{ev.creator.nickname}</dd>
            </>
          )}
        </dl>
        {ev.description && (
          <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {ev.description}
          </p>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="btn btn-sm mt-4"
          >
            관련 링크 열기 ↗
          </a>
        )}
      </article>

      {actionError && (
        <p className="mt-3 text-sm font-bold text-[var(--danger)]" role="alert">
          {actionError}
        </p>
      )}
      <button
        type="button"
        className={`btn mt-4 h-12 w-full ${ev.joined ? "" : "btn-primary"}`}
        disabled={busy || ended || (!ev.joined && (closed || full))}
        onClick={onToggleJoin}
      >
        {busy
          ? "처리 중…"
          : ended
            ? ev.joined
              ? "✓ 참가했던 일정이에요"
              : "지난 일정이에요"
            : ev.joined
              ? "참가 취소"
              : closed
                ? "신청 마감"
                : full
                  ? "정원이 가득 찼어요"
                  : "🙋 참가하기"}
      </button>
      {/* 참가하기 바로 아래: 만든 사람·관리자만 보이는 마감하기 / 다시 신청 받기 */}
      {ev.can_manage && !ended && (
        <button
          type="button"
          className={`btn mt-2 h-11 w-full ${manuallyClosed ? "" : "btn-dark"}`}
          disabled={busy}
          onClick={() => onToggleClose(!manuallyClosed)}
        >
          {manuallyClosed ? "🔓 다시 신청 받기" : "🔒 마감하기"}
        </button>
      )}

      <section className="mt-6">
        <h3 className="mb-2 font-black">참가자 {ev.participants.length}명</h3>
        {ev.participants.length === 0 ? (
          <p className="card p-4 text-sm text-muted">첫 번째로 참가해보세요!</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {ev.participants.map((p, i) => (
              <li
                key={p.user_id}
                className="card flex flex-col items-center p-2 text-center"
              >
                <AvatarView avatar={p.avatar} scale={1.5} />
                <span className="mt-1 w-full truncate text-xs font-bold">
                  {i + 1}. {p.nickname}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ev.can_manage && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-dark" onClick={onEdit}>
            ✏️ 내용 수정
          </button>
          <button type="button" className="btn btn-danger" onClick={onRemove}>
            일정 삭제
          </button>
        </div>
      )}
    </>
  );
}
