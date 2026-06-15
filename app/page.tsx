import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { EventCard } from "@/components/event-card"
import { events } from "@/lib/mock-data"

export default function HomePage() {
  const sorted = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border">
          <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
              Greater Vancouver Breaking Community
            </p>
            <h1 className="text-5xl md:text-7xl font-display uppercase tracking-wider text-foreground leading-none">
              Event Recaps
            </h1>
            <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
              Full tournament brackets, judge scores, and team rosters from every event.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-b border-border bg-muted/30">
          <div className="max-w-5xl mx-auto px-5 py-4 flex items-center gap-8 flex-wrap">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Events Archived
              </p>
              <p className="text-2xl font-display tracking-wider mt-0.5">{events.length}</p>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Crew Events
              </p>
              <p className="text-2xl font-display tracking-wider mt-0.5">
                {events.filter((e) => e.format === "crew").length}
              </p>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Solo Events
              </p>
              <p className="text-2xl font-display tracking-wider mt-0.5">
                {events.filter((e) => e.format === "solo").length}
              </p>
            </div>
          </div>
        </section>

        {/* Events grid */}
        <section className="max-w-5xl mx-auto px-5 py-12">
          {sorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">No events yet. Add one via the admin form.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sorted.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
