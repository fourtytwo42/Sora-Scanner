# Custom Feed Builder - Visual Guide

## 🎨 UI Components Overview

### 1. Feed Dropdown Menu

```
┌─────────────────────────────────────┐
│  [Latest ▼]                         │  ← Feed selector button
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Latest                             │  ← Standard feeds
│  Top                                │
│  Favorites                          │
│  Search                             │
├─────────────────────────────────────┤
│  CUSTOM FEEDS                       │  ← Custom feeds section
│  ● Nature Explorer      [✏️] [❌]   │  ← Edit/Delete icons
│  ● Creative Vibes       [✏️] [❌]   │
│  ● Chill Evening        [✏️] [❌]   │
├─────────────────────────────────────┤
│  [+] Create Custom Feed             │  ← Create new button
└─────────────────────────────────────┘
```

### 2. Custom Feed Builder Modal

```
┌───────────────────────────────────────────────────────────────┐
│  Create Custom Feed                                      [X]  │
│  Build a timeline of search blocks that play in sequence      │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Feed Name: [My Custom Feed________________]                 │
│  ☑ Loop forever (restart from beginning when finished)       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ [+] Create Search Block                                 │ │
│  │                                                           │ │
│  │  [Search query..._______________] [🕐] [10] min [Create] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Available Blocks (drag to timeline)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ ⋮⋮ Ocean     │ │ ⋮⋮ Mountains │ │ ⋮⋮ Forests   │         │
│  │ 🕐 10m  [📋][X]│ │ 🕐 10m  [📋][X]│ │ 🕐 10m  [📋][X]│         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
│                                                               │
│  Timeline (3 blocks)                        Total: 30m        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ┌───────────────────────────────────────────────────┐   │ │
│  │ │ [1] ⋮⋮ Ocean Life              🕐 10m  [📋] [X]    │   │ │
│  │ └───────────────────────────────────────────────────┘   │ │
│  │ ┌───────────────────────────────────────────────────┐   │ │
│  │ │ [2] ⋮⋮ Mountain Landscapes      🕐 10m  [📋] [X]    │   │ │
│  │ └───────────────────────────────────────────────────┘   │ │
│  │ ┌───────────────────────────────────────────────────┐   │ │
│  │ │ [3] ⋮⋮ Forest Animals           🕐 10m  [📋] [X]    │   │ │
│  │ └───────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  [Cancel]                              [💾 Create Feed]       │
└───────────────────────────────────────────────────────────────┘
```

### 3. Playback Indicator (Active Feed)

```
┌─────────────────────────────────────────────────────┐
│  ● Block 1/3  │  Ocean Life  │  Looping            │
└─────────────────────────────────────────────────────┘
     ↑              ↑              ↑
   Pulse         Current        Loop
  indicator       query         status
```

### 4. Drag-and-Drop States

#### Normal State
```
┌──────────────────────────────────┐
│ ⋮⋮ Ocean Life                    │
│ 🕐 10 minutes            [📋] [X] │
└──────────────────────────────────┘
```

#### Dragging State
```
┌──────────────────────────────────┐
│ ⋮⋮ Ocean Life                    │  ← Semi-transparent
│ 🕐 10 minutes            [📋] [X] │
└──────────────────────────────────┘
                │
                ▼
        [Drop zone indicator]
```

#### Drop Zone Highlighted
```
═══════════════════════════════════  ← Blue highlight
┌──────────────────────────────────┐
│ [1] ⋮⋮ Existing Block            │
└──────────────────────────────────┘
```

### 5. Trash Zone (When Dragging Timeline Block)

```
                    ▼ Dragging block
┌─────────────────────────────────────────┐
│  🗑️  Drop here to remove from timeline  │  ← Slides up from bottom
└─────────────────────────────────────────┘
```

## 🎨 Color Scheme

### Backgrounds
- **Modal**: `gradient-to-br from-gray-900 to-black`
- **Blocks**: `bg-white/5` with `border-white/10`
- **Timeline Blocks**: `gradient-to-r from-blue-500/20 to-purple-500/20`
- **Active Feed Button**: `gradient-to-r from-blue-500 to-purple-500`
- **Playback Indicator**: `gradient-to-r from-blue-500/90 to-purple-500/90`

### Interactive States
- **Hover**: `hover:bg-white/20`
- **Active**: `bg-white text-black`
- **Delete Hover**: `hover:bg-red-500/20`
- **Drop Zone**: `border-blue-500 bg-blue-500/10`

### Text
- **Primary**: `text-white`
- **Secondary**: `text-white/80`
- **Muted**: `text-white/60`
- **Labels**: `text-white/50`

## 📱 Responsive Breakpoints

