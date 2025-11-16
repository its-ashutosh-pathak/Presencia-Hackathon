import React from 'react';

// This is a NAMED EXPORT (not default)
// This is why we must import it with { KccLogoSVG }
export function KccLogoSVG({ className = "", size = 64 }) {
  const w = size;
  const h = size * 1.2;
  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox="0 0 120 144"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="KCC Institute Logo"
    >
      <rect x="0.5" y="0.5" width="119" height="143" rx="8" ry="8" fill="#9B1B1B" stroke="#9B1B1B" />
      <text x="60" y="52" textAnchor="middle" fontSize="44" fontWeight="700" fill="#FFFFFF" fontFamily="Georgia, 'Times New Roman', Times, serif">KCC</text>
      <text x="60" y="74" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="#FFFFFF" fontFamily="Arial, Helvetica, sans-serif">INSTITUTE</text>
      <rect x="18" y="80" width="84" height="1.5" fill="#FFFFFF" opacity="0.7" />
      <text x="60" y="95" textAnchor="middle" fontSize="8" letterSpacing="0.8" fill="#FFFFFF" fontFamily="Arial, Helvetica, sans-serif">OF TECHNOLOGY</text>
      <text x="60" y="107" textAnchor="middle" fontSize="8" letterSpacing="0.8" fill="#FFFFFF" fontFamily="Arial, Helvetica, sans-serif">AND MANAGEMENT</text>
      <rect x="24" y="118" width="72" height="1.2" fill="#FFFFFF" opacity="0.7" />
      <text x="60" y="132" textAnchor="middle" fontSize="8" letterSpacing="1" fill="#FFFFFF" fontFamily="Arial, Helvetica, sans-serif">GREATER NOIDA</text>
    </svg>
  );
}