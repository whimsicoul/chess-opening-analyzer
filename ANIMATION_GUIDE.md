# Tutorial Animation & Flow Guide

## Animation Sequence

### Entrance (Opening Modal)
```
Timeline:
0ms    ┌─ Panel enters: scale 95% → 100%, slide up from below
       │  opacity 0 → 1
       │
150ms  │  Header fades in with downward slide
       │
200ms  │  Body content fades in with upward slide
       │
300ms  │  Footer fades in with upward slide
       │
500ms  └─ Complete: All elements visible & in position
```

**Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (snappy, confident)

---

## Exit (Closing Modal)

### Smooth Close Animation
```
Timeline:
0ms    ┌─ User clicks close/skip/done
       │
30ms   │  Panel scales: 100% → 95%
       │  opacity 1 → 0
       │  slides down slightly
       │
300ms  └─ Modal removed from DOM
       
```

**Easing**: Same cubic-bezier (consistent feel)

---

## Interactive Micro-interactions

### Close Button (✕)
```
Default State:
- Color: #5c6180 (muted grey)
- Transform: rotate(0deg)

Hover State:
- Color: #d9b85c (golden)
- Background: rgba(201, 168, 76, 0.1) (subtle glow)
- Transform: rotate(90deg) ← Unique! Shows intent
- Transition: 0.2s all

Click State:
- Transform: rotate(90deg) scale(0.95)
- Visual feedback: Size decreases slightly
```

---

### Next Button (CTA Primary)
```
Default State:
- Background: Linear gradient (#c9a84c → #d9b75c)
- Color: #0b0d14 (dark text on gold)
- Shadow: 0 4px 16px rgba(201, 168, 76, 0.25)

Hover State:
- Background: Linear gradient (#d9b75c → #e5c574) [lighter]
- Transform: translateY(-2px) [lifts up]
- Shadow: 0 8px 28px rgba(201, 168, 76, 0.35) [bigger glow]
- Transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1)

Active/Click State:
- Transform: translateY(0) [settles back down]
- Shadow: 0 2px 8px rgba(201, 168, 76, 0.2) [smaller]
- Visual feedback: Confident button press
```

---

### Back Button (Soft Secondary)
```
Default State:
- Background: rgba(255, 255, 255, 0.05)
- Border: 1px solid rgba(255, 255, 255, 0.1)
- Color: #d4d0c5 (light tan text)

Hover State:
- Background: rgba(255, 255, 255, 0.08) [slightly lighter]
- Border: rgba(201, 168, 76, 0.3) [golden tint]
- Color: #f5f1e8 [brighter]
- Transform: translateX(-2px) [subtle left nudge]
- Transition: 0.2s cubic-bezier(0.16, 1, 0.3, 1)

Active/Click State:
- Transform: translateX(-2px) scale(0.97)
- Visual feedback: Pressed feeling
```

---

### Progress Dots
```
Inactive (Upcoming):
- Border: 1.5px solid #3a4570
- Background: rgba(62, 68, 104, 0.4) (subtle fill)
- Size: 8px diameter

Hover (Clickable):
- Border: #7a85b8 (brighter)
- Transform: scale(1.35)
- Box-shadow: 0 0 8px rgba(201, 168, 76, 0.2)
- Transition: 0.25s cubic-bezier(...)

Past (Completed):
- Background: #3a4570 (solid darker)
- Border: #4a5590 (matches background)

Active (Current Step):
- Background: #c9a84c (golden)
- Border: #d9b85c (lighter gold)
- Transform: scale(1.35)
- Box-shadow: 0 0 12px rgba(201, 168, 76, 0.4)
- Animation: dotPulse 2s infinite ← Breathing effect
  
  Pulse Animation:
  0%, 100%: shadow 0 0 12px (base)
  50%:      shadow 0 0 20px (peaks)
```

---

### Tip Box
```
Default State:
- Background: Linear gradient (rgba(201, 168, 76, 0.08) → 0.03)
- Border: 1px solid rgba(201, 168, 76, 0.2)
- Left border: 3px solid golden gradient
- Border-radius: 10px
- Padding: 1rem 1.2rem

Hover State:
- Background: Gradient gets lighter (0.12 → 0.05)
- Border: rgba(201, 168, 76, 0.3) [more golden]
- Box-shadow: 0 8px 24px rgba(201, 168, 76, 0.08)
- Transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1)
- Visual feedback: Content elevated on interaction
```

