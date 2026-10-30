'use client';

import { QRCodeSVG } from 'qrcode.react';

export function QrCode({ value, size = 172 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-xl border-[1.5px] border-gold bg-white p-2">
      <QRCodeSVG value={value} size={size} level="M" fgColor="#2b1d14" bgColor="#ffffff" />
    </div>
  );
}
