import { useState, useEffect } from 'react'
import './index.css'

const GITHUB_URL = 'https://github.com/arcsight-ai/anchr'

// Stroke version: line-art A + anchor. Works on any background.
function AnchrLogoStroke({ style }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 38" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <circle cx="16" cy="6.5" r="3" fill="none" />
      <path d="M13 9.5 L9.5 17.5 L22.5 17.5 L19 9.5 M16 17.5 L16 26 L9.5 34 M16 26 L22.5 34" />
    </svg>
  )
}

// Filled version: one solid shape (A + ring + flukes). Stronger at small sizes; single mark.
function AnchrLogoFilled({ style }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 38" fill="currentColor" fillRule="evenodd" aria-hidden="true" style={style}>
      <path d="M9.5 35 L9.5 17.5 L13 9.5 A 3 3 0 0 1 19 9.5 L22.5 17.5 L22.5 35 L16 29 Z M9.5 17.5 L22.5 17.5 L16 9.5 Z" />
    </svg>
  )
}

// Default: filled for impact at small sizes; use AnchrLogoStroke for line-art.
function AnchrLogo({ style, variant = 'filled' }) {
  return variant === 'stroke' ? <AnchrLogoStroke style={style} /> : <AnchrLogoFilled style={style} />
}
const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`
const DOCS_URL = `${GITHUB_URL}#readme`
const ISSUES_URL = `${GITHUB_URL}/issues`

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e) => { if (e.key === 'Escape') closeMenu() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  return (
    <nav
      className={menuOpen ? 'nav-open' : ''}
      style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '14px 0'
      }}
    >
      <div className="container nav-container">
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1.2rem', color: 'var(--text)' }}>
          <AnchrLogo style={{ width: 28, height: 33, flexShrink: 0 }} />
          ANCHR
        </a>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="nav-links"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="nav-toggle-bar" aria-hidden />
          <span className="nav-toggle-bar" aria-hidden />
          <span className="nav-toggle-bar" aria-hidden />
        </button>
        <div id="nav-links" className="nav-links" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" onClick={closeMenu} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Docs</a>
          <a href="#install" onClick={closeMenu} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Install</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" onClick={closeMenu} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>GitHub</a>
          <a href="#install" className="btn btn-primary" onClick={closeMenu}>Add ANCHR to my repo</a>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <header className="section hero-section">
      <div className="container">
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 32,
          alignItems: 'flex-start',
        }}>
          <div className="hero-sub" style={{ flex: '1 1 380px', minWidth: 0 }}>
            <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              AI writes. ANCHR decides if it merges.
            </p>
            <h1 style={{ marginBottom: 14, lineHeight: 1.2 }}>
              Architectural authority at merge time.
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: 520, marginBottom: 24, lineHeight: 1.5 }}>
              Blocks structural violations before merge and shows the exact fix.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <a href="#install" className="btn btn-primary">Add ANCHR to my repo</a>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">View on GitHub</a>
            </div>
          </div>
          <figure className="hero-figure" style={{
            flex: '1 1 380px',
            minWidth: 280,
            margin: 0,
          }}>
            <img
              src="/hero-comment.svg"
              alt="What ANCHR posts on a violating PR: architectural drift detected, suggested structural correction, copy-paste fix."
              width={1200}
              height={600}
              fetchPriority="high"
              decoding="async"
              style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)' }}
            />
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              Blocks the merge and shows the exact structural correction — including a copy-paste fix in the comment.
            </figcaption>
          </figure>
        </div>
      </div>
    </header>
  )
}

function OneDecisionSection() {
  return (
    <section className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2 className="section-title">One decision per PR.</h2>
        <div className="check-mock">
          <div className="check-mock-title">ANCHR Check</div>
          <div className="check-mock-row">Status: <span className="check-mock-status">[BLOCKED]</span></div>
          <div className="check-mock-row">Reason: boundary violation</div>
          <div className="check-mock-row check-mock-cut">Minimal cut: packages/api → packages/internal</div>
        </div>
        <p style={{ marginTop: 20, color: 'var(--text-secondary)', fontSize: 15 }}>
          No config. No dashboards. No scoring. One decision.
        </p>
        <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 14 }}>
          BLOCKED = no structural violation passed the gate. Fix shown in comment. Re-push.
        </p>
        <p style={{ marginTop: 24 }}>
          <a href="#install" className="btn btn-primary">Add ANCHR to my repo</a>
        </p>
      </div>
    </section>
  )
}

