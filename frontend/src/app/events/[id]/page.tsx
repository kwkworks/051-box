"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BoardShell } from "@/components/BoardShell";
import { EventComments } from "@/components/EventComments";
import { EventDetailView } from "@/components/EventDetailView";
import { EventForm } from "@/components/EventForm";
import { ErrorBox, Guard, Loading } from "@/components/Guard";
import { api } from "@/lib/api";
import { EVENT_KINDS } from "@/lib/constants";
import type { EventComment, EventDetail, Me } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

export default function EventDetailPage() {
  return <Guard need="member">{(me) => <Detail me={me} />}</Guard>;
}

function Detail({ me }: { me: Me }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(
    () => api.get<{ event: EventDetail }>(`/events/${id}`),
    id,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => Date.now());
  const ev = data?.event;

  const toggleJoin = async () => {
    if (!ev) return;
    setBusy(true);
    setActionError(null);
    try {
      if (ev.joined) await api.del(`/events/${ev.id}/join`);
      else await api.post(`/events/${ev.id}/join`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  // 마감하기 / 다시 신청 받기 (만든 사람·관리자). 이미 신청한 사람은 그대로 남고, 신청 마감일은 바뀌지 않는다
  const toggleClose = async (closeNow: boolean) => {
    if (!ev) return;
    const msg = closeNow
      ? "이 일정을 마감할까요? 이미 신청한 사람은 그대로 남고, 새로 신청할 수 없어요."
      : "다시 신청을 받을까요? 원래 신청 마감일은 그대로 적용돼요.";
    if (!confirm(msg)) return;
    setBusy(true);
    setActionError(null);
    try {
      if (closeNow) await api.post(`/events/${ev.id}/close`);
      else await api.del(`/events/${ev.id}/close`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!ev || !confirm("이 일정을 삭제할까요? 참가 신청도 함께 사라져요."))
      return;
    try {
      await api.del(`/events/${ev.id}`);
      router.replace(`/events?kind=${ev.kind}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제하지 못했어요");
    }
  };

  return (
    <BoardShell title={ev ? EVENT_KINDS[ev.kind] : "일정"} subtitle={ev?.title}>
      {loading && !ev && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {ev && editing && (
        <EventForm
          kind={ev.kind}
          initial={ev}
          onDone={() => {
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {ev && !editing && (
        <EventDetailView
          ev={ev}
          now={now}
          busy={busy}
          actionError={actionError}
          onToggleJoin={toggleJoin}
          onToggleClose={toggleClose}
          onEdit={() => setEditing(true)}
          onRemove={remove}
        >
          {ev.kind === "gathering" && <GatheringComments eventId={ev.id} me={me} />}
        </EventDetailView>
      )}
    </BoardShell>
  );
}

// 회원 모임 댓글: 불러오기, 등록, 삭제 (쓴 사람·관리자)
function GatheringComments({ eventId, me }: { eventId: string; me: Me }) {
  const { data, error: loadError, loading, reload } = useLoad(
    () => api.get<{ comments: EventComment[] }>(`/events/${eventId}/comments`),
    `comments-${eventId}`,
  );
  const [error, setError] = useState<string | null>(null);
  const send = async (body: string) => {
    setError(null);
    try {
      await api.post(`/events/${eventId}/comments`, { body });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글을 등록하지 못했어요");
      return false;
    }
  };
  const remove = async (commentId: string) => {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    setError(null);
    try {
      await api.del(`/events/${eventId}/comments/${commentId}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했어요");
    }
  };
  // 댓글을 불러오지 못하면(예: DB에 댓글 표가 아직 없을 때) 댓글 칸을 숨긴다
  if (loadError && !data) return null;
  return (
    <EventComments
      comments={data?.comments ?? []}
      myId={me.profile.id}
      isAdmin={me.profile.role === "admin"}
      loading={loading}
      error={error}
      onSend={send}
      onDelete={remove}
    />
  );
}
