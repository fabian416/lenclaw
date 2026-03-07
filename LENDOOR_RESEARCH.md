# Lendoor Frontend Design Research

Complete design system analysis of the Lendoor frontend (`/home/lucholeonel/CODE-werify/projects/lendoor/frontend/src/`).

---

## 1. Color Palette

### Light Mode (`:root`)

| Token                    | Value              | Usage                              |
|--------------------------|--------------------|-------------------------------------|
| `--background`           | `#ffffff`          | Page background                     |
| `--foreground`           | `#1f2937`          | Main text (gray-800)                |
| `--card`                 | `#f8fafc`          | Card backgrounds (slate-50)         |
| `--card-foreground`      | `#1f2937`          | Card text                           |
| `--popover`              | `#ffffff`          | Popover background                  |
| `--popover-foreground`   | `#1f2937`          | Popover text                        |
| `--primary`              | `#ea580c`          | Orange-600, buttons, highlights     |
| `--primary-foreground`   | `#ffffff`          | Text on primary                     |
| `--secondary`            | `#6b7280`          | Gray-500, secondary elements        |
| `--secondary-foreground` | `#ffffff`          | Text on secondary                   |
| `--muted`                | `#f1f5f9`          | Muted backgrounds (slate-100)       |
| `--muted-foreground`     | `#6b7280`          | Secondary text (gray-500)           |
| `--accent`               | `#ea580c`          | Same as primary (orange)            |
| `--accent-foreground`    | `#ffffff`          | Text on accent                      |
| `--destructive`          | `#dc2626`          | Red-600, errors/danger              |
| `--destructive-foreground`| `#ffffff`         | Text on destructive                 |
| `--border`               | `#e5e7eb`          | Borders (gray-200)                  |
| `--input`                | `#f8fafc`          | Input background (slate-50)         |
| `--ring`                 | `rgba(234,88,12,0.3)` | Focus ring (orange alpha)       |
| `--radius`               | `0.25rem`          | Base border-radius (4px)            |

### Dark Mode (`.dark`)

| Token                    | Value              |
|--------------------------|--------------------|
| `--background`           | `#0f172a`          |
| `--foreground`           | `#f1f5f9`          |
| `--card`                 | `#1e293b`          |
| `--card-foreground`      | `#f1f5f9`          |
| `--primary`              | `#f97316`          |
| `--secondary`            | `#64748b`          |
| `--muted`                | `#1e293b`          |
| `--muted-foreground`     | `#94a3b8`          |
| `--accent`               | `#f97316`          |
| `--border`               | `#334155`          |
| `--input`                | `#1e293b`          |
| `--ring`                 | `rgba(249,115,22,0.3)` |

### Chart Colors

| Token         | Light     | Dark      |
|---------------|-----------|-----------|
| `--chart-1`   | `#ea580c` | `#f97316` |
| `--chart-2`   | `#f97316` | `#fb923c` |
| `--chart-3`   | `#1f2937` | `#f1f5f9` |
| `--chart-4`   | `#6b7280` | `#94a3b8` |
| `--chart-5`   | `#dc2626` | `#dc2626` |

### Hardcoded Colors Used Across Components

