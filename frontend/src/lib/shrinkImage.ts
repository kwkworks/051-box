// 사진을 올리기 전에 휴대폰에서 줄인다 (긴 변 1600px, JPEG).
// 휴대폰 원본(3~5MB)이 보통 300KB 안팎이 되어 무료 저장 공간(1GB)과 전송량을 아낀다.
// 줄일 수 없거나 줄여도 커지면 원본을 그대로 돌려준다.
const MAX_SIDE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    // 사진의 회전 정보(EXIF)를 반영해서 연다
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 600 * 1024 && /jpeg|webp/i.test(file.type)) {
      bmp.close();
      return file; // 이미 충분히 작음
    }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.fillStyle = '#ffffff'; // 투명한 PNG는 흰 바탕으로
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || (blob.size >= file.size && /jpeg|png|webp/i.test(file.type))) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
