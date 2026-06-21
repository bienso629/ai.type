---
name: Editorial Muse
colors:
  surface: '#fcf9f5'
  surface-dim: '#dcdad6'
  surface-bright: '#fcf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ef'
  surface-container: '#f0ede9'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e5e2de'
  on-surface: '#1c1c1a'
  on-surface-variant: '#444748'
  inverse-surface: '#31302e'
  inverse-on-surface: '#f3f0ec'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1e1f'
  on-tertiary-container: '#748788'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#d2e6e7'
  tertiary-fixed-dim: '#b6cacb'
  on-tertiary-fixed: '#0b1e1f'
  on-tertiary-fixed-variant: '#374a4b'
  background: '#fcf9f5'
  on-background: '#1c1c1a'
  surface-variant: '#e5e2de'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 64px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max-width: 1280px
  gutter: 32px
  margin-desktop: 64px
  margin-mobile: 24px
  stack-lg: 48px
  stack-md: 24px
  stack-sm: 12px
---

## Brand & Style
The design system is anchored in the concept of "The Digital Atelier"—a space that feels curated, intentional, and high-end. It targets creative directors, writers, and gallery managers who view content as art rather than data. 

The aesthetic leans heavily into **Modern Minimalism** with **Editorial** sensibilities. It prioritizes the "luxury of space," using generous margins to allow content to breathe. The emotional response is one of calm, focused sophistication, moving away from the frantic nature of traditional SaaS toward the rhythmic pacing of a premium printed journal.

## Colors
The palette is built on a foundation of "warm parchment" to eliminate the clinical glare of pure white.
- **Surface (#FCF9F5):** The primary background color, providing a soft, organic feel.
- **Primary (#1A1A1A):** A deep charcoal used for maximum legibility in body text and primary UI actions.
- **Secondary (#C5A059):** A muted gold used sparingly for focus states, special accents, or premium markers.
- **Muted Surface (#F2EDE4):** Used for subtle container nesting and secondary background areas.

## Typography
Typography is the cornerstone of this design system. It uses a high-contrast pairing:
- **Serif (Playfair Display):** Reserved for headings and expressive moments. It should feel authoritative and classic.
- **Sans-Serif (Inter):** Used for all functional text, body copy, and UI controls to ensure modern readability and a clean "workspace" feel.
- **Spacing:** Body text utilizes an expanded line-height (1.6-1.7) to improve the reading experience and reinforce the editorial tone.

## Layout & Spacing
This system employs a **Fixed Grid** philosophy for desktop to maintain a "center-stage" feel for content. 
- **Grid:** A 12-column grid with wide 32px gutters to prevent content crowding.
- **Vertical Rhythm:** Elements follow a strict 8px baseline, but spacing between major sections is exaggerated (using `stack-lg`) to create distinct visual chapters.
- **Reflow:** On mobile, margins reduce to 24px, and typography scales down to prevent excessive wrapping of the serif headlines.

## Elevation & Depth
Depth is handled with extreme subtlety to maintain a flat, paper-like quality.
- **Tonal Layering:** Use slightly darker fills (#F2EDE4) instead of shadows for most container separations.
- **Shadows:** When necessary (e.g., floating menus), use an "Ambient Whisper" shadow: `0px 12px 32px rgba(26, 26, 26, 0.04)`.
- **Outlines:** Use 1px solid borders in a very low-contrast color (#E5E0D8) for input fields and card boundaries.

## Shapes
The design system uses "Soft" geometry. 
- **Radius:** 4px (0.25rem) is the standard for buttons and inputs. This provides just enough softness to feel modern without losing the structured, professional look of a traditional broadsheet or gallery catalog.
- **Images:** Content imagery should use the same 4px radius or remain sharp (0px) to emphasize the photography's edges.

## Components
- **Buttons:** Primary buttons are solid Charcoal (#1A1A1A) with white Inter text. Secondary buttons are "Ghost" style with a 1px border. No heavy gradients or 3D effects.
- **Inputs:** Minimalist bottom-border only or very light 1px frames. Focus states use the Secondary Gold color for the cursor and a subtle underline transition.
- **Lists:** Editorial list items feature increased vertical padding (24px) and use thin 1px horizontal dividers.
- **Cards:** Cards are often borderless, relying on the Muted Surface color (#F2EDE4) or generous whitespace to define their bounds.
- **Iconography:** Use ultra-thin (1pt or 1.5pt) stroke icons. Icons should be functional but recessive, never distracting from the text.
- **Chips/Labels:** Small, all-caps labels with wide letter spacing, used for categorizing content or status indicators.