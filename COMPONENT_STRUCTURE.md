# Tutorial Modal Component Structure

## Visual Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ .guidance-panel                                   │  │
│  │                                                   │  │
│  │  ╔════════════════════════════════════════════╗  │  │
│  │  ║ .guidance-panel-header                     ║  │  │
│  │  ║                                            ║  │  │
│  │  ║  ♟  Welcome to OpeningAnalyzer       [✕]  ║  │  │
│  │  ║                                            ║  │  │
│  │  ║  ●●●●●●●● (progress dots) .......... 1/8  ║  │  │
│  │  ║                                            ║  │  │
│  │  ╚════════════════════════════════════════════╝  │  │
│  │                                                   │  │
│  │  ╔════════════════════════════════════════════╗  │  │
│  │  ║ .guidance-panel-body (scrollable)          ║  │  │
│  │  ║                                            ║  │  │
│  │  ║  This guide will walk you through each     ║  │  │
│  │  ║  section of the app...                     ║  │  │
│  │  ║                                            ║  │  │
│  │  ║  ┌────────────────────────────────────┐   ║  │  │
│  │  ║  │ TIP                                │   ║  │  │
│  │  ║  │ You can reopen this guide...      │   ║  │  │
│  │  ║  └────────────────────────────────────┘   ║  │  │
│  │  ║                                            ║  │  │
│  │  ╚════════════════════════════════════════════╝  │  │
│  │                                                   │  │
│  │  ╔════════════════════════════════════════════╗  │  │
│  │  ║ .guidance-panel-footer                     ║  │  │
│  │  ║                                            ║  │  │
│  │  ║  Skip tour    [← Back]    [Next →]         ║  │  │
│  │  ║                                            ║  │  │
│  │  ╚════════════════════════════════════════════╝  │  │
│  │                                                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Panel Container (.guidance-panel)
**Position**: Fixed, bottom-center  
**Dimensions**: 620px max, responsive  
**Animations**: Entrance (500ms), Exit (300ms)  
**Effects**: Gradient bg, multi-layer shadow, backdrop blur  

```css
position: fixed
bottom: 2rem
left: 50%
transform: translateX(-50%)
width: min(90vw, 620px)
background: linear-gradient(135deg, #111420 0%, #0f1118 100%)
box-shadow: 0 32px 80px rgba(0,0,0,0.8), ...
animation: guidance-entrance 0.5s cubic-bezier(0.16, 1, 0.3, 1)
```

---

### Header Section (.guidance-panel-header)
**Contains**: Icon, Title, Close button, Progress dots  
**Padding**: 1.5rem  
**Animation**: Staggered fadeSlideDown (delay: 0.05s)  

#### Icon (.guidance-panel-icon)
- Font size: 1.8rem (large, prominent)
- Drop shadow for depth
- Chess piece symbols (♟ ♔ ♚ etc.)

#### Title (.guidance-panel-title)
- Font: Cormorant Garamond (serif)
- Size: 1.45rem (was 1.15rem)
- Weight: 700 (bold)
- Line-height: 1.25 (tight, elegant)

