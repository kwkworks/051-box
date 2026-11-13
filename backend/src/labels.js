// 알림·카페 글에 쓰는 종목 이름 (프론트 lib/constants.ts와 같은 이름)
export const LABELS = {
  back_squat: '백스쿼트', front_squat: '프론트스쿼트', overhead_squat: '오버헤드스쿼트', deadlift: '데드리프트',
  clean: '클린', power_clean: '파워클린', clean_and_jerk: '클린앤저크', snatch: '스내치', power_snatch: '파워스내치',
  push_press: '푸시프레스', strict_press: '스트릭트프레스', bench_press: '벤치프레스', thruster: '쓰러스터',
  fran: 'Fran', grace: 'Grace', isabel: 'Isabel', helen: 'Helen', diane: 'Diane', elizabeth: 'Elizabeth', annie: 'Annie',
  jackie: 'Jackie', karen: 'Karen', nancy: 'Nancy', kelly: 'Kelly', amanda: 'Amanda', murph: 'Murph', dt: 'DT', jt: 'JT',
};

// 강도: 70 → "70%", [60, 65] → "60~65%"
export const percentText = (p) => (Array.isArray(p) ? `${p[0]}~${p[1]}%` : `${p}%`);
