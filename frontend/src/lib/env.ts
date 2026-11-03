// 브라우저에 공개되어도 되는 값만 둔다 (NEXT_PUBLIC_*). 비밀키는 절대 여기에 넣지 않는다.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabasePublishableKey);
