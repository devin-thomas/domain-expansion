import React from 'react';

const screenshots = [
  { src: '/showcase/dashboard-mobile.png', alt: 'Domain Expansion dashboard on an iPhone-sized viewport', label: 'Dashboard', detail: 'Renewal overview' },
  { src: '/showcase/domains-mobile.png', alt: 'Domain Expansion domains list on an iPhone-sized viewport', label: 'Domains', detail: 'Search and filters' },
  { src: '/showcase/add-domain-modal.png', alt: 'Domain Expansion add domain form in a responsive modal', label: 'Add domain', detail: 'Structured entry' },
];

export const ShowcaseView: React.FC = () => (
  <div className="showcase-shell">
    <header className="showcase-nav">
      <a className="showcase-mark" href="/" aria-label="Domain Expansion home"><span className="showcase-mark-glyph">◎</span><span>Domain Expansion</span></a>
      <nav aria-label="Showcase navigation" className="showcase-links"><a href="#screens">Screens</a><a href="#system">System</a><a href="#privacy">Storage</a><a className="showcase-open" href="/">Open app <span aria-hidden="true">↗</span></a></nav>
    </header>

    <main>
      <section className="showcase-hero" aria-labelledby="showcase-title">
        <div className="hero-copy"><p className="hero-index">DOMAIN EXPANSION / SHOWCASE</p><h1 id="showcase-title">Know what<br /><span>renews next.</span></h1><p className="hero-deck">A focused domain tracker for renewal dates, costs, registrars, and intent.</p><div className="hero-actions"><a className="action-primary" href="/">Open the tracker <span aria-hidden="true">→</span></a><a className="action-text" href="#screens">See the screens</a></div></div>
        <div className="hero-preview"><div className="preview-label"><span>LIVE SURFACE</span><span>01 / 03</span></div><img src={screenshots[0].src} alt="" /><div className="preview-caption"><strong>Dashboard</strong><span>Renewal overview</span></div></div>
      </section>

      <section className="showcase-section screen-section" id="screens" aria-labelledby="screens-title"><div className="section-heading"><span className="section-number">01</span><h2 id="screens-title">The product, in view</h2><span className="section-rule" /></div><div className="screen-grid">{screenshots.map((screen, index) => <figure className={`screen-figure screen-${index + 1}`} key={screen.src}><div className="screen-image"><img src={screen.src} alt={screen.alt} loading={index === 0 ? 'eager' : 'lazy'} /></div><figcaption><span>{screen.label}</span><small>{screen.detail}</small></figcaption></figure>)}</div></section>

      <section className="showcase-section system-section" id="system" aria-labelledby="system-title"><div className="system-copy"><div className="section-heading compact"><span className="section-number">02</span><h2 id="system-title">The system stays legible</h2></div><p>Dark zinc surfaces keep the working area quiet. Indigo marks actions. Emerald, amber, and rose show the consequence of a renewal.</p><a className="action-text" href="/">Use the tracker <span aria-hidden="true">→</span></a></div><div className="swatch-board" aria-label="Domain Expansion color roles"><div className="swatch swatch-surface"><b>ZINC</b><span>working surface</span></div><div className="swatch swatch-action"><b>INDIGO</b><span>action</span></div><div className="swatch swatch-safe"><b>EMERALD</b><span>active</span></div><div className="swatch swatch-watch"><b>AMBER</b><span>attention</span></div><div className="swatch swatch-alert"><b>ROSE</b><span>urgent</span></div></div></section>

      <section className="showcase-section privacy-section" id="privacy" aria-labelledby="privacy-title"><div className="privacy-copy"><div className="section-heading compact"><span className="section-number">03</span><h2 id="privacy-title">Your data stays yours</h2></div><p>Each approved member has a private Firestore portfolio. Domain Expansion is not end-to-end encrypted: the application server can read records it stores. Google Drive is an optional, explicit backup, not the database. The showcase uses synthetic examples only.</p><a className="action-primary small" href="/">Request access <span aria-hidden="true">→</span></a></div><dl className="privacy-spec"><div><dt>STORAGE</dt><dd>Private Firestore</dd></div><div><dt>ISOLATION</dt><dd>Per account</dd></div><div><dt>ENCRYPTION</dt><dd>Server-side, not E2E</dd></div></dl></section>
    </main>
    <footer className="showcase-footer"><span>DOMAIN EXPANSION</span><span>RESPONSIVE PRODUCT SURFACES</span><div className="flex flex-wrap gap-5"><a href="/privacy">Privacy</a><a href="/">Launch app ↗</a></div></footer>
  </div>
);
