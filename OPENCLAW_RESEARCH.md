# OpenClaw Design Research

## Project Overview

OpenClaw is an open-source autonomous AI agent platform (formerly ClawdBot/MoltBot) created by Peter Steinberger. It serves as a personal AI assistant that runs locally and integrates with LLMs (Claude, DeepSeek, GPT). The branding centers on a lobster mascot ("Molty") with the tagline "The AI that actually does things." The project uses Primer React as its foundational UI library with custom CSS enhancements.

---

## 1. Color Palette

### Brand Colors (from Brandfetch)
| Role | Name | Hex | Usage |
|------|------|-----|-------|
| **Primary Accent** | Persian Red | `#C83232` | Primary brand color, key accents |
| **Secondary/Light** | Cinnabar | `#EA4647` | Lighter accent, hover states |
| **Dark Background** | Ebony | `#050811` | Dark mode backgrounds |
| **Logo Base** | Near Black | `#080808` | Logo dominant color |

### Inferred UI Colors
| Role | Estimated Hex | Usage |
|------|--------------|-------|
| **CTA/Highlight** | `#FF6B35` | Call-to-action buttons, links (lobster orange) |
| **Code Block BG** | `#1E1E1E` | Code snippet backgrounds |
| **Secondary Text** | `#666666` - `#999999` | Mid-gray for body/secondary text |
| **Light BG** | `#FFFFFF` / off-white | Light mode background |

### Theme System
- **Dark mode** (default): Deep dark backgrounds (#050811) with light text
- **Light mode**: Inverted contrast, dark text on light backgrounds
- Theme toggle with localStorage persistence
- CSS custom properties (`--color-accent-fg`) for dynamic theming

---

## 2. Typography

### Font Stack
- **Primary/Body**: System font stack (-apple-system, Segoe UI, or similar sans-serif)
- **Monospace**: Monaco / Courier New for code blocks and CLI commands
- Referenced as `var(--font-body)` in CSS custom properties

### Hierarchy
- **Headings (H1-H3)**: Multiple weights and sizes, clean and prominent
- **Body text**: Regular weight, mid-gray (#666-#999) for secondary content
- **Bylines/Meta**: Smaller text with publication date, read time
- **Code**: Monospace with syntax highlighting, theme-aware styling

### Characteristics
- Clean, minimal letter spacing
- High readability focus
- Semantic heading hierarchy

---

## 3. Component Patterns

### Navigation
- Minimal top bar with theme toggle (sun/moon icons)
- Simple link-based navigation (Home, Blog, Showcase, Shoutouts, Trust)
- Back navigation links on subpages
- No hamburger menu - keeps it simple

### Buttons & CTAs
- Prominent download/installation buttons with orange/red accents
- Copy-to-clipboard for code blocks
- "Share on X", "Browse Skills", "Join Discord" action buttons
- "View on X" social proof links

### Cards
- **Testimonial cards**: Avatar (circular via unavatar.io) + handle + category tags + heart count + description
- **Feature cards**: 6 equal-width cards in 2-3 column grid
- **Documentation cards**: Titled cards with icon support (e.g., "Get Started", "Run the Wizard")
- **Showcase cards**: User avatar + emoji-coded category tags + engagement metrics + optional screenshots

### Code Blocks
- Dark background (#1E1E1E)
- Theme-aware styling (min-light / min-dark themes)
- Syntax highlighting for bash/shell, JSON5
- Integrated copy functionality
- Mermaid flowchart diagram support with light/dark variants

### Category Tags
- Emoji-coded categories (lightning for Automation, computer for Developer, etc.)
- Adds personality while maintaining clarity

---

## 4. Layout Structure

### Grid System
- Full-width sections with max-width centered containers
- Feature grid: 6 cards in 2-3 column responsive layout
- Testimonials: Scrollable/flexible grid
- Documentation: Three-column card layouts for quick navigation
- Showcase: Single-column vertical feed

### Spacing
- Generous vertical padding: 40-80px between sections
- Internal component gutters: 16-32px
- 8px baseline grid for consistency
- Clean whitespace for breathing room

### Page Architecture
- **Hero section**: Large heading + subheading + CTA (centered)
- **Feature grid**: Equal-width cards highlighting capabilities
- **Social proof**: Community testimonials
- **Footer**: Navigation links + creator attribution ("Built by Molty" with lobster emoji)

### Responsive
- Responsive image srcsets for mobile optimization
- Mobile-first approach indicated by design system tools (Tailwind CSS, Shadcn/ui integration)

---

## 5. Animations & Effects

- **Theme toggle**: Smooth CSS transitions between light/dark modes
- **Smooth scrolling**: Enabled for anchor links
- **Hover states**: Subtle color shifts on interactive elements
- **Minimal motion philosophy**: No autoplay animations
- Spinner animations synchronized across components
- Generally restrained - favors usability over flashiness

---

## 6. Overall Aesthetic

### Visual Language
- **Modern, playful yet professional** - quirky lobster branding balanced with clean, developer-focused design
- **Community-driven**: Heavy emphasis on testimonials and user showcases
- **Dark-first**: Dark mode as default reflects developer/tech audience preference
- **Minimal and functional**: Clean lines, generous whitespace, no unnecessary decoration

### Mood
- Futuristic yet approachable
- Celebrates AI capability without intimidation
- Open-source transparency (GitHub links prominent)
- "Night owl energy" as described in their identity docs

### Brand Personality
- Lobster mascot ("Molty") provides warmth and humor
- Identity shows up in "small moments" - passing references, emoji usage
- "More running joke than mascot" - subtle, not overwhelming
- Confident, sardonic, curious tone

### What Makes It Distinctive
1. **Lobster/crustacean theme** as a unifying metaphor (growth through molting/shedding shells)
2. **Dark mode priority** with seamless theme switching
3. **Red/orange accent palette** (Persian Red #C83232, Cinnabar #EA4647, Lobster Orange ~#FF6B35)
4. **Community-first layout** - testimonials and showcases are central, not peripheral
5. **Developer-native aesthetics** - code blocks, CLI commands, and technical content treated as first-class citizens
6. **Emoji-enhanced UX** - strategic use of emoji for categorization and personality without being unprofessional

---

## 7. Key Pages Description

### Homepage (openclaw.ai)
- Hero with large heading, tagline "The AI that actually does things", and install CTA
- Feature grid showcasing capabilities (6 cards)
- Community testimonials section with avatar-based cards
- Theme toggle in top navigation
- Footer with links and "Built by Molty" attribution

### Documentation (docs.openclaw.ai)
- Card-based navigation hub
- Hero with branding and tagline
- Three-column quick-start cards
- Hierarchical topic organization (Channels, Nodes, Configuration, Security)
- Mermaid diagram support for technical illustrations

### Blog
- Clean article layout with author byline and read time
- Logo image near title
- Centered content flow with clear heading hierarchy
- Integrated code blocks and security links
- Back-to-blog navigation

### Showcase
- Vertical feed of user testimonials/projects
- Modular cards with avatars, handles, category tags, heart counts
- Screenshots/media integration
- Social CTAs (Share on X, Browse Skills, Join Discord)

---

## Summary for Design Inspiration

**Key takeaways for secondary inspiration:**
- Dark-first design with clean theme switching
- Red/coral/orange accent palette on dark backgrounds creates energy
- Minimal navigation, content-focused layouts
- Card-based components with subtle differentiation
- Community/social proof as a core design element
- Developer-friendly code block styling
- Playful brand personality through subtle touches (mascot, emoji), not through visual excess
- System fonts for performance, monospace for code
- Generous spacing with 8px baseline grid
- Restrained animations - smooth transitions only
