import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center">
              <svg 
                viewBox="0 0 24 24" 
                className="w-6 h-6" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-bebas-neue)] text-2xl tracking-wider leading-none">
                CYPHER NET
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Breaking Rankings
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className="text-sm font-medium hover:text-accent transition-colors"
            >
              Rankings
            </Link>
            <Link 
              href="/widget" 
              className="text-sm font-medium hover:text-accent transition-colors"
            >
              Widget
            </Link>
            <Link 
              href="https://cypher-space.ca" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:text-accent transition-colors flex items-center gap-1"
            >
              Cypherspace
              <svg 
                viewBox="0 0 24 24" 
                className="w-3 h-3" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2 hover:bg-secondary transition-colors">
            <svg 
              viewBox="0 0 24 24" 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