| Color                      | Where Used                                          |
|----------------------------|-----------------------------------------------------|
| `#F46A06`                  | Hero CTA button, Lend deposit button, Utilization bar, chart area fill |
| `#e35f02`                  | Hero CTA hover, Lend deposit button hover           |
| `bg-orange-300`            | Default button variant, slider range, terms buttons  |
| `bg-orange-400`            | Default button hover                                |
| `text-orange-950`          | Default button text, terms button text               |
| `bg-orange-100`            | Activity BORROW badge bg, slider track              |
| `text-orange-700`          | Activity BORROW badge text                          |
| `bg-orange-50`             | Active loan term option bg                          |
| `border-orange-300`        | Active loan term border, slider thumb border        |
| `border-orange-200/80`     | Hero CTA border, loan term hover border             |
| `bg-emerald-500`           | USDC balance dot, progress bar default              |
| `bg-emerald-50`            | "Early user" badge bg                               |
| `text-emerald-700`         | "Early user" badge text, "On time" badge text       |
| `bg-emerald-100`           | "On time" status badge bg                           |
| `text-emerald-800`         | "On time" status badge text                         |
| `bg-green-100`             | DEPOSIT/REPAY activity badge bg                     |
| `text-green-700`           | DEPOSIT/REPAY activity badge text                   |
| `bg-amber-50/100`          | Repay panel gradient, achievement dialog            |
| `border-amber-200/80`      | Repay panel border, achievement dialog border       |
| `text-amber-900`           | Repay panel text, achievement text                  |
| `bg-amber-300/20`          | Repay panel glow                                    |
| `bg-amber-400`             | XP progress bar middle, amber badge bg              |
| `text-amber-500`           | Trophy icon, award icon                             |
| `bg-amber-100`             | Score/MAX badge bg                                  |
| `text-amber-700`           | Score/MAX badge text                                |
| `bg-sky-50/100`            | PullPanel (borrow) amount card gradient             |
| `border-sky-200/80`        | PullPanel amount card border                        |
| `text-sky-900`             | PullPanel amount text                               |
| `bg-sky-300/20`            | PullPanel glow                                      |
| `bg-red-100`               | DEFAULT activity badge bg, overdue status badge bg  |
| `text-red-700/800`         | DEFAULT badge text, overdue status text              |
| `bg-red-50/70`             | Debtor in-default row                               |
| `ring-red-500/30`          | Debtor in-default ring                              |
| `bg-gray-50`               | Activity list item bg, input bg in lend, vault activity bg |
| `bg-gray-100`              | Tab background (lend), utilization bar track         |
| `text-gray-500`            | Small labels in lend/stats pages                    |
| `text-gray-900`            | Values in activity items, utilization text           |
| `border-gray-100`          | Activity item borders                               |
| `border-gray-200`          | Lend input border                                   |
| `#10b981`                  | `.terminal-green` CSS class                         |
| `#ef4444`                  | `.terminal-red` CSS class                           |
| `#f59e0b`                  | `.terminal-yellow` CSS class                        |
| `#3e73c4`                  | USDC icon fill                                      |
| `#2775CA`                  | USDC icon fill (alternate, in Info page)            |
| `#3b82f6`                  | Scrollbar thumb color (blue-500)                    |
| `rgba(168,85,247,0.6/0.8)` | Webkit scrollbar thumb (purple-400)                |

### Semantic Button Hover Variable
```css
--btn-hover-bg: color-mix(in srgb, var(--primary) 90%, transparent);
--btn-active-bg: color-mix(in srgb, var(--primary) 85%, transparent);
```

---

## 2. Typography

### Font Families

| Font                   | Where Applied                              | CSS Variable                |
|------------------------|--------------------------------------------|-----------------------------|
| **InterVariable**      | Body, all UI text, `--font-sans`           | `@fontsource-variable/inter` + Google Fonts |
| **JetBrains Mono**     | Monospace code text, `--font-mono`         | `@fontsource/jetbrains-mono` |
| **Courier New** stack  | `.mono-text` class                         | Inline in CSS               |
| **Geist Mono**         | Declared but not widely used               | `--font-geist-mono`         |

### Font Sizes Used

| Size Pattern        | Where Used                                          |
|---------------------|-----------------------------------------------------|
| `text-4xl` / `text-5xl` | Hero title (Home page), centered amount input   |
| `text-[2.5rem]`     | Borrow amount display                              |
| `text-[2.3rem]`     | Repay outstanding amount                            |
| `text-[2.1rem]`     | Cooldown main countdown                             |
| `text-[1.9rem]`     | Credit score number                                 |
| `text-[1.4rem]`     | PullPanel title, cooldown secondary timer           |
| `text-2xl` / `text-3xl` | InitAccount step 1 title, OnWaitList title, stat values |
| `text-xl` / `text-2xl`  | Brand name LENDOOR, section headers, stat values |
| `text-lg` / `text-xl`   | Hero subtitle, dialog title, CTA button text    |
| `text-base`         | Body copy, form fields, button text                 |
| `text-[15px]`       | Input text on mobile, onboarding body text          |
| `text-sm` / `text-[13px]` | Nav links, card body text, secondary info      |
| `text-xs`           | Labels, muted text, KPI labels, activity badges     |
| `text-[12px]`       | Helper text, footnotes                              |
| `text-[11px]`       | Micro labels (badges, tracking labels, supply cap)  |
| `text-[10px]`       | CTA badge text, smallest labels, performance card labels |

### Font Weights

| Weight         | Tailwind Class   | Usage                                    |
|----------------|------------------|------------------------------------------|
| 300 (light)    | imported but rarely used | Available via Inter                |
| 400 (regular)  | default          | Body text                                |
| 500 (medium)   | `font-medium`    | Tabs, section headers, secondary labels  |
| 600 (semibold) | `font-semibold`  | Card titles, stat values, CTA buttons    |
| 700 (bold)     | `font-bold`      | Hero title, brand name, amount inputs    |
| 800 (extrabold)| `font-extrabold` | CTA badge nudge icon                     |

### Letter Spacing