### Mobile (< 640px)
```
┌────────────────────┐
│  Feed Name         │
│  [____________]    │
│                    │
│  ☑ Loop forever    │
│                    │
│  Create Block      │
│  [Search____]      │
│  [10] min [Create] │
│                    │
│  Available Blocks  │
│  ┌──────────────┐  │
│  │ Block 1      │  │  ← Stacked
│  └──────────────┘  │
│  ┌──────────────┐  │
│  │ Block 2      │  │
│  └──────────────┘  │
│                    │
│  Timeline          │
│  ┌──────────────┐  │
│  │ [1] Block    │  │  ← Full width
│  └──────────────┘  │
└────────────────────┘
```

### Tablet (640px - 1024px)
```
┌──────────────────────────────────┐
│  Feed Name [___________________] │
│  ☑ Loop forever                  │
│                                  │
│  Create Block                    │
│  [Search________] [10] [Create]  │
│                                  │
│  Available Blocks                │
│  ┌────────┐ ┌────────┐          │  ← 2 columns
│  │ Block 1│ │ Block 2│          │
│  └────────┘ └────────┘          │
│                                  │
│  Timeline                        │
│  ┌────────────────────────────┐ │
│  │ [1] Block                  │ │  ← Full width
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

### Desktop (> 1024px)
```
┌────────────────────────────────────────────────────┐
│  Feed Name [_________________________________]     │
│  ☑ Loop forever                                    │
│                                                    │
│  Create Block                                      │
│  [Search________________] [10] min [Create]        │
│                                                    │
│  Available Blocks                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  ← 3-4 columns
│  │Block1│ │Block2│ │Block3│ │Block4│            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                    │
│  Timeline                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │ [1] Block                                    │ │  ← Full width
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

## 🎭 Animation States

### Modal Open
```
Frame 1: opacity: 0
Frame 2: opacity: 0.5
Frame 3: opacity: 1.0  ← 200ms fade-in
```

### Trash Zone Appear
```
Frame 1: translateY(100%), opacity: 0
Frame 2: translateY(50%), opacity: 0.5
Frame 3: translateY(0), opacity: 1.0  ← 300ms slide-up
```

### Playback Indicator Pulse
```
Frame 1: scale: 1.0, opacity: 1.0
Frame 2: scale: 1.2, opacity: 0.5
Frame 3: scale: 1.0, opacity: 1.0  ← Continuous pulse
```

### Block Hover
```
Normal:  bg-white/5
Hover:   bg-white/10  ← Smooth transition
```

## 🖱️ Interaction Patterns

### Desktop Interactions
1. **Click** - Select/activate
2. **Drag** - Move blocks
3. **Hover** - Show tooltips/controls
4. **Double-click** - Quick edit (future)

### Mobile Interactions
1. **Tap** - Select/activate
2. **Long-press + drag** - Move blocks
3. **Swipe** - Scroll timeline
4. **Tap-hold** - Show context menu (future)

## 📐 Layout Measurements

### Modal
- **Width**: `max-w-6xl` (1152px max)
- **Height**: `max-h-[90vh]` (90% viewport)
- **Padding**: `p-6` (24px)
- **Border Radius**: `rounded-3xl` (24px)

### Blocks
- **Padding**: `p-3` or `p-4` (12-16px)
- **Border Radius**: `rounded-xl` (12px)
- **Gap**: `gap-3` (12px)
- **Min Height**: Timeline `min-h-[200px]`

### Icons
- **Small**: `14px` (edit/delete in dropdown)
- **Medium**: `16-18px` (buttons, indicators)
- **Large**: `20-24px` (headers, main actions)

## 🎯 Visual Hierarchy

### Priority Levels
1. **Primary Actions**: Create Feed, Save buttons (gradient, prominent)
2. **Secondary Actions**: Create Block, Cancel (solid colors)
3. **Tertiary Actions**: Edit, Delete, Duplicate (icon buttons)
4. **Status**: Playback indicator (gradient, top of screen)
5. **Content**: Blocks, timeline (subtle backgrounds)

### Typography Scale
- **Headings**: `text-2xl font-bold` (24px)
- **Subheadings**: `text-lg font-semibold` (18px)
- **Body**: `text-sm font-medium` (14px)
- **Labels**: `text-xs` (12px)

## 🎨 Design Tokens

### Spacing
```
xs:  0.25rem (4px)
sm:  0.5rem  (8px)
md:  1rem    (16px)
lg:  1.5rem  (24px)
xl:  2rem    (32px)
```

### Border Radius
```
sm:  0.25rem (4px)
md:  0.5rem  (8px)
lg:  0.75rem (12px)
xl:  1rem    (16px)
2xl: 1.5rem  (24px)
3xl: 2rem    (32px)
```

### Opacity
```
Muted:    0.4-0.5
Secondary: 0.6
Primary:   0.8
Full:      1.0
```

This visual guide provides a comprehensive overview of the Custom Feed Builder's UI/UX design system.

