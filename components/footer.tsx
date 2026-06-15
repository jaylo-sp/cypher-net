import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-display text-lg tracking-wider uppercase">Cypher Net</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tournament recaps, bracket results, and team rosters for the Greater Vancouver breaking community.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Navigate
            </p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Events
                </Link>
              </li>
              <li>
                <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Add Event
                </Link>
              </li>
              <li>
                <Link
                  href="https://cypher-space.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cypherspace
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Community
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Part of the Cypherspace ecosystem celebrating breaking culture in Greater Vancouver.
            </p>
            <Link
              href="https://cypher-space.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background text-[10px] font-mono uppercase tracking-wider hover:opacity-80 transition-opacity"
            >
              Visit Cypherspace
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[11px] font-mono text-muted-foreground">
            {new Date().getFullYear()} Cypher Net — Built for the culture.
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            A project by{" "}
            <Link
              href="https://cypher-space.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              Cypherspace
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