| Value            | Usage                                      |
|------------------|--------------------------------------------|
| `tracking-tight` | Hero title, stat values                    |
| `tracking-wide`  | Hero CTA, nav link labels                 |
| `tracking-[0.05em]` | `.mono-text` CSS class                 |
| `tracking-[0.18em]` | Mono labels throughout (score header, cooldown header, loan term header, etc.) |
| `tracking-[0.22em]` | Waitlist position label                |
| `tracking-[0.25em]` | OTP input (early access variant)       |
| `tracking-[0.2em]`  | OTP input (waitlist variant)           |
| `tracking-[0.16em]` | Achievement badge label                |

### Line Heights

| Pattern            | Usage                             |
|--------------------|-----------------------------------|
| `leading-none`     | Score numbers, stat values, brand |
| `leading-tight`    | Card titles, section headers      |
| `leading-snug`     | Helper text, descriptions         |
| `leading-relaxed`  | Onboarding body text, terms body  |

### Numeric Rendering

- `tabular-nums` / `[font-variant-numeric:tabular-nums]` used on all numeric displays (amounts, scores, countdowns)

---

## 3. Buttons

### Button Component (shadcn/ui + CVA)

**Base classes:**
```
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium
transition-all disabled:pointer-events-none disabled:opacity-50
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

### Variants

| Variant        | Classes                                                          |
|----------------|------------------------------------------------------------------|
| `default`      | `bg-orange-300 text-orange-950 shadow-xs md:hover:bg-orange-400` |
| `destructive`  | `bg-destructive text-white shadow-xs hover:bg-destructive/90`    |
| `outline`      | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground` |
| `secondary`    | `bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80` |
| `ghost`        | `hover:bg-accent hover:text-accent-foreground`                   |
| `link`         | `text-primary underline-offset-4 hover:underline`               |

### Sizes

| Size      | Classes                                            |
|-----------|----------------------------------------------------|
| `default` | `h-9 px-4 py-2`                                   |
| `sm`      | `h-8 rounded-md gap-1.5 px-3`                     |
| `lg`      | `h-10 rounded-md px-6`                             |
| `xl`      | `h-12 rounded-xl px-7 text-base`                  |
| `icon`    | `size-9`                                           |

### Custom Inline Button Styles (Outside Button Component)

**Hero CTA (Home page):**
```
bg-[#F46A06] hover:bg-[#e35f02] text-white font-bold mono-text tracking-wide
border border-orange-200/80 rounded-2xl h-12 md:h-14 px-10 text-lg md:text-xl
shadow-sm hover:shadow-md transition-all
```

**Lend Deposit button:**
```
w-full bg-[#F46A06] hover:bg-[#e35f02]
disabled:opacity-60 disabled:hover:bg-[#F46A06]
text-white font-semibold py-3 rounded-2xl transition cursor-pointer
```

**Tab buttons (Lend page):**
```
px-3 py-1 rounded-full cursor-pointer
Active: bg-white shadow-sm font-medium
Inactive: text-gray-500
Container: inline-flex rounded-full bg-gray-100 p-1 text-xs
```

**Terms & Conditions buttons:**
```
bg-orange-300 px-4 py-2.5/3.5 text-xs/sm font-semibold text-orange-950
shadow-sm hover:bg-orange-400 transition-colors rounded-xl
```

**Self-verification buttons:**
```
w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
```

**Work type option buttons:** Use the standard `Button` component with `variant="default"` (selected) or `variant="outline"` (unselected), with `w-full justify-start rounded-xl text-[15px]`

---

## 4. Cards

### Card Component (shadcn/ui)

**Base classes:**
```
bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm
```

### Card Variants Used Across the App

**Standard card (onboarding):**
```
w-full max-w-md rounded-2xl border-2 border-border/50 p-5 sm:p-6 shadow-md
```

**Data card (Home page feature cards):**
```css
.data-card {
  border: 1px solid rgba(234, 88, 12, 0.2);
  background: rgba(248, 250, 252, 0.8);
  backdrop-filter: blur(10px);
}
.data-card:hover {
  border-color: var(--primary);
  box-shadow: 0 0 20px rgba(234, 88, 12, 0.1);
}
```
Plus Tailwind: `p-8 terminal-hover relative rounded-2xl border border-primary/20`

**PullPanel card (borrow):**
```
mt-4 w-full max-w-md overflow-hidden rounded-2xl border-2 border-border/60 bg-card p-0 shadow-sm
```

**RepayPanel card:**
```
relative w-full overflow-hidden rounded-2xl border-2 border-amber-200/80
bg-gradient-to-br from-amber-50 via-amber-50 to-amber-100
px-5 pt-6 pb-5 sm:px-6 sm:pt-7 sm:pb-6 shadow-sm
```

**PullPanel amount card (inner):**
```
relative overflow-hidden rounded-2xl border border-sky-200/80
bg-gradient-to-br from-sky-50 via-sky-50 to-sky-100
px-5 py-6 sm:px-6 sm:py-7 shadow-sm
```

**CooldownPanel card:**
```
rounded-2xl border-2 border-border/60 bg-muted px-4 py-4 shadow-sm sm:px-5 sm:py-5
```

**CreditScoreShowcase card:**
```
rounded-2xl border-2 border-border/60 bg-muted px-4 py-3.5 shadow-sm sm:px-5 sm:py-4
```

**LoanTermStrip card:**
```
relative mx-auto mb-4 w-full max-w-md overflow-hidden rounded-2xl border-2 border-border/80
bg-muted px-4 py-5 shadow-sm sm:px-5 sm:py-4
```

**Lend/Stats section cards (white cards):**
```
bg-white rounded-3xl shadow-sm p-4 space-y-1
```

**KPI cards:**
```
h-14 px-3 py-1 rounded-lg border border-border/50 bg-card shadow-sm
flex flex-col items-center justify-center
```

**MiniStatCard (CreditPerformanceStrip):**
```
flex flex-1 flex-col items-center justify-center gap-1.5
rounded-xl border border-border/60 bg-card px-2 py-1.5 sm:px-3 sm:py-2
```

**Activity list items:**
```
rounded-xl border border-gray-100 bg-gray-50 px-3 py-2  (borrow/repay)
rounded-xl border border-gray-100 bg-gray-50 px-3 py-1.5  (vault activity)
```

**Waitlist position block:**
```
rounded-2xl border border-dashed border-primary/50 bg-muted/60 px-5 py-4 text-center
```

**Achievement dialog card:**
```
rounded-2xl border-2 border-amber-200/80
bg-gradient-to-b from-amber-50 via-amber-50 to-amber-100
px-4 py-4 sm:px-5 sm:py-5 shadow-lg
```

### Common Card Patterns
- Most cards use `rounded-2xl` or `rounded-3xl`
- Borders are typically `border-2 border-border/60` or `border border-border/50`
- Inner glow effects use absolute positioned divs with blurred colored circles
- Padding: typically `p-4` to `p-6`, responsive with `sm:` prefixes
- Shadow: `shadow-sm` (most cards), `shadow-md` (onboarding cards), `shadow-lg` (dialog)

---

## 5. Inputs

### Input Component

**Base classes:**
```
w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-3.5
text-[15px] md:text-sm shadow-xs outline-none
placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
transition-[border-color,box-shadow]
disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
dark:bg-input/30 dark:border-input
```

**Focus state:**
```
focus-visible:ring-2 focus-visible:ring-orange-200/80 focus-visible:border-orange-200
dark:focus-visible:ring-orange-300/70 dark:focus-visible:border-orange-300/70
```

**Error state:**
```
aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
```

### Custom Inputs

**OTP input (early access):**
```
rounded-xl py-3.5 text-center text-[18px] tracking-[0.25em]
```

**OTP input (waitlist):**
```
rounded-xl py-3.5 text-[15px] text-center tracking-[0.2em]
```

**CenteredAmountInput:**
```
bg-transparent outline-none border-none text-4xl font-bold text-primary
text-left placeholder:text-primary/50 [font-variant-numeric:tabular-nums]
```

**Lend amount input (inline, not using Input component):**
```
flex-1 bg-transparent outline-none text-base
Container: flex items-center gap-2 border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50
```

### Textarea

```
border-input placeholder:text-muted-foreground
flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent
px-3 py-2 text-base shadow-xs md:text-sm
focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

---

## 6. Navigation

### Header

**Container:**
```
border-b border-primary/20 bg-background/95 backdrop-blur-md sticky top-0 z-50
```

**Inner layout:**
```
max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4
grid items-center
grid-cols-[auto_auto] md:grid-cols-[auto_1fr_auto]
gap-2 md:gap-4
```

**Brand:**
```
Text: text-xl md:text-2xl font-bold text-primary mono-text terminal-cursor truncate
Icon: h-7 w-7 shrink-0 object-contain
```

**Nav links (desktop only, `hidden md:flex`):**
```
Container: flex items-center justify-center gap-6 mono-text
Link wrapper: group px-2 py-1.5 text-sm flex items-center gap-2
```

**Nav link label styling (active vs inactive):**
```
Base: relative inline-block tracking-wide transition-colors duration-150
      after:absolute after:left-1/2 after:bottom-[-2px] after:h-[2px] after:w-0
      after:-translate-x-1/2 after:rounded-full after:bg-primary
      after:transition-all after:duration-200

