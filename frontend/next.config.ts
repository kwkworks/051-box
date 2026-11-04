import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const supabaseWs = supabaseUrl.replace(/^https:/, "wss:");

// 이 사이트가 접속할 수 있는 곳을 제한한다 (XSS가 생겨도 다른 서버로 데이터를 보내기 어렵게)
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseUrl}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} ${apiUrl}${isDev ? " ws://localhost:*" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// 배포마다 바뀌는 버전 번호 (Vercel이 넣어주는 커밋 번호). 열려 있는 화면이 새 버전을 알아채는 데 쓴다
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 12);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), autoplay=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
