'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function message(e: unknown) {
  return e instanceof Error ? e.message : '불러오지 못했어요';
}

// 서버 데이터 불러오기 + 로딩/에러 상태. key가 바뀌면 다시 불러온다.
export function useLoad<T>(loader: () => Promise<T>, key: string) {
  const loaderRef = useRef(loader);
  const keyRef = useRef(key);
  useEffect(() => {
    loaderRef.current = loader;
    keyRef.current = key;
  });

  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    loaderRef.current().then(
      (data) => alive && setState({ key, data, error: null }),
      (e) => alive && setState((prev) => ({ key, data: prev.data, error: message(e) })),
    );
    return () => {
      alive = false;
    };
  }, [key]);

  // 버튼 등에서 호출: 기존 데이터를 유지한 채 새로 불러온다
  const reload = useCallback(async () => {
    try {
      const data = await loaderRef.current();
      setState({ key: keyRef.current, data, error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, key: keyRef.current, error: message(e) }));
    }
  }, []);

  const loading = state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading, reload };
}