function OneProductSection() {
  return (
    <section className="section one-loop-section">
      <div className="container" style={{ textAlign: 'center', maxWidth: 640 }}>
        <h2 className="section-title">One product. One loop. One promise.</h2>
        <p style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{'PR opened  →  ANCHR runs  →  VERIFIED ✓  or  BLOCKED ✗'}</p>
        <p style={{ margin: '12px 0 0', fontSize: '1rem', color: 'var(--text-muted)' }}>If BLOCKED → copy-paste fix → re-push → merge passes.</p>
      </div>
    </section>
  )
}

function DeterminismSection() {
  return (
    <section className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <p className="mechanism-line">Graph → Cut → Decide.</p>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 560, margin: 0 }}>
          Same input → same output. Enforcement at merge time.
        </p>
      </div>
    </section>
  )
}

function WhatItCatches() {
  const items = [
    { title: 'Boundary violations', desc: 'Cross-package imports into another package\'s internal modules.' },
    { title: 'Deleted public API', desc: 'Removing files reachable from a public entrypoint.' },
    { title: 'Escaping boundaries', desc: 'Relative imports that escape package boundaries.' },
  ]
  return (
    <section id="what" className="section">
      <div className="container">
        <h2 className="section-title">What it catches</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Prevents structural drift before it lands. One comment. Clear evidence. Copy-paste corrections when blocked.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {items.map((item, i) => (
            <div key={i} className="card">
              <h3>{item.title}</h3>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2 className="section-title">How it works</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 640, marginBottom: 16 }}>
          On every PR, it builds the dependency graph, detects structural violations (cycles, cross-package imports, deleted public APIs), and makes one decision: VERIFIED or BLOCKED. If blocked, it shows the exact structural correction in the PR comment.
        </p>
        <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', maxWidth: 640 }}>
          <li style={{ marginBottom: 12 }}>Add the workflow (one YAML file).</li>
          <li style={{ marginBottom: 12 }}>Require the ANCHR check in branch protection.</li>
        </ol>
      </div>
    </section>
  )
}

function ScopeContract() {
  return (
    <section id="scope" className="section">
      <div className="container">
        <h2 className="section-title">Scope is a feature</h2>
        <div className="card" style={{ maxWidth: 640 }}>
          <p style={{ margin: 0 }}>
            Built for TypeScript monorepos (<code className="mono">packages/&lt;name&gt;/src</code>). Other layouts are out of scope by design. Deterministic.
          </p>
        </div>
      </div>
    </section>
  )
}

const WORKFLOW_YAML = `name: ANCHR
on: pull_request
jobs:
  ANCHR:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx anchr@1 gate`

const CLI_CMD = 'npx anchr@1 gate'

function Install() {
  const [installTab, setInstallTab] = useState('workflow')
  const [copyFeedback, setCopyFeedback] = useState(null) // 'workflow' | 'cli' | null
  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(WORKFLOW_YAML).then(() => {
      setCopyFeedback('workflow')
      setTimeout(() => setCopyFeedback(null), 2000)
    })
  }
  const handleCopyCli = () => {
    navigator.clipboard.writeText(CLI_CMD).then(() => {
      setCopyFeedback('cli')
      setTimeout(() => setCopyFeedback(null), 2000)
    })
  }
  return (
    <section id="install" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2 className="section-title">Install (under 60 seconds)</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Add one workflow. Require the ANCHR check.
        </p>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 15 }}>
          One workflow file. One required check.
        </p>
        <div className="install-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setInstallTab('workflow')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--border)',
              background: installTab === 'workflow' ? 'var(--surface-hover)' : 'transparent',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Workflow
          </button>
          <button
            type="button"
            onClick={() => setInstallTab('cli')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--border)',
              background: installTab === 'cli' ? 'var(--surface-hover)' : 'transparent',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Local run
          </button>
        </div>
        {installTab === 'workflow' && (
          <>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>.github/workflows/anchr.yml</p>
                <button
                  type="button"
                  onClick={handleCopyWorkflow}
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: '8px 14px' }}
                  aria-label={copyFeedback === 'workflow' ? 'Copied to clipboard' : 'Copy workflow YAML to clipboard'}
                >
                  {copyFeedback === 'workflow' ? 'Copied!' : 'Copy workflow'}
                </button>
              </div>
              <pre style={{
                background: 'var(--bg)', padding: 16, borderRadius: 8, overflow: 'auto',
                fontSize: 13, fontFamily: 'JetBrains Mono', margin: 0, border: '1px solid var(--border)'
              }}>
{WORKFLOW_YAML}
              </pre>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 16 }}>
              Require the <strong>ANCHR</strong> check in branch protection.
            </p>
            <figure style={{ margin: '20px 0 0', maxWidth: 560 }}>
              <img src="/screenshot-branch-protection-anchr.png" alt="Branch protection: ANCHR required. Merge only when VERIFIED." width={2528} height={1696} loading="lazy" decoding="async" style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)' }} />
              <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Require ANCHR before merge</figcaption>
            </figure>
          </>
        )}
        {installTab === 'cli' && (
          <>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Terminal</p>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: '8px 14px' }}
                  aria-label={copyFeedback === 'cli' ? 'Copied to clipboard' : 'Copy npx command to clipboard'}
                >
                  {copyFeedback === 'cli' ? 'Copied!' : 'Copy command'}
                </button>
              </div>
              <pre style={{
                background: 'var(--bg)', padding: 16, borderRadius: 8, overflow: 'auto',
                fontSize: 13, fontFamily: 'JetBrains Mono', margin: 0, border: '1px solid var(--border)'
              }}>
{CLI_CMD}
              </pre>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 16 }}>
              Run from repo root. Same decision as CI.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              For local audits/diffs: <code className="mono">npx anchr@1 audit --base &lt;base&gt; --head &lt;head&gt;</code>
            </p>
          </>
        )}
      </div>
    </section>
  )
}