Active:   text-foreground after:w-10
Inactive: text-muted-foreground group-hover:text-primary group-hover:after:w-6
```

**Right area:**
```
justify-self-end w-auto md:w-[280px] md:min-w-[280px] flex justify-end
```

**Loading skeleton:**
```
h-8 sm:h-10 w-24 sm:w-full rounded-md border border-primary/20 bg-muted/40 animate-pulse
```

### Mobile Navigation
- No hamburger menu / sidebar
- Desktop nav is `hidden md:flex` (hidden on mobile)
- Mobile shows only brand + right area (wallet/USDC pill)

### Tab Navigation (Lend page - deposit/withdraw)
```
Container: inline-flex rounded-full bg-gray-100 p-1 text-xs
Active tab: bg-white shadow-sm font-medium px-3 py-1 rounded-full
Inactive tab: text-gray-500 px-3 py-1 rounded-full
```

### Tab Navigation (Terms & Conditions)
```
Container: inline-flex rounded-full bg-muted p-1 text-[11px] font-medium
Active: bg-background text-foreground shadow-xs px-3 py-1 rounded-full
Inactive: text-muted-foreground hover:text-foreground px-3 py-1 rounded-full
Disabled: text-muted-foreground opacity-60 cursor-not-allowed
```

---

## 7. Layout

### App Structure
```
min-h-screen flex flex-col
  Header (sticky top-0 z-50)
  div.relative.flex-1
    terminal-grid background (absolute inset-0 z-0 pointer-events-none)
    main.relative.z-10.container.mx-auto.px-1.max-w-4xl