#### Close Button (.guidance-close)
- Icon: ✕ (or X)
- Default: Muted grey (#5c6180)
- Hover: Gold (#d9b85c) + Background glow
- Animation: **Rotate 90°** on hover (unique detail!)
- Transition: 0.2s all

#### Progress Dots (.guidance-step-track)
- Layout: Flex row with gaps
- Responsive: Wraps on mobile

**Dot States**:
- **Default** (upcoming): Border with soft fill
- **Past** (completed): Solid darker color
- **Active** (current): Gold + pulse animation
- **Locked** (requires wizard): Faded, disabled
- **Hover**: Scale 1.35 + glow effect

---

### Body Section (.guidance-panel-body)
**Purpose**: Main content area (scrollable)  
**Padding**: 1.5rem  
**Max-height**: Adaptive based on viewport  
**Animation**: Staggered fadeSlideUp (delay: 0.1s)  
**Scrolling**: Custom styled scrollbar  

#### Description (.guidance-description)
- Font: Georgia/Garamond serif
- Size: 1.025rem (was 0.875rem) - 15% larger
- Line-height: 1.8 (very readable)
- Color: #d4d0c5 (warm light text)
- Margin: 0 0 1.25rem

#### Tip Box (.guidance-tip)
- Background: Gradient (rgba(201,168,76,0.08) → 0.03)
- Border: 1px gold tinted
- Left accent: 3px gold gradient bar
- Padding: 1rem 1.2rem
- Border-radius: 10px
- Hover: Lightens + adds shadow
- Transition: 0.3s smooth

**Tip Label** (.guidance-tip-label):
- Font: JetBrains Mono (monospace)
- Size: 0.7rem uppercase
- Background: Gold badge
- Padding: 0.25rem 0.6rem

#### Custom Scrollbar
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: rgba(201, 168, 76, 0.25);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(201, 168, 76, 0.4);
}
```

---

### Footer Section (.guidance-panel-footer)
**Contains**: Skip button, Navigation buttons (Back/Next)  
**Padding**: 1rem 1.75rem 1.5rem  
**Animation**: Staggered fadeSlideUp (delay: 0.15s)  
**Flex**: Space-between with wrapping  

#### Skip Button (.guidance-skip-btn)
- Style: Minimal text link
- Color: #7a85b8 (muted)
- Hover: Gold (#d9b85c) + background glow
- Size: 0.85rem
- Order: 3 (rightmost on desktop)

#### Back Button (.guidance-back-btn)
- Style: Ghost button
- Background: rgba(255,255,255,0.05)
- Border: 1px rgba(255,255,255,0.1)
- Hover: Lightens + gold tint + translateX(-2px)
- Transition: 0.2s smooth
- Size: 0.9rem
- Padding: 0.55rem 1.1rem

#### Next Button (.guidance-next-btn) [PRIMARY CTA]
- Style: **Bold gradient background**
- Background: Linear gradient(135deg, #c9a84c → #d9b75c)
- Color: #0b0d14 (dark on gold)
- Font: JetBrains Mono uppercase
- Weight: 700
- Shadow: 0 4px 16px rgba(201,168,76,0.25)
- Hover: Lighter gradient + lift (translateY -2px) + bigger glow
- Active: Settles back down
- Disabled: Dark grey, no glow
- Transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1)

#### Wizard Pending (.guidance-wizard-pending)
- Shows when step requires wizard completion
- Contains disabled Next button
- Full-width on mobile
- Order: 1 (above buttons)

---

## Animation Timings

### Entrance Cascade
```
Time  Component
0ms   Panel scales in (0.95 → 1.0)
50ms  Header fades in + slides down
100ms Body fades in + slides up
150ms Footer fades in + slides up
500ms Complete
```

### Interactions
```
Element          Duration  Easing                        Effect
Close button     0.2s      ease (color + rotate)         Rotates 90°
Next button      0.25s     cubic-bezier(0.16,1,0.3,1)   Lifts + glow
Back button      0.2s      cubic-bezier(0.16,1,0.3,1)   Nudges left
Tip box          0.3s      cubic-bezier(0.16,1,0.3,1)   Elevates
Progress dots    0.25s     cubic-bezier(0.16,1,0.3,1)   Scales + glow
```

---

## Responsive Breakpoints

### Desktop (880px+)
```
┌────────────────────────────────┐
│       Panel (620px max)        │
│  ┌──────────────────────────┐  │
│  │ Large text, full padding │  │
│  │ Horizontal button layout │  │
│  │ All animations at 500ms  │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

### Tablet (641px - 880px)
```
┌──────────────────────────┐
│   Panel (560px max)      │
│ Slightly reduced sizing  │
│ Touch-optimized targets  │
└──────────────────────────┘
```

### Mobile (481px - 640px)
```
┌──────────┐
│ 85vw max │
│          │
│ Buttons  │
│ stack    │
│ vertically
│          │
└──────────┘
```

### Small Mobile (< 480px)
```
┌────────────────┐
│ calc(100vw-1rem)
│ Minimal padding
│ Single column
│ 40px+ touch targets
└────────────────┘
```

---

## Color Palette

| Element | Default | Hover | Active | Disabled |
|---------|---------|-------|--------|----------|
| Text | #d4d0c5 | - | - | - |
| Gold Accent | #c9a84c | #d9b85c | - | - |
| Muted | #7a85b8 | - | - | - |
| Background | #111420 | - | - | - |
| Border | #2e3560 | - | - | - |
| Next Button | #c9a84c | #d9b75c | - | #3a4570 |
| Close Button | #5c6180 | #d9b85c | - | - |
| Disabled Text | #888 | - | - | - |

---

## Key Class Names Reference

```
.guidance-panel                  // Main container
  .guidance-panel-header         // Title section
    .guidance-panel-title-row    // Icon + title + close
      .guidance-panel-icon       // Chess piece
      .guidance-panel-title      // Text title
      .guidance-close            // X button
    .guidance-step-track         // Progress dots row
      .guidance-dot              // Individual dot
      .guidance-dot--active      // Active state
      .guidance-dot--past        // Completed
      .guidance-dot--locked      // Requires wizard
      .guidance-step-count       // "1 / 8" text
  
  .guidance-panel-body           // Content area
    .guidance-description        // Main text
    .guidance-tip                // Tip box
      .guidance-tip-label        // "TIP" badge
  
  .guidance-panel-footer         // Buttons
    .guidance-skip-btn           // Skip link
    .guidance-nav-buttons        // Back/Next container
      .guidance-back-btn         // Back button
      .guidance-next-btn         // Next button (primary)
    .guidance-wizard-pending     // Wizard waiting message
```

---

## State Classes

| Class | Applied When |
|-------|--------------|
| `.exiting` | Close/skip initiated, triggers exit animation |
| `.guidance-dot--active` | Current step |
| `.guidance-dot--past` | Completed steps |
| `.guidance-dot--locked` | Pending wizard completion |
| `:disabled` | Wizard pending or last step |

---

## Performance Considerations

✓ **GPU-Accelerated**: All animations use CSS transforms
✓ **No Repaints**: Transforms don't trigger layout recalcs
✓ **Efficient Scrollbar**: Custom styling doesn't impact performance
✓ **Positioned Fixed**: Doesn't participate in document flow
✓ **Backdrop Filter**: Blurs only this element, not entire page

---

## Accessibility

✓ **ARIA**: role="dialog", aria-modal="true", aria-label
✓ **Focus States**: Keyboard navigation supported
✓ **Color Contrast**: Text meets WCAG AA standards
✓ **Touch Targets**: All buttons 40px+ height on mobile
✓ **Semantic HTML**: Proper button and heading elements

