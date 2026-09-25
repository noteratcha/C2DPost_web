import React from 'react';
import './GoogleMapEmbed.css';

/**
 * GoogleMapEmbed.jsx — Real Thailand map via a free Google Maps iframe embed
 * (no API key). Use `queryText` to control what Google geocodes + pins:
 * pass ONLY the province name (e.g. "จังหวัดกรุงเทพมหานคร") so the map shows
 * a single province-level pin — no street viewpoint and no "สถานที่แนะนำ"
 * nearby-places card. `locationText` is just the caption shown below the map.
 */
export default function GoogleMapEmbed({ locationText, queryText, statusLabel }) {
  const querySource = (queryText && String(queryText).trim()) ||
    (locationText && String(locationText).trim());

  const hasLocation = Boolean(querySource);

  let src = '';
  if (hasLocation) {
    // Province-only query keeps the pin at province level and avoids the
    // street "แนะนำ" panel that appears when querying a full address.
    src = `https://www.google.com/maps?q=${encodeURIComponent(querySource)}&z=7&output=embed`;
  }

  return (
    <div className="gm-embed-wrapper">
      <div className="gm-embed-header">
        <span className="gm-embed-title">📍 แผนที่ Google — จังหวัดปลายทาง</span>
        {statusLabel && <span className="gm-embed-status-tag">{statusLabel}</span>}
      </div>

      <div className="gm-embed-frame-wrap">
        {hasLocation ? (
          <iframe
            className="gm-embed-frame"
            title="Google Maps — จังหวัดปลายทาง"
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        ) : (
          <div className="gm-embed-idle">
            <span className="gm-embed-idle-text">ไม่พบข้อมูลตำแหน่งปลายทาง</span>
          </div>
        )}
      </div>

      {hasLocation && (
        <div className="gm-embed-location-text" title={String(locationText || '')}>
          {locationText}
        </div>
      )}
    </div>
  );
}
