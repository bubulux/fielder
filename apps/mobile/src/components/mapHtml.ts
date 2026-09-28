/**
 * CSS for the Leaflet maps in WebViews (Map tab, position picker): the design system's map pins
 * and, under `html.dark`, the Set theme's tile filter. Pins keep fixed colours because they sit on
 * map tiles; markers and popups are not filtered.
 */
export const MAP_CSS = `
.pin-icon{background:none;border:0}
.pin{position:relative;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #000,0 2px 6px rgba(0,0,0,.4)}
.pin--unreviewed{background:#FFB000;color:#0B0B0C}
.pin--approved{background:#0F8A43;color:#fff}
.pin--archived{background:#6E6E76;color:#fff}
.pin--drag{width:40px;height:40px;background:#fff;color:#0B0B0C;font-size:26px;box-shadow:0 0 0 3px #0B0B0C,0 0 0 5px #fff,0 6px 14px rgba(0,0,0,.45)}
html.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.82) contrast(.92) saturate(.6)}
.leaflet-container{font-family:system-ui,Roboto,sans-serif}
.leaflet-popup-content-wrapper,.leaflet-popup-tip{background:#fff;color:#0B0B0C;border:1px solid #0B0B0C}
html.dark .leaflet-popup-content-wrapper,html.dark .leaflet-popup-tip{background:#1E1E21;color:#EDEDEA;border-color:#EDEDEA}
.leaflet-popup-content{margin:12px 14px;font-size:15px}
.t{font-weight:700;font-size:16px}
.s{color:#46464C;font-size:13px;margin-top:2px}
html.dark .s{color:#A9A9AF}
.b{display:inline-flex;align-items:center;gap:6px;margin-top:10px;min-height:44px;padding:0 16px;border-radius:8px;background:#0040D8;color:#fff!important;font-weight:700;font-size:15px;text-decoration:none}
html.dark .b{background:#6FA2FF;color:#0B0B0C!important}
.leaflet-bar a{width:44px!important;height:44px!important;line-height:44px!important;font-size:22px!important}
`;
