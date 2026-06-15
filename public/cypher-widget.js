/**
 * Cypher Net embeddable widget loader.
 *
 * Usage (paste into a Squarespace Code Block):
 *
 *   <div data-cypher-event="cypher-space-vol-3"></div>
 *   <script src="https://YOUR-APP.vercel.app/cypher-widget.js" async></script>
 *
 * The script auto-detects its own origin, injects a responsive iframe pointing
 * at /embed/<eventId>, and auto-resizes the iframe to fit its content.
 */
(function () {
  "use strict"

  // Resolve the app origin from this script's own URL so the snippet is portable.
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script")
      return scripts[scripts.length - 1]
    })()
  var ORIGIN = new URL(currentScript.src).origin

  function buildIframe(eventId) {
    var iframe = document.createElement("iframe")
    iframe.src = ORIGIN + "/embed/" + encodeURIComponent(eventId)
    iframe.setAttribute("title", "Cypher Net event recap")
    iframe.setAttribute("loading", "lazy")
    iframe.style.width = "100%"
    iframe.style.minHeight = "560px"
    iframe.style.border = "0"
    iframe.style.display = "block"
    iframe.style.overflow = "hidden"
    iframe.dataset.cypherEventFrame = eventId
    return iframe
  }

  function mount() {
    var containers = document.querySelectorAll("[data-cypher-event]")
    Array.prototype.forEach.call(containers, function (el) {
      if (el.dataset.cypherMounted === "true") return
      var eventId = el.getAttribute("data-cypher-event")
      if (!eventId) return
      el.dataset.cypherMounted = "true"
      el.appendChild(buildIframe(eventId))
    })
  }

  // Auto-resize: listen for height messages posted by the embed page.
  window.addEventListener("message", function (event) {
    if (event.origin !== ORIGIN) return
    var data = event.data
    if (!data || data.type !== "cypher-widget-height") return
    var frames = document.querySelectorAll("iframe[data-cypher-event-frame]")
    Array.prototype.forEach.call(frames, function (frame) {
      if (frame.contentWindow === event.source && data.height) {
        frame.style.height = data.height + "px"
      }
    })
  })

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount)
  } else {
    mount()
  }
})()