```

### Max Widths

| Value           | Usage                                    |
|-----------------|------------------------------------------|
| `max-w-7xl`     | Header inner container                   |
| `max-w-4xl`     | Main content container                   |
| `max-w-5xl`     | Lend market outer wrapper                |
| `max-w-3xl`     | Page containers (Lend, Stats, Borrow)    |
| `max-w-md`      | Cards, panels, forms (most common)       |
| `max-w-sm`      | NotAvailable card, achievement dialog    |
| `max-w-xs`      | USDC header dialog                       |

### Section Spacing

| Pattern                          | Usage                              |
|----------------------------------|------------------------------------|
| `min-h-screen`                   | Full-height sections               |
| `min-h-[calc(100vh)]`           | Hero section                       |
| `min-h-[calc(100vh-8rem)]`      | Second section on home             |
| `min-h-[calc(100vh-10rem)]`     | Loading/boot screens               |
| `min-h-[60vh]`                  | NotLoggedIn, NotAvailable          |
| `h-[calc(100vh-140px)]`         | Lend market full height container  |
| `pt-6 pb-6` / `py-4` / `py-8`  | Page padding                       |
| `space-y-3`                      | Vertical spacing between sections  |
| `gap-3` / `gap-8`               | Grid/flex gaps                     |

### Grid System
- **2 columns:** `grid md:grid-cols-2 gap-8` (Home cards), `grid gap-3 sm:grid-cols-2` (Stats/Lend cards)
- **3 columns:** `grid grid-cols-3 gap-1.5 sm:gap-2` (Performance strip)
- **4 columns:** `grid grid-cols-4 gap-2` (KPI strips)
- **Header:** `grid grid-cols-[auto_auto] md:grid-cols-[auto_1fr_auto]`

### Responsive Breakpoints
- **Mobile-first** approach with `md:` and `sm:` modifiers
- `hidden md:flex` for desktop-only nav
- `hidden sm:flex` / `sm:hidden` for responsive mobile/desktop alternatives
- Font sizes: `text-[15px] md:text-sm` pattern for mobile-friendly inputs

### Container Pattern
```
container mx-auto px-1 max-w-4xl  (main)
container mx-auto w-full max-w-3xl  (page)
mx-auto w-full max-w-md px-4  (inner content)
```

---

## 8. Badges/Tags

### Badge Component (shadcn/ui)

**Base:**
```
inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium
w-fit whitespace-nowrap shrink-0
```

**Variants:**
- `default`: `bg-primary text-primary-foreground`
- `secondary`: `bg-secondary text-secondary-foreground`
- `destructive`: `bg-destructive text-white`
- `outline`: `text-foreground`

### Custom Badge Patterns

**CTA Badge (`.cta-badge`):**
```css
display: inline-flex; align-items: center; gap: .35rem;
padding: .25rem .55rem; font-size: .625rem; font-weight: 700;
background: var(--primary); color: var(--primary-foreground);
border-radius: 9999px;
animation: ring-pulse 1.8s infinite;
```

**Activity type badges:**
```
BORROW: px-1.5 py-[1px] rounded-full font-medium text-[10px] bg-orange-100 text-orange-700
REPAY/DEPOSIT: bg-green-100 text-green-700
DEFAULT/WITHDRAW: bg-red-100 text-red-700 (default) / bg-orange-100 text-orange-700 (withdraw)
```

**Status badges:**
```
On time: bg-emerald-100 text-emerald-800 rounded-full px-2.5 py-0.5 text-[11px] font-semibold
Overdue: bg-red-100 text-red-800
In default: border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 rounded-full shadow-sm
Early user: bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 rounded-full
```

**Mono tracking badges:**
```
font-mono text-[11px] tracking-[0.18em] text-muted-foreground
```

**Score chip:**
```
bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 rounded-full
```

**Achievement badge:**
```
bg-amber-900/5 px-2.5 py-1 rounded-full
text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900/80
```

**USDC pill (header):**
```
h-8 sm:h-10 px-2 sm:px-3 inline-flex items-center gap-1.5 sm:gap-2
rounded-md border border-primary/30 bg-muted/30 text-xs sm:text-sm
```

**USDC badge (debtor list):**
```
bg-[#2775CA]/10 px-2 py-0.5 text-[11px] rounded-full
```

---

## 9. Tables/Lists

### Activity Lists (VaultActivityList, BorrowRepayActivityList)

**Container:**
```
h-full overflow-y-auto space-y-1.5 pr-1 pb-2  (vault)
max-h-[220px] overflow-y-auto space-y-2 pr-1  (borrow/repay)
```

**Item:**
```
rounded-xl border border-gray-100 bg-gray-50 px-3 py-1.5/py-2
```

**Item layout:**
```
flex items-center justify-between
  Left: flex items-center gap-2
    [type badge] [address text-xs text-gray-600]
  Right: flex items-center justify-end gap-3 min-w-[140px]
    [time text-[11px] text-gray-500]
    [amount text-sm font-semibold text-gray-900] [UsdcIcon]
```

### Debtor List (Info page)
```
ul.flex.flex-col.gap-2
  li > div.rounded-xl.border.p-3.sm:p-4.bg-card/40.backdrop-blur
    In-default: ring-1 ring-red-500/30 bg-red-50/70
```

### Loan Term List (PullPanel screen 2)
```
space-y-2.5
  button.w-full.rounded-xl.border.px-3.5.py-3.text-left.transition-colors
    Active: border-orange-300 bg-orange-50 shadow-xs
    Inactive: border-border hover:border-orange-200/80 hover:bg-orange-50/60
```

### Collapsible sections (Supply/Withdraw panels)
```
Trigger: flex items-center justify-between w-full text-left cursor-pointer
  Icon + label on left, ChevronUp/Down on right
Content: mt-3 space-y-3
```

---

## 10. Animations/Transitions

### CSS Keyframe Animations

**Terminal blink:**
```css
@keyframes terminal-blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
.terminal-cursor::after { content:"_"; animation: terminal-blink 1s infinite; color: var(--primary); }
```

**Data stream:**
```css
@keyframes data-stream {
  0% { transform:translateY(100%); opacity:0 }
  10% { opacity:1 } 90% { opacity:1 }
  100% { transform:translateY(-100%); opacity:0 }
}
.data-stream { animation: data-stream 8s linear infinite; }
```

**Glitch effect:**
```css
@keyframes glitch { translate shifts of +/-2px over 5 steps }
.glitch-effect:hover { animation: glitch 0.3s ease-in-out; }
```

**QR shimmer:**
```css
@keyframes qr-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
.qr-skeleton-band { animation: qr-shimmer 1.1s linear infinite; }
```

**CTA nudge:**
```css
@keyframes nudgeX { 0%,100%{translateX(0)} 50%{translateX(2px)} }
.cta-nudge { animation: nudgeX 1.2s ease-in-out infinite; }
```

**Ring pulse:** Referenced in `.cta-badge { animation: ring-pulse 1.8s infinite; }`

### Tailwind Transitions

| Pattern                                        | Usage                          |
|------------------------------------------------|--------------------------------|
| `transition-all`                               | General, buttons               |
| `transition-colors`                            | Tabs, loan terms, links        |
| `transition-[border-color,box-shadow]`         | Inputs                         |
| `transition-[color,box-shadow]`                | Badges, textarea               |
| `transition-[width] duration-500 ease-out`     | Progress bars (XP, utilization, loan term) |
| `transition-transform duration-500 ease-in-out`| Sliding screens                |
| `transition-transform duration-300`            | Score bump animation           |
| `transition-opacity`                           | InfoTip hover-only reveal      |
| `animate-pulse`                                | Loading skeletons              |
| `animate-ping`                                 | Loading dots                   |
| `animate-spin`                                 | Spinner, Loader2 icon          |
| `animate-in / animate-out`                     | Dialog open/close              |
| `fade-in-0 / fade-out-0`                       | Dialog/tooltip fade            |
| `zoom-in-95 / zoom-out-95`                     | Dialog/tooltip zoom            |
| `slide-in-from-*`                              | Tooltip slide animations       |
| `duration-150`                                 | Nav label colors               |
| `duration-200`                                 | Nav underline, dialog content  |
| `duration-500`                                 | Sliding screens, progress bars |

### Terminal Hover Effect
```css
.terminal-hover { transition: all 0.2s ease; }
.terminal-hover:hover { background-color: rgba(234,88,12,0.05); transform: translateX(4px); }
```

### Score Bump Animation (JS-driven)
```
Normal: transform transition-transform duration-300
Bumped: scale-110 text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.75)]
Duration: 420ms timeout
```

### Level-Up Bar Animation (JS-driven)
```
prev% -> 100% -> 0% -> target%
Using transition-[width] duration-500 ease-out
With setTimeout delays of 500ms (fill) + 100ms (reset)
```

---

## 11. Icons

### Icon Library: Lucide React

All icons come from `lucide-react`. Icons used:

| Icon              | Where                          |
|-------------------|--------------------------------|
| `ArrowRight`      | Home CTA, nav                  |
| `ArrowLeft`       | PullPanel back button          |
| `ArrowLeftCircle` | Terms back button              |
| `Terminal`        | Home lender card               |
| `Database`        | Home borrower card             |
| `Plus`            | Header USDC add button         |
| `XIcon`           | Dialog close button            |
| `ChevronRight`    | UserJourneyBadge CTA nudge     |
| `ChevronDown/Up`  | Collapsible sections           |
| `Loader2`         | Spinner in buttons (animate-spin) |
| `Info`            | InfoTooltip trigger            |
| `Hourglass`       | Cooldown panel                 |
| `Trophy`          | Credit score showcase          |
| `TrendingUp`      | Performance strip (loans)      |
| `Target`          | Performance strip (on-time %)  |
| `Award`           | Performance strip (achievements), Achievement dialog |
| `Sparkles`        | Achievement dialog badge       |
| `Copy`            | Debtor list copy address       |

### Icon Sizes

| Size                  | Usage                         |
|-----------------------|-------------------------------|
| `h-3 w-3`            | ChevronRight in CTA badge     |
| `h-3.5 w-3.5`        | Info icon, copy icon, sparkles |
| `h-4 w-4`            | Most icons (buttons, cards)   |
| `h-5 w-5`            | Spinner, ArrowRight in CTA, ArrowLeftCircle |
| `h-6 w-6`            | Home card icons               |
| `h-7 w-7`            | Brand favicon                 |

### Custom SVG Icons

**UsdcIcon:** Custom SVG of USDC circle logo, fill `#3e73c4`, with dollar sign path in white. Available at sizes 14px (default), 19px.