---

## Position Management

### Collision Detection
When user opens modal on a page with interactive elements:

```javascript
// Pseudo-code logic
if (panelRect overlaps targetRect) {
  // Panel would block chess board/input
  if (canMoveUp) {
    moveUp = targetRect.bottom - panelRect.top + 20px padding
    panel.transform = translateY(-${moveUp}px)
  }
}

if (panelRect.bottom > viewportHeight) {
  // Too close to bottom edge
  moveUp = panelRect.bottom - viewportHeight + 20px
  panel.transform = translateY(-${moveUp}px)
}
```

**Result**: Modal intelligently repositions to avoid blocking interactive content.

---

## Responsive Breakpoints

### Desktop (880px+)
```
- Panel width: 620px max
- Font sizes: 1.025rem body, 1.45rem title
- Padding: 1.5-1.75rem generous spacing
- All micro-interactions active
- Smooth 0.5s entrance animation
```

### Tablet (641px - 880px)
```
- Panel width: 560px max
- Font sizes: 0.975rem body, 1.35rem title
- Padding: 1.25-1.5rem slightly reduced
- All features work, slightly more compact
- Touch-friendly buttons
```

### Mobile (481px - 640px)
```
- Panel width: 85vw (responsive to screen)
- Font sizes: 0.95rem body, 1.2rem title
- Padding: 1rem-1.25rem
- Buttons stack vertically if needed
- Scrollable body if content overflows
- Max-height: 75vh (prevent covering entire screen)
```

### Small Mobile (< 480px)
```
- Panel width: calc(100vw - 1rem) (nearly full width)
- Font sizes: 0.9rem body, 1.1rem title
- Padding: 0.9-1rem minimal but readable
- Single-column button layout
- All interactive targets 40px+ height
- Optimized for thumbs/touch
```

---

## Easing Curves Explained

### Main Easing: `cubic-bezier(0.16, 1, 0.3, 1)`

This curve is **energetic but refined**:
- Starts slow (0.16 / early acceleration)
- Overshoots peak (1.0 / bouncy nature)
- Settles quickly (0.3 / confident landing)
- **Feel**: Confident, playful, not robotic

Graph:
```
       ╱╱    ← Bouncy overshoot
      ╱ ╲
     ╱   ╲   ← Quick settle-down
    ╱     ╲
   ╱       ╲╲ ← Final landing
  0         1
```

**Used for**: Entrance, buttons, progress dots

---

## Timing Summary

| Element | Entrance | Exit | Interaction |
|---------|----------|------|-------------|
| Panel | 500ms | 300ms | - |
| Header | 500ms @ 0.05s | - | 0.2s hover |
| Body | 500ms @ 0.1s | - | - |
| Footer | 500ms @ 0.15s | - | - |
| Buttons | - | - | 0.25s |
| Dots | - | - | 0.25s |
| Tips | - | - | 0.3s |
| Close btn | - | - | 0.2s rotate |

---

## Why These Choices?

### 500ms Entrance
- **Fast enough**: Doesn't feel sluggish
- **Slow enough**: User sees the motion, feels intentional
- **Staggered**: Creates visual rhythm and polish

### 300ms Exit
- **Quick**: Confirms action immediately
- **Not jarring**: Still feels smooth, not teleporting
- **Complementary**: ~60% of entrance time (feels balanced)

### 0.2-0.3s Hover Effects
- **Immediate**: User sees feedback right away
- **Not too fast**: Readable, not confusing
- **Standard UX**: Matches web conventions

### Golden Accent Colors
- **Consistent**: Matches chess theme throughout app
- **Warm**: Makes interface feel premium, not cold
- **Clear**: Easy to spot interactive elements

---

## Testing the Feel

To experience the animations:
1. Open the app and trigger the tutorial
2. Notice the entrance cascade (header → body → footer)
3. Hover over buttons to see the lift effect
4. Click close button to see rotation + exit animation
5. Watch progress dots pulse on active step
6. Try on mobile to see responsive adjustments

Everything should feel **smooth, confident, and intentional** ✨
