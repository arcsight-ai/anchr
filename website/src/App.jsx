import { useState } from 'react'
import './index.css'

const GITHUB_URL = 'https://github.com/arcsight-ai/anchr'

function Nav() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      padding: '14px 0'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="#" style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text)' }}>ANCHR</a>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="#install" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Install</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>GitHub</a>
          <a href="#install" className="btn btn-primary">Add ANCHR workflow</a>
        </div>
      </div>
    </nav>
  )
}

function PRCommentCard() {
  return (
    <div className="card" style={{
      maxWidth: 520,
      marginTop: 28,
      fontFamily: 'Inter',
      border: '1px solid var(--border)',
      boxShadow: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: 'var(--surface-hover)', color: 'var(--text-muted)'
        }}>PRE_MERGE</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ANCHR</span>
      </div>
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 14 }}>BLOCK</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}> — boundary_violation</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        world-model imports from @market-os/epistemic-kernel/src (internal). Minimal cut below.
      </p>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        <strong style={{ color: 'var(--text)' }}>MinimalCut</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
          <li>packages/world-model → packages/epistemic-kernel/src/types</li>
          <li>packages/epistemic-kernel: expose types via public entry only</li>
        </ul>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        <strong style={{ color: 'var(--text)' }}>Evidence</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
          <li>Import chain: world-model/run.ts → epistemic-kernel/src/types.ts</li>
          <li>epistemic-kernel public API: index.ts (types not re-exported)</li>
        </ul>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
        run.id: a3f2c1b
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
        Does not block merges.
      </div>
    </div>
  )
}

function Hero() {
  return (
    <header className="section" style={{ paddingTop: 48 }}>
      <div className="container">
        <h1 style={{ marginBottom: 12 }}>
          Code Review Catches Logic.<br />ANCHR Enforces Structure.
        </h1>
        <p style={{ fontSize: 1.15, color: 'var(--text-secondary)', maxWidth: 560, marginBottom: 24 }}>
          One decision per PR: VERIFIED or BLOCKED. Deterministic structural gate for TypeScript monorepos.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <a href="#install" className="btn btn-primary">Add ANCHR to Your Repo</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">View on GitHub</a>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 20 }}>
          Diff-based analysis. Deterministic output. Merge-gate ready.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>
          Not a linter. Not a report you interpret. It makes the decision.
        </p>
        <PRCommentCard />
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

function Install() {
  return (
    <section id="install" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2>Install (under 60 seconds)</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Add the ANCHR workflow. No SaaS. No dashboard. No config guessing. One deterministic decision per PR.
        </p>
        <div className="card" style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>.github/workflows/anchr.yml</p>
          <pre style={{
            background: 'var(--bg)', padding: 16, borderRadius: 8, overflow: 'auto',
            fontSize: 13, fontFamily: 'JetBrains Mono', margin: 0, border: '1px solid var(--border)'
          }}>
{`name: ANCHR
on: pull_request
jobs:
  ANCHR:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx anchr@latest audit`}
          </pre>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 16 }}>
          Then require the <strong>ANCHR</strong> status check in branch protection. One decision per PR: VERIFIED or BLOCKED.
        </p>
      </div>
    </section>
  )
}

const DEMO_REPO_URL = 'https://github.com/arcsight-ai/anchr/tree/main/anchr-demo-monorepo'

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
        <a href={DEMO_REPO_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">Open anchr-demo-monorepo</a>
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
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        <span>Open source · MIT</span>
        <span>Built to prevent architecture drift before it becomes a rewrite.</span>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Nav />
      <Hero />
      <WhatItCatches />
      <HowItWorks />
      <ScopeContract />
      <Install />
      <Demo />
      <FAQ />
      <Footer />
    </>
  )
}