// Demo: in-repo folder (always works). When you have standalone arcsight-ai/anchr-demo-monorepo, set to https://github.com/arcsight-ai/anchr-demo-monorepo and set the two PR URLs below so VERIFIED/BLOCKED links appear.
const DEMO_REPO_URL = 'https://github.com/arcsight-ai/anchr/tree/main/anchr-demo-monorepo'
const DEMO_VERIFIED_PR_URL = '#' // e.g. https://github.com/arcsight-ai/anchr-demo-monorepo/pull/1 when standalone repo + PR exist
const DEMO_BLOCKED_PR_URL = '#' // e.g. https://github.com/arcsight-ai/anchr-demo-monorepo/pull/2 when standalone repo + PR exist

function Demo() {
  return (
    <section id="demo" className="section">
      <div className="container">
        <h2 className="section-title">Demo</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          See ANCHR block structural drift and show the fix in real time.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          When BLOCKED: minimal cut, suggested structural correction, and a copy-paste snippet in the comment.
        </p>
        <ul style={{ color: 'var(--text-secondary)', marginBottom: 20, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong style={{ color: 'var(--text)' }}>VERIFIED</strong> — PR that respects boundaries.</li>
          <li><strong style={{ color: 'var(--danger)' }}>BLOCKED</strong> — Boundary violation (cross-package internal import).</li>
          <li><strong style={{ color: 'var(--danger)' }}>BLOCKED</strong> — Circular dependency.</li>
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 28 }}>
          <a href={DEMO_REPO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Open anchr-demo-monorepo</a>
          {DEMO_VERIFIED_PR_URL !== '#' && (
            <>
              <a href={DEMO_VERIFIED_PR_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>VERIFIED PR</a>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
            </>
          )}
          {DEMO_BLOCKED_PR_URL !== '#' && (
            <a href={DEMO_BLOCKED_PR_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>BLOCKED PR</a>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginTop: 8, alignItems: 'stretch' }}>
          <figure className="demo-card-cell" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/hero-comment.svg" alt="ANCHR PR comment: Architectural drift detected. Merge blocked. Minimal cut and suggested structural correction." width={1200} height={600} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>BLOCKED — Architectural drift detected. Minimal cut and fix.</figcaption>
          </figure>
          <figure className="demo-card-cell" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-verified-green.png" alt="ANCHR check VERIFIED — no architectural drift. Green check." width={3584} height={1184} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>VERIFIED — No architectural drift.</figcaption>
          </figure>
          <figure className="demo-card-cell" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-branch-protection-anchr.png" alt="Branch protection: ANCHR required. Merge only when VERIFIED." width={2528} height={1696} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>Branch protection — ANCHR required.</figcaption>
          </figure>
          <figure className="demo-card-cell" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-suggested-fix.png" alt="Suggested structural correction: copy-paste fix in the PR comment." width={800} height={280} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>Suggested fix — copy-paste in the comment.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}

// FAQ: Pre-answers the top DevHunt objections (first impression + hostile thread). Canon phrasing from docs.
const FAQ_ITEMS = [
  {
    q: 'What does VERIFIED vs BLOCKED mean?',
    a: 'VERIFIED: no violations. BLOCKED: violation found (cross-package internal import, deleted public API, or cycle). One decision per PR, minimal cut as evidence. Same input → same output.',
  },
  {
    q: 'How is ANCHR different from ESLint?',
    a: 'ESLint flags syntax rules locally. ANCHR enforces architectural integrity at merge time in CI.',
  },
  {
    q: 'How is ANCHR different from dependency-cruiser?',
    a: 'dependency-cruiser: reports you interpret. ANCHR: one merge-time decision, minimal cut, GitHub Check that gates. Decide and enforce.',
  },
  {
    q: 'Why only packages/<name>/src?',
    a: 'One layout: packages/<name>/src. No heuristics. Same repo → same result. Opinionated for determinism.',
  },
  {
    q: 'How do I add ANCHR to my repo?',
    a: 'Add .github/workflows/anchr.yml (see Install above), commit, open a PR. After first run, require ANCHR in branch protection.',
  },
  {
    q: 'Does it block merges?',
    a: 'Only if you require it. BLOCKED fails the check; VERIFIED passes. You choose advisory or enforced.',
  },
  {
    q: "Won't this slow teams down? / Is it too strict?",
    a: 'Strict by intent. ANCHR blocks violations at merge time — cheapest to fix. One decision: merge or fix.',
  },
  {
    q: 'Why not Nx or Turborepo?',
    a: 'Nx and Turborepo: ecosystem-bound. ANCHR: build-agnostic, any repo with the layout. No framework lock-in.',
  },
  {
    q: "How do I know it's not full of false positives?",
    a: 'Same input → same output. One layout, no guessing. Out-of-scope → VERIFIED by contract. In scope → minimal cut is evidence.',
  },
  {
    q: 'Do I need to install dependencies or a build system?',
    a: 'No. npx anchr@1 gate in CI. No Nx, Turborepo, or extra installs.',
  },
  {
    q: 'Is it a linter or AI?',
    a: 'Linters check syntax. ANCHR enforces architecture in CI. One decision per PR. No AI.',
  },
]

function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <section id="faq" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2 className="section-title">FAQ</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Frequently asked questions about how ANCHR enforces architecture in your CI. ANCHR is no analysis dashboard — it doesn&apos;t score, rate, or visualize. It decides.
        </p>
        <div className="faq-accordion">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i
            return (
              <div
                key={i}
                className="faq-item"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  marginBottom: 8,
                  overflow: 'hidden',
                  background: 'var(--surface)',
                }}
              >
                <button
                  type="button"
                  className="faq-trigger"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-question-${i}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '16px 20px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '1rem',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{item.q}</span>
                  <span
                    style={{
                      flexShrink: 0,
                      color: 'var(--text-muted)',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>
                <div
                  id={`faq-answer-${i}`}
                  role="region"
                  aria-labelledby={`faq-question-${i}`}
                  style={{
                    display: isOpen ? 'block' : 'none',
                    padding: '0 20px 16px',
                  }}
                >
                  <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {item.a}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="section" style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
      <div className="container" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', color: 'inherit' }} aria-label="ANCHR home">
          <AnchrLogo style={{ width: 24, height: 28, flexShrink: 0, opacity: 0.9 }} />
        </a>
        <div>
          <a href="#install" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px' }}>Add ANCHR to my repo</a>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>One workflow file. One required check.</p>
        </div>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Issues</a>
        <span>Open source · </span>
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">MIT</a>
        <span>Move at AI speed. Keep architectural control.</span>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Nav />
      <main id="main-content">
        <Hero />
        <OneDecisionSection />
        <OneProductSection />
        <DeterminismSection />
        <WhatItCatches />
        <HowItWorks />
        <ScopeContract />
        <Install />
        <Demo />
        <FAQ />
      </main>
      <Footer />
    </>
  )
}
