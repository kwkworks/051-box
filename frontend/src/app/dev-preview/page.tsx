import { notFound } from 'next/navigation';
import { DevPreview } from './DevPreview';

// 로컬 개발에서만 열리는 화면 미리보기 (배포 환경에서는 404)
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevPreview />;
}
