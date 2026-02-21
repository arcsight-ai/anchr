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
        <h2>Install</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          Add the ANCHR workflow. No SaaS. No dashboard. No config guessing.
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

function Demo() {
  return (
    <section id="demo" className="section">
      <div className="container">
        <h2>Demo</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
          See ANCHR on a real PR. (Placeholder: link to demo repo PRs.)
        </p>
        <a href={GITHUB_URL} className="btn btn-secondary">View demo on GitHub</a>
      </div>
    </section>
  )
}

const FAQ_ITEMS = [
  { q: 'Does it block merges?', a: 'Yes. Add the ANCHR workflow, then require the ANCHR status check in branch protection. The check fails on BLOCKED and passes on VERIFIED.' },
  { q: 'Does it require installing dependencies?', a: 'No. It runs in a bounded runtime and reads source files directly.' },
  { q: 'Does it support arbitrary layouts?', a: 'No. It enforces one explicit contract (packages/<name>/src) for deterministic behavior.' },
  { q: 'Is it AI?', a: 'No. Deterministic structural analysis.' },
]

function FAQ() {
  return (
    <section id="faq" className="section" style={{ background: 'var(--bg-alt)' }}>
      <div className="container">
        <h2>FAQ</h2>
        <div style={{ maxWidth: 640 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 1, marginBottom: 6 }}>{item.q}</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{item.a}</p>
            </div>
          ))}
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
