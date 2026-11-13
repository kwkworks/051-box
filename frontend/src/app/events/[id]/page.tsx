"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BoardShell } from "@/components/BoardShell";
import { EventDetailView } from "@/components/EventDetailView";
import { EventForm } from "@/components/EventForm";
import { ErrorBox, Guard, Loading } from "@/components/Guard";
import { api } from "@/lib/api";
import { EVENT_KINDS } from "@/lib/constants";
import type { EventDetail } from "@/lib/types";
import { useLoad } from "@/lib/useLoad";

export default function EventDetailPage() {
  return <Guard need="member">{() => <Detail />}</Guard>;
}

function Detail() {
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
        />
      )}
    </BoardShell>
  );
}
