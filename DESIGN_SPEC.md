# Design Specifications: Matte Grey Sidebar + Matte Black Background

## Color Palette (OKLCH)

### Primary Colors
```css
/* Matte Black - Main Background */
--background: oklch(0.08 0 0);
/* Deep, non-reflective black - like Vercel dashboard */

/* Matte Grey - Sidebar */
--sidebar: oklch(0.15 0 0);
/* Subtle grey, non-reflective - Firebase console style */

/* Text Colors */
--foreground: oklch(0.95 0 0);
--sidebar-foreground: oklch(0.90 0 0);
```

### Accent Colors (Vercel Blue)
```css
--primary: oklch(0.65 0.15 250);
/* Vercel's signature blue for interactive elements */
--primary-foreground: oklch(0.98 0 0);
```

### Supporting Colors
```css
/* Borders & Dividers */
--border: oklch(0.20 0 0);
--sidebar-border: oklch(0.25 0 0);

/* Muted Areas */
--muted: oklch(0.12 0 0);
--muted-foreground: oklch(0.60 0 0);

/* Input Fields */
--input: oklch(0.12 0 0);

/* Cards & Surfaces */
--card: oklch(0.12 0 0);
--card-foreground: oklch(0.95 0 0);
```

## Visual Reference

### Sidebar (Matte Grey)
- **Background**: `oklch(0.15 0 0)` - Matte grey
- **Width**: 16rem (256px) expanded, 3rem (48px) collapsed
- **Border**: Right edge only, `oklch(0.25 0 0)`
- **Text**: `oklch(0.90 0 0)` - High contrast for readability
- **No shadows, no gradients** - Pure matte finish

### Main Content (Matte Black)
- **Background**: `oklch(0.08 0 0)` - Deep matte black
- **Text**: `oklch(0.95 0 0)` - Near-white for contrast
- **Max Width**: 768px centered
- **Padding**: 1rem (16px) standard

### Interactive Elements
- **Buttons**: Vercel blue (`oklch(0.65 0.15 250)`) on hover/active
- **Input Fields**: Matte dark (`oklch(0.12 0 0)`) with subtle border
- **Focus States**: Vercel blue outline, 2px width
- **Hover States**: Slight brightness increase (oklch lightness +0.05)

## Typography

### Font Stack
```css
font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

### Sizes
- **Base**: 14px (0.875rem)
- **Small**: 12px (0.75rem)
- **Large**: 16px (1rem)
- **Heading**: 20px (1.25rem)

### Weights
- **Regular**: 400
- **Medium**: 500
- **Bold**: 700

## Spacing System (8px Grid)

```
0.5rem = 8px   (xs)
1rem   = 16px  (sm)
1.5rem = 24px  (md)
2rem   = 32px  (lg)
3rem   = 48px  (xl)
4rem   = 64px  (2xl)
```

## Component Specifications

### Sidebar
- **Padding**: 1rem (16px)
- **Item Height**: 2.5rem (40px)
- **Icon Size**: 1.25rem (20px)
- **Gap between items**: 0.25rem (4px)

### Chat Interface
- **Input Height**: 3rem (48px)
- **Border Radius**: 0.5rem (8px)
- **Message Padding**: 1rem (16px)
- **Message Gap**: 1rem (16px)

### Buttons
- **Height**: 2.5rem (40px)
- **Padding**: 0.75rem 1.5rem (12px 24px)
- **Border Radius**: 0.5rem (8px)
- **Font Size**: 14px

## Effects & Transitions

### No Effects
- ❌ No box shadows
- ❌ No gradients
- ❌ No blur effects
- ❌ No glows

### Allowed Effects
- ✅ Smooth transitions (150ms ease)
- ✅ Subtle borders (1px solid)
- ✅ Focus outlines (2px, Vercel blue)
- ✅ Opacity changes on hover

## Vercel-Style Patterns

### Input Fields
- Rounded corners (8px)
- Subtle background (matte dark)
- Thin border (1px)
- Focus: Blue outline, no shadow

### Buttons
- Rounded corners (8px)
- Solid background (Vercel blue)
- No border
- Hover: Slight brightness increase

### Cards/Surfaces
- Rounded corners (8px)
- Matte dark background
- No shadow
- Subtle border if needed

## Accessibility

### Contrast Ratios
- **Text on matte black**: 15:1 (WCAG AAA)
- **Text on matte grey**: 12:1 (WCAG AAA)
- **Vercel blue on white**: 4.5:1 (WCAG AA)

### Focus Indicators
- 2px solid outline
- Vercel blue color
- Visible on all interactive elements

### Keyboard Navigation
- Tab order: Sidebar → Input → Send → Messages
- Enter to send message
- Escape to clear input

