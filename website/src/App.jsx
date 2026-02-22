import { useState } from 'react'
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
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      padding: '14px 0'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1.2rem', color: 'var(--text)' }}>
          <AnchrLogo style={{ width: 28, height: 33, flexShrink: 0 }} />
          ANCHR
        </a>
        <div className="nav-links" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Docs</a>
          <a href="#install" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Install</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>GitHub</a>
          <a href="#install" className="btn btn-primary">Add ANCHR to my repo</a>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <header className="section" style={{ paddingTop: 48 }}>
      <div className="container">
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 32,
          alignItems: 'flex-start',
        }}>
          <div style={{ flex: '1 1 380px', minWidth: 0 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              For TypeScript monorepos
            </p>
            <h1 style={{ marginBottom: 10, lineHeight: 1.2 }}>
              ANCHR enforces structure at merge time.
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: 520, marginBottom: 20 }}>
              One decision per PR: VERIFIED or BLOCKED. No config. No dashboard. One YAML file.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <a href="#install" className="btn btn-primary">Add ANCHR to my repo</a>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">View on GitHub</a>
              <a href="#demo" style={{ fontSize: 14, color: 'var(--text-muted)' }}>See it in action →</a>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16 }}>
              Open source · MIT · No signup
            </p>
          </div>
          <figure style={{
            flex: '1 1 380px',
            minWidth: 280,
            margin: 0,
          }}>
            <img
              src="/screenshot-block-pr-comment.png"
              alt="ANCHR PR comment: BLOCK with boundary_violation, minimal cut and evidence"
              width={2912}
              height={1440}
              fetchPriority="high"
              decoding="async"
              style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)' }}
            />
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              What ANCHR posts on a PR when it finds a boundary violation
            </figcaption>
          </figure>
        </div>
      </div>
    </header>
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
        <h2>What it catches</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          ANCHR detects structural drift before merge. One comment. Clear evidence.
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
  const steps = [
    'Add the ANCHR workflow to your repo (one YAML file).',
    'On every PR, ANCHR builds the dependency graph for packages/<name>/src.',
    'It computes violations: cycles, cross-boundary imports, deleted public API.',
    'One decision: VERIFIED or BLOCKED. Require the check in branch protection.',
  ]
  return (
    <section id="how" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2>How it works</h2>
        <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', maxWidth: 640 }}>
          {steps.map((step, i) => (
            <li key={i} style={{ marginBottom: 12 }}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ScopeContract() {
  return (
    <section id="scope" className="section">
      <div className="container">
        <h2>Scope is a feature</h2>
        <div className="card" style={{ maxWidth: 640 }}>
          <p style={{ margin: 0 }}>
            ANCHR enforces structural boundaries in monorepos organized under <code className="mono">packages/&lt;name&gt;/src</code>.
            Other layouts are out-of-scope by contract — and verified by contract, so no guessing.
          </p>
          <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)' }}>
            Opinionated by design. Deterministic.
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
      - run: npx anchr@latest audit`

const CLI_CMD = 'npx anchr@latest audit'

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
        <h2>Install (under 60 seconds)</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Add the ANCHR workflow. No SaaS. No dashboard. No config guessing. One deterministic decision per PR.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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
              Then require the <strong>ANCHR</strong> status check in branch protection. One decision per PR: VERIFIED or BLOCKED.
            </p>
            <p style={{ marginTop: 20 }}>
              <a href="#install" className="btn btn-primary">Add ANCHR to my repo</a>
            </p>
            <figure style={{ margin: '20px 0 0', maxWidth: 560 }}>
              <img src="/screenshot-branch-protection-anchr.png" alt="Branch protection rule with ANCHR required check" width={2528} height={1696} loading="lazy" decoding="async" style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)' }} />
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
              Run from your repo root. Same decision as CI: VERIFIED or BLOCKED. Use <code className="mono">--base</code> and <code className="mono">--head</code> for branch comparison.
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
        <h2>Demo</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          See ANCHR on a real monorepo: branch protection, required check, and three PR outcomes.
        </p>
        <ul style={{ color: 'var(--text-secondary)', marginBottom: 20, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong style={{ color: 'var(--text)' }}>VERIFIED</strong> — Clean PR that respects boundaries.</li>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 8, alignItems: 'stretch' }}>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-block-pr-comment.png" alt="PR comment: ANCHR BLOCK — boundary_violation with minimal cut" width={2912} height={1440} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>BLOCKED — PR comment with minimal cut</figcaption>
          </figure>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-verified-green.png" alt="ANCHR check VERIFIED — green success" width={3584} height={1184} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>VERIFIED — green check</figcaption>
          </figure>
          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <div style={{ height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/screenshot-branch-protection-anchr.png" alt="Branch protection: ANCHR required check" width={2528} height={1696} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <figcaption style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>Branch protection — ANCHR required</figcaption>
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
    a: 'VERIFIED means no structural violations: your PR respects package boundaries and the dependency graph. BLOCKED means ANCHR found a violation (cross-package internal import, deleted public API, or cycle). One decision per PR, with a minimal cut as evidence. Same input → same output.',
  },
  {
    q: 'How is ANCHR different from ESLint?',
    a: 'ESLint operates at the file level with rules and style. ANCHR builds a full package-level dependency graph and computes structural violations as graph problems (cycles, cross-boundary imports, minimal cuts). This isn’t a stylistic rule — it’s a merge-time architectural decision with evidence. Different layer. Different job.',
  },
  {
    q: 'How is ANCHR different from dependency-cruiser?',
    a: 'dependency-cruiser generates reports you interpret. ANCHR produces one required merge-time decision: VERIFIED or BLOCKED — backed by a minimal cut and a GitHub Check that can gate merges. Same input, same output, enforceable in CI. It’s not "analyze and interpret." It’s "decide and enforce."',
  },
  {
    q: 'Why only packages/<name>/src?',
    a: 'Because determinism matters. ANCHR supports one explicit layout: packages/<name>/src. No heuristics. No config guessing. Same repo → same result every time. It’s opinionated by design. If you want deterministic structural enforcement, this contract makes it possible.',
  },
  {
    q: 'How do I add ANCHR to my repo?',
    a: 'Create .github/workflows/anchr.yml with the workflow (see Install above), commit, and open a PR. Install takes under 60 seconds. After the check runs once, go to Settings → Branches → Branch protection and require the ANCHR status check. One decision per PR from then on.',
  },
  {
    q: 'Does it block merges?',
    a: 'Only if you require it. Add the ANCHR workflow, then in branch protection add "ANCHR" as a required status check. BLOCKED fails the check and blocks merge; VERIFIED passes. You control whether it’s advisory or enforced.',
  },
  {
    q: "Won't this slow teams down? / Is it too strict?",
    a: 'It’s strict by intent. Architecture drift is expensive because it compounds quietly. ANCHR stops violations at merge time — when they’re cheapest to fix. One clear decision per PR: merge or fix. Teams that care about structural discipline use gates. ANCHR is that gate.',
  },
  {
    q: 'Why not Nx or Turborepo?',
    a: 'Nx and Turborepo enforce rules inside their ecosystems. ANCHR is build-agnostic. It works in any repo that follows the layout contract — no framework adoption required. If you’re already on Nx, great. If not, ANCHR gives you structural enforcement without coupling to a build system.',
  },
  {
    q: "How do I know it's not full of false positives?",
    a: 'Same input → same output. Deterministic. We enforce one explicit layout (packages/<name>/src) so we’re not guessing. Out-of-scope repos get VERIFIED by contract. When you’re in scope, the contract is documented and the minimal cut is evidence.',
  },
  {
    q: 'Do I need to install dependencies or a build system?',
    a: 'No. The workflow runs npx anchr@latest audit in CI. No Nx, Turborepo, or extra installs. ANCHR reads your source and dependency graph directly.',
  },
  {
    q: 'Is it a linter or AI?',
    a: 'Neither. ANCHR is not a linter — it doesn’t analyze syntax or style. It’s a structural gate: package-level dependency graph, one deterministic decision per PR. No AI. No black box.',
  },
]

function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <section id="faq" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2>FAQ</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Pre-answers to the questions people ask first: ESLint?, dependency-cruiser?, layout?, strict? Install path and evidence.
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
        <a href="#install" className="btn btn-primary" style={{ fontSize: 13, padding: '8px 14px' }}>Add ANCHR to my repo</a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Issues</a>
        <span>Open source · </span>
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">MIT</a>
        <span>Built to prevent architecture drift before it becomes a rewrite.</span>
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
