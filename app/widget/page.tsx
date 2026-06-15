import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { WidgetGenerator } from "@/components/widget-generator"
import { getAllEvents } from "@/lib/events"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Embed Widget — Cypher Net",
  description: "Generate a copy-paste widget for Squarespace.",
}

export default async function WidgetPage() {
  const events = await getAllEvents()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-5 py-12 md:py-16">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
              Embed Anywhere
            </p>
            <h1 className="text-4xl md:text-6xl font-display uppercase tracking-wider leading-none">
              Widget Generator
            </h1>
            <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
              Pick an event, copy the snippet, and paste it into Squarespace. The
              widget has tabs for the bracket, full battle log, and participants.
            </p>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 py-10 md:py-14">
          <WidgetGenerator events={events} />
        </section>
      </main>
      <Footer />
    </div>
  )
}
