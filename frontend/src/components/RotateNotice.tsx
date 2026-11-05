'use client';

// 휴대폰을 가로로 돌리면 "세로로 돌려 주세요" 안내 (아이폰은 웹앱 화면 방향을 고정할 수 없어서)
// 키 낮은 가로 화면(휴대폰 가로)에서만 보이고, 태블릿·PC는 그대로 쓴다
export function RotateNotice() {
  return (
    <div className="rotate-notice fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-3 bg-[#26262a] text-center text-white" role="alert">
      <span className="text-5xl" aria-hidden>
        📱↻
      </span>
      <p className="text-lg font-black">화면을 세로로 돌려 주세요</p>
      <p className="text-sm text-white/70">051 BOX는 세로 화면에 맞춰져 있어요</p>
    </div>
  );
}
