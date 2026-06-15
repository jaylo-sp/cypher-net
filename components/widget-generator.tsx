"use client"

import { useEffect, useMemo, useState } from "react"
import type { EventRecap } from "@/lib/types"
import { WidgetView } from "@/components/widget-view"

interface WidgetGeneratorProps {
  events: EventRecap[]
}

function CopyBox({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <button
          onClick={copy}
          className="px-3 py-1 text-[10px] font-mono uppercase tracking-[0.15em] bg-foreground text-background hover:opacity-80 transition-opacity"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function WidgetGenerator({ events }: WidgetGeneratorProps) {
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? "")
  const [origin, setOrigin] = useState("https://your-app.vercel.app")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? events[0],
    [events, selectedId],
  )

  const scriptSnippet = `<!-- Cypher Net widget -->
<div data-cypher-event="${selectedId}"></div>
<script src="${origin}/cypher-widget.js" async></script>`

  const iframeSnippet = `<iframe
  src="${origin}/embed/${selectedId}"
  title="Cypher Net event recap"
  style="width:100%;min-height:640px;border:0;"
  loading="lazy"
></iframe>`

  if (!selected) {
    return (
      <p className="text-sm text-muted-foreground">
        No events available yet. Add one in the admin form and sync it first.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
      {/* Left: controls + snippets */}
      <div className="flex flex-col gap-5">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
            Choose Event
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground mb-1">
            Recommended — Auto-resizing script
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            Paste into a Squarespace <strong>Code Block</strong>. The widget grows to
            fit its content automatically.
          </p>
          <CopyBox label="Squarespace embed" code={scriptSnippet} />
        </div>

        <div>
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground mb-1">
            Alternative — Plain iframe
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            Fixed-height fallback if you can&apos;t run scripts. Adjust{" "}
            <code className="font-mono">min-height</code> as needed.
          </p>
          <CopyBox label="iframe" code={iframeSnippet} />
        </div>

        <div className="border border-dashed border-border p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
            How it works
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your laptop syncs events to Supabase. Vercel reads from Supabase and
            serves this widget. Update an event, re-sync, and every embed refreshes
            within a minute.
          </p>
        </div>
      </div>

      {/* Right: live preview */}
      <div>
        <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
            Live Preview
          </h3>
          <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            {selected.format} format
          </span>
        </div>
        <div className="border border-border shadow-sm">
          <WidgetView event={selected} />
        </div>
      </div>
    </div>
  )
}
