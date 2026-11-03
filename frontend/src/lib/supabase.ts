import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// 프론트는 Supabase를 로그인(Auth)과 2D 공간 실시간 연결에만 쓴다.
// 데이터 조회/저장은 모두 백엔드 API를 거친다.
export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabasePublishableKey || 'missing', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
