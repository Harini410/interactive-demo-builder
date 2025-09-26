;(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel)
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel))

  const filePicker = $("#filePicker")
  const loadExampleBtn = $("#loadExample")
  const overlay = $("#guide-overlay")
  const panel = $("#guide-panel")
  const stepCounter = $("#stepCounter")
  const stepLabel = $("#stepLabel")
  const startBtn = $("#startBtn")
  const prevBtn = $("#prevBtn")
  const nextBtn = $("#nextBtn")
  const resetBtn = $("#resetBtn")

  const successEl = $("#success")

  // Internal runner state
  let steps = []
  let idx = -1
  const resolvedCache = new Map() // stepId -> selector
  let lastHighlighted = null

  // Simple synonyms for value mapping
  const valueSynonyms = {
    administrator: "admin",
    "united states": "usa",
    "phone call": "phone",
  }

  // Hook controls
  filePicker.addEventListener("change", async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const txt = await file.text()
      const json = JSON.parse(txt)
      loadSteps(json)
      console.log("[v0] Steps loaded from upload:", json)
    } catch (err) {
      console.error("[v0] Failed to read uploaded JSON:", err)
      alert("Invalid JSON file.")
    }
  })

  loadExampleBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("./steps-recorded.json", { cache: "no-store" })
      const json = await res.json()
      loadSteps(json)
      console.log("[v0] Example steps loaded:", json)
    } catch (err) {
      console.error("[v0] Failed to load example steps:", err)
      alert("Could not load example steps.")
    }
  })

  startBtn.addEventListener("click", () => {
    if (!steps.length) return
    idx = 0
    renderStep()
  })
  prevBtn.addEventListener("click", () => {
    if (!steps.length) return
    idx = Math.max(0, idx - 1)
    renderStep()
  })
  nextBtn.addEventListener("click", async () => {
    if (!steps.length) return
    await executeCurrentStep()
    idx = Math.min(steps.length - 1, idx + 1)
    renderStep()
  })
  resetBtn.addEventListener("click", () => {
    idx = -1
    clearHighlight()
    updatePanel()
    hideOverlay()
    successEl.style.display = "none"
  })

  function loadSteps(json) {
    const s = json.steps || json // support direct array or {steps: []}
    steps = Array.isArray(s) ? s : []
    idx = -1
    resolvedCache.clear()
    successEl.style.display = "none"
    clearHighlight()
    updatePanel()
    hideOverlay()
  }

  function updatePanel() {
    const total = steps.length
    const cur = idx >= 0 ? idx + 1 : 0
    stepCounter.textContent = `Step ${cur}/${total}`
    stepLabel.textContent = idx >= 0 ? readableLabel(steps[idx]) : "Load steps to begin"
  }

  function readableLabel(step) {
    const t = step?.target_text ? ` • ${step.target_text}` : ""
    const v = step?.value != null ? ` = "${String(step.value)}"` : ""
    return `${step.action ?? "unknown"}${t}${v}`
  }

  function clearHighlight() {
    if (lastHighlighted) {
      lastHighlighted.classList.remove("guided-highlight")
      lastHighlighted = null
    }
  }

  function showOverlayFor(el) {
    if (!el) {
      hideOverlay()
      return
    }
    const rect = el.getBoundingClientRect()
    overlay.style.setProperty("--x", `${Math.max(0, rect.left - 8)}px`)
    overlay.style.setProperty("--y", `${Math.max(0, rect.top - 8 + window.scrollY)}px`)
    overlay.style.setProperty("--w", `${rect.width + 16}px`)
    overlay.style.setProperty("--h", `${rect.height + 16}px`)
    overlay.classList.add("active", "hole")
  }

  function hideOverlay() {
    overlay.classList.remove("active", "hole")
  }

  async function renderStep() {
    updatePanel()
    clearHighlight()

    const step = steps[idx]
    if (!step) return

    const el = await resolveElementForStep(step)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("guided-highlight")
      lastHighlighted = el
      showOverlayFor(el)
    } else {
      hideOverlay()
    }
  }

  async function executeCurrentStep() {
    const step = steps[idx]
    if (!step) return

    console.log("[v0] Executing step:", step)

    // Basic actions
    if (step.action === "navigate") {
      // For this static demo, just log navigation
      console.log("[v0] navigate:", step.target_text || "(no URL)")
      return
    }

    if (step.action === "assert") {
      const type = step.assert?.type
      const val = String(step.assert?.value ?? "")
      if (type === "textContains") {
        const contains = document.body.innerText.toLowerCase().includes(val.toLowerCase())
        console.log("[v0] assert textContains:", { value: val, contains })
        if (!contains) alert(`Assertion failed: could not find "${val}"`)
      } else {
        console.log("[v0] assert (unknown type)", step.assert)
      }
      return
    }

    const el = await resolveElementForStep(step)
    if (!el) {
      console.warn("[v0] No element resolved for step; skipping action.")
      return
    }

    // Perform action
    switch (step.action) {
      case "type": {
        el.focus()
        el.value = String(step.value ?? "")
        el.dispatchEvent(new Event("input", { bubbles: true }))
        console.log("[v0] type: set value", el)
        break
      }
      case "select": {
        if (el.tagName === "SELECT") {
          const want = normalize(String(step.value ?? ""))
          const opt = Array.from(el.options).find((o) => normalize(o.textContent || "") === want)
          if (opt) el.value = opt.value
          else {
            // attempt synonyms/inclusion fallback
            const inc = Array.from(el.options).find(
              (o) => normalize(o.textContent || "") === (valueSynonyms[want] || want),
            )
            if (inc) el.value = inc.value
            else {
              const loose = Array.from(el.options).find(
                (o) =>
                  normalize(o.textContent || "").includes(want) ||
                  normalize(o.textContent || "").includes(valueSynonyms[want] || ""),
              )
              if (loose) el.value = loose.value
            }
          }
          el.dispatchEvent(new Event("change", { bubbles: true }))
          console.log("[v0] select: chose", el.value, "on", el)
        } else {
          console.warn("[v0] select: target is not a <select>")
        }
        break
      }
      case "radio": {
        // Expect step.value = desired value for the radio group
        const name = el.getAttribute("name")
        const want = normalize(String(step.value ?? ""))
        const radios = $$(`input[type="radio"][name="${CSS.escape(name)}"]`)
        const target =
          radios.find((r) => normalize(r.value) === want) ||
          radios.find((r) => normalize(r.value).includes(want)) ||
          radios.find((r) => normalize(r.value) === (valueSynonyms[want] || ""))
        if (target) {
          target.click()
          console.log("[v0] radio: selected", target.value)
        } else {
          console.warn("[v0] radio: could not match value", want)
        }
        break
      }
      case "check": {
        // Toggle checkbox of resolved element
        if (el.type === "checkbox") {
          el.click()
          console.log("[v0] check: toggled checkbox")
        } else {
          console.warn("[v0] check: target not a checkbox")
        }
        break
      }
      case "click": {
        el.click()
        console.log("[v0] click: clicked element")
        break
      }
      default:
        console.log("[v0] Unknown action; no-op.")
    }
  }

  // Resolve element for a step (selector → element; or stub; or heuristic DOM inventory)
  async function resolveElementForStep(step) {
    const cacheKey = step.id || `${step.action}:${step.target_text ?? ""}:${step.value ?? ""}`
    if (resolvedCache.has(cacheKey)) {
      const sel = resolvedCache.get(cacheKey)
      const cachedEl = document.querySelector(sel)
      if (cachedEl) {
        console.log("[v0] Resolver (cache):", { target_text: step.target_text, selector: sel })
        return cachedEl
      }
    }

    // 1) If step has selector already
    if (step.selector) {
      const el = document.querySelector(step.selector)
      console.log("[v0] Resolver (direct selector):", { selector: step.selector, found: !!el })
      if (el) {
        resolvedCache.set(cacheKey, step.selector)
        return el
      }
    }

    // 2) Try stub
    const stubSel = await stubLookup(step.target_text)
    if (stubSel) {
      const el = document.querySelector(stubSel)
      console.log("[v0] Resolver (stub):", { target_text: step.target_text, selector: stubSel, found: !!el })
      if (el) {
        resolvedCache.set(cacheKey, stubSel)
        return el
      }
    }

    // 3) Heuristic inventory-based resolver
    const invSel = heuristicResolve(step)
    const el = invSel ? document.querySelector(invSel) : null
    console.log("[v0] Resolver (heuristic):", { target_text: step.target_text, selector: invSel, found: !!el })
    if (el && invSel) {
      resolvedCache.set(cacheKey, invSel)
      return el
    }
    return null
  }

  async function stubLookup(targetText) {
    if (!targetText) return null
    try {
      const res = await fetch("./stub-response.json", { cache: "no-store" })
      const stub = await res.json()
      const list = Array.isArray(stub?.mappings) ? stub.mappings : []
      const hit = list.find((m) => normalize(m.target_text) === normalize(targetText))
      return hit?.selector || null
    } catch (e) {
      console.warn("[v0] Stub lookup failed:", e)
      return null
    }
  }

  function heuristicResolve(step) {
    const t = normalize(step?.target_text || "")

    // Common label→control pairs via for=
    const labels = $$("label[for]")
    for (const lab of labels) {
      const text = normalize(lab.textContent || "")
      if (text.includes(t) || t.includes(text)) {
        const forId = lab.getAttribute("for")
        if (forId) return `#${CSS.escape(forId)}`
      }
    }

    // Placeholder/search by input/select content
    const allControls = $$('input, select, button, [role="button"]')
    // Direct text buttons
    for (const c of allControls) {
      const txt = normalize(c.textContent || "")
      const ph = normalize(c.getAttribute?.("placeholder") || "")
      if ((txt && (txt.includes(t) || t.includes(txt))) || (ph && (ph.includes(t) || t.includes(ph)))) {
        return domSelector(c)
      }
    }

    // Checkboxes by adjacent label text
    const checkboxLabels = $$("label")
    for (const lab of checkboxLabels) {
      const txt = normalize(lab.textContent || "")
      // Loose matches for terms/newsletter
      if (
        (t.includes("agree") && txt.includes("agree")) ||
        (t.includes("terms") && txt.includes("terms")) ||
        (t.includes("newsletter") && (txt.includes("newsletter") || txt.includes("subscribe")))
      ) {
        const input = lab.querySelector('input[type="checkbox"]')
        if (input) return domSelector(input)
      }
    }

    // Radios by group legends (e.g., "Account type", "Preferred contact")
    const legends = $$("fieldset > legend")
    for (const lg of legends) {
      const txt = normalize(lg.textContent || "")
      if (t.includes(txt) || txt.includes(t)) {
        // Prefer the first radio inside; action.value will select the exact one later
        const radio = lg.parentElement?.querySelector('input[type="radio"]')
        if (radio) return domSelector(radio)
      }
    }

    // Create Account button
    if (t.includes("create account")) {
      const btn = $("#create_account") || $$("button").find((b) => normalize(b.textContent || "").includes("create"))
      if (btn) return domSelector(btn)
    }

    // Success banner
    if (t.includes("success")) {
      if (successEl) return "#success"
    }

    // Fallback: try id-by-words
    const idGuess = t.replace(/\s+/g, "_")
    const byId = document.getElementById(idGuess)
    if (byId) return `#${CSS.escape(idGuess)}`

    return null
  }

  function domSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`
    // Build a less fragile selector
    const tag = el.tagName.toLowerCase()
    const name = el.getAttribute("name")
    if (name) return `${tag}[name="${CSS.escape(name)}"]`
    // Position-based (last resort)
    const parent = el.parentElement
    if (!parent) return tag
    const index = Array.from(parent.children).indexOf(el) + 1
    return `${domSelector(parent)} > ${tag}:nth-child(${index})`
  }

  function normalize(s) {
    return String(s).trim().toLowerCase()
  }

  // Initialize panel with no steps
  updatePanel()
})()
