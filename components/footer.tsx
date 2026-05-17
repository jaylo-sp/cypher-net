import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border bg-secondary/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center">
                <svg 
                  viewBox="0 0 24 24" 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-[family-name:var(--font-bebas-neue)] text-xl tracking-wider">
                CYPHER NET
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              The official ranking system for the Greater Vancouver breaking community.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wide mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Rankings
                </Link>
              </li>
              <li>
                <Link href="/widget" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Embed Widget
                </Link>
              </li>
              <li>
                <Link 
                  href="https://cypher-space.ca" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cypherspace Events
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wide mb-4">Community</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Part of the Cypherspace ecosystem celebrating breaking culture in Greater Vancouver.
            </p>
            <Link 
              href="https://cypher-space.ca" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Visit Cypherspace
              <svg 
                viewBox="0 0 24 24" 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {new Date().getFullYear()} Cypher Net. Built for the culture.
          </p>
          <p className="text-xs text-muted-foreground">
            A project by{' '}
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