**USDCIcon (Info page):** Alternate SVG with fill `#2775CA`.

---

## 12. Light/Dark Mode

### Implementation
- Uses `next-themes` via `ThemeProvider` component
- Custom variant: `@custom-variant dark (&:is(.dark *));`
- Dark mode activated by `.dark` class on root element

### Default Mode
- Not explicitly set in the theme provider (no `defaultTheme` prop visible)
- Light mode is the primary design target
- Most hardcoded colors (`bg-white`, `text-gray-500`, `bg-gray-50`, `bg-gray-100`) are light-mode only and do NOT have dark variants

### Dark Mode Coverage
- CSS variables are fully defined for dark mode
- shadcn/ui components respect dark mode via CSS variables
- Many page-level components (LendMarket, VaultStatsPanel, CumulativeMetricCard, VaultUtilizationBar, activity lists) use hardcoded light-mode colors (`bg-white`, `text-gray-500`, `text-gray-900`, `bg-gray-50`, `border-gray-100`) without dark equivalents
- Borrow page components use semantic variables (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`) that adapt to dark mode
- Special gradient cards (repay: amber, borrow: sky) use hardcoded light palette

---

## 13. Overall Aesthetic

### Visual Language

**Terminal/Crypto-Native Design:**
The design has a strong "terminal" / code-native identity. The brand name "LENDOOR" uses monospace font with a blinking cursor after it. The background features a subtle orange grid pattern (`.terminal-grid`) that reinforces the tech/hacker aesthetic. Text throughout uses monospace fonts (`mono-text` class) with wide letter-spacing (`tracking-[0.18em]`) for labels.

**Orange as Primary Brand Color:**
Orange (#ea580c / #F46A06 / orange-300) is the dominant accent color. It appears in:
- All primary buttons (orange-300 bg with orange-950 text)
- The grid background pattern
- Focus rings (orange-200/80)
- Active nav underlines
- The brand name color
- Chart lines and fills
- Progress bars
- The CTA badge with pulsing ring

**Clean Card-Based Layout:**
Content is organized in cards with generous padding and rounded corners (2xl/3xl). The layout is single-column centered (`max-w-md`) for most functional pages (Lend, Borrow, Stats), with a 2-column grid only on the home page feature cards.

**Gradient Cards for Semantic States:**
- **Sky gradient** (`from-sky-50 to-sky-100`): Borrow/pull amount card - represents available credit
- **Amber gradient** (`from-amber-50 to-amber-100`): Repay card and achievements - represents debt/rewards
- **Glow effects**: Subtle absolute-positioned blurred circles in corners for depth

**Gamification Layer:**
Credit scores, XP bars, achievements, and level-up animations create an engaging borrower experience. The XP bar uses a gradient from primary through amber-400 to amber-500. Achievements pop up in amber-themed dialogs with sparkle icons.

**Information Dense but Clean:**
Activity lists are compact with small type (10-11px), pill badges for types, and inline amounts. KPI strips use a 4-column grid with 14px height. Stats pages use white rounded cards with area charts.

**Mobile-First with Desktop Enhancement:**
- Inputs sized for mobile (15px, py-3.5)
- Navigation hidden on mobile
- Cards have responsive padding (`p-5 sm:p-6`)
- Sliding screen transitions for multi-step flows

**Sliding Screen Transitions:**
Multi-step onboarding flows use a 200%-width sliding mechanism (`flex w-[200%]` / `flex w-[300%]`) with GPU-accelerated transforms and 500ms ease-in-out transitions.

**Monospace Everywhere:**
Labels use monospace with UPPERCASE and wide letter-spacing, creating a consistent "terminal readout" feel for financial data.

### Design System Summary
- **Framework:** Tailwind CSS v4 (via `@import "tailwindcss"`) + shadcn/ui components
- **UI Library:** Radix UI primitives (Dialog, Tooltip, Popover, Separator, Slider, ScrollArea)
- **Component Patterns:** CVA (class-variance-authority) for variant-based components
- **Utility:** `cn()` function using `clsx` + `tailwind-merge`
- **Toasts:** Sonner (`richColors`, `position="top-center"`)
- **Router:** React Router DOM
- **Wallet:** RainbowKit + wagmi
- **i18n:** react-i18next with EN/ES locales
- **Charts:** Recharts (AreaChart)

### Loading State Patterns

**Boot/initializing loader:**
```
flex min-h-[calc(100vh-10rem)] w-full items-center justify-center
  flex items-center gap-3 text-l text-muted-foreground
    span.h-3.5.w-3.5.animate-ping.rounded-full.bg-primary/70
    span (label)
```

**Skeleton loader:**
```
h-8 sm:h-10 w-24 sm:w-40 rounded-md border border-primary/20 bg-muted/40 animate-pulse
```

**Button loading:** `Loader2` icon with `animate-spin` class, prepended to button text

### Dialog Pattern

**Dialog overlay:** `fixed inset-0 z-50 bg-black/50` with fade animation

**Dialog content:**
```
fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]
translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg
sm:max-w-lg
```
With zoom + fade animations on open/close.

**Close button:**
```
absolute top-4 right-4 h-9 w-9 rounded-full bg-background/80 shadow-sm opacity-80
hover:opacity-100
```

### Tooltip Pattern

**Content:**
```
bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs
```
With arrow: `bg-primary fill-primary size-2.5`

**InfoTip (custom):**
- Light variant: `bg-white text-neutral-900 border-primary/60`
- Default variant: `bg-popover text-popover-foreground border-border`
- Max width: `max-w-[320px]`, uses `mono-text`
- Auto-detects touch vs desktop: uses Popover on touch, Tooltip on desktop

### Progress Bar Pattern
```
Container: h-2/2.5 w-full overflow-hidden rounded-full bg-background/gray-100
Fill: h-full rounded-full transition-[width] duration-500 ease-out [color]
```
Colors vary by context:
- XP: `bg-gradient-to-r from-primary via-amber-400 to-amber-500`
- Utilization: `bg-[#F46A06]`
- Loan term: `bg-emerald-500` (early) -> `bg-amber-400` (mid) -> `bg-orange-500` (late) -> `bg-red-500` (overdue)

### Slider Component
```
Track: h-2 rounded-full bg-orange-100
Range: h-full bg-orange-300
Thumb: h-4 w-4 rounded-full border-2 border-orange-300 bg-background
```
