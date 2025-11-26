# Mobile Responsive Testing Guide

This guide provides a comprehensive checklist for testing PixelPerfect AI on mobile devices to ensure a great user experience across all screen sizes.

---

## 1. Testing Tools

### Browser DevTools (Quick Testing)

**Chrome DevTools:**

1. Open Chrome
2. Press `F12` or right-click > Inspect
3. Click device toggle icon (or `Ctrl+Shift+M`)
4. Select device presets or custom dimensions

**Common Device Presets:**

- iPhone SE (375x667)
- iPhone 14 Pro (393x852)
- iPhone 14 Pro Max (430x932)
- Samsung Galaxy S21 (360x800)
- iPad Air (820x1180)
- iPad Pro (1024x1366)

### Real Device Testing (Required)

**iOS Devices:**

- iPhone (any recent model)
- iPad (optional but recommended)

**Android Devices:**

- Samsung Galaxy (S series or A series)
- Google Pixel (any recent model)

### Remote Testing Services (Optional)

- **BrowserStack** - Cloud-based device testing
- **LambdaTest** - Cross-browser testing
- **Sauce Labs** - Automated mobile testing

---

## 2. Mobile Testing Checklist

### Homepage (`/`)

#### Visual Layout

- [ ] Hero section displays correctly
- [ ] Text is readable without zooming
- [ ] Images load and fit within viewport
- [ ] CTA buttons are easily tappable (min 44x44px)
- [ ] Navigation menu is accessible
- [ ] Footer is readable and links work

#### Functionality

- [ ] "Get Started" button works
- [ ] Mobile menu opens/closes smoothly
- [ ] All internal links navigate correctly
- [ ] Page scrolls smoothly without jank
- [ ] No horizontal scrolling required

#### Performance

- [ ] Page loads within 3 seconds on 4G
- [ ] Images are optimized for mobile
- [ ] Lazy loading works for images
- [ ] No layout shift on load

---

### Upscaler Page (`/upscaler`)

#### Layout

- [ ] Upload area is prominent and tappable
- [ ] File input works on mobile browsers
- [ ] Image preview scales correctly
- [ ] Controls are thumb-friendly
- [ ] Before/after comparison works on touch

#### Functionality

- [ ] Drag & drop works (if supported by device)
- [ ] File picker opens on tap
- [ ] Image uploads successfully
- [ ] Processing indicator is visible
- [ ] Results display without overflow
- [ ] Download button works
- [ ] Pinch-to-zoom works on preview images

#### Edge Cases

- [ ] Landscape orientation works
- [ ] Large images (>2MB) upload correctly
- [ ] Multiple uploads in session work
- [ ] Error messages are readable
- [ ] Works with slow connections (test with throttling)

---

### Pricing Page (`/pricing`)

#### Layout

- [ ] Pricing cards stack vertically on mobile
- [ ] All text is readable
- [ ] Buttons are easily tappable
- [ ] FAQ accordion works smoothly
- [ ] No text overflow in pricing cards

#### Functionality

- [ ] "Get Started" buttons work
- [ ] Accordion items expand/collapse correctly
- [ ] Scrolling through plans is smooth
- [ ] Recommended badge is visible
- [ ] Contact links work

---

### Authentication Modal

#### Layout

- [ ] Modal is properly centered
- [ ] Form inputs are large enough to tap
- [ ] Keyboard doesn't obscure input fields
- [ ] Close button is accessible
- [ ] Social login buttons are properly sized

#### Functionality

- [ ] Email input brings up email keyboard
- [ ] Password input has show/hide toggle
- [ ] Form validation messages are visible
- [ ] Tab/Enter navigation works
- [ ] Google OAuth redirects correctly
- [ ] Success/error toasts are readable

#### iOS Specific

- [ ] Safari autofill works
- [ ] Keyboard dismiss works correctly
- [ ] Form inputs don't zoom in (font-size ≥ 16px)
- [ ] Touch ID/Face ID integration works (if implemented)

---

### Dashboard (`/dashboard/*`)

#### Navigation

- [ ] Sidebar is accessible (hamburger menu on mobile)
- [ ] All menu items are tappable
- [ ] Active state is visible
- [ ] Logout button is accessible

#### Dashboard Home

- [ ] Stats cards display correctly
- [ ] Credit balance is prominent
- [ ] Recent activity list is readable
- [ ] Quick actions work

#### Billing Page

- [ ] Current plan displays correctly
- [ ] Upgrade buttons work
- [ ] Stripe redirect works
- [ ] Customer portal link works
- [ ] Transaction history is readable

#### Settings Page

- [ ] Form inputs are properly sized
- [ ] Save button is accessible
- [ ] Toggle switches work on touch
- [ ] Success messages are visible

---

### Legal Pages

#### Privacy Policy (`/privacy`)

- [ ] Content is readable without zoom
- [ ] Internal links work
- [ ] Proper line spacing
- [ ] Table of contents works (if present)

#### Terms of Service (`/terms`)

- [ ] Content is readable
- [ ] Links work correctly
- [ ] Back to top button works (if present)

#### Help/FAQ (`/help`)

- [ ] Accordion items work on touch
- [ ] Quick links are tappable
- [ ] Search works (if present)
- [ ] Contact button is accessible

---

## 3. Cross-Device Testing Matrix

Test on at least these combinations:

| Device Type    | OS          | Browser | Priority |
| -------------- | ----------- | ------- | -------- |
| iPhone         | iOS 16+     | Safari  | High     |
| iPhone         | iOS 16+     | Chrome  | Medium   |
| Android Phone  | Android 12+ | Chrome  | High     |
| Android Phone  | Android 12+ | Firefox | Medium   |
| iPad           | iPadOS 16+  | Safari  | Medium   |
| Android Tablet | Android 12+ | Chrome  | Low      |

---

## 4. Mobile Performance Testing

### Core Web Vitals

Use [Google PageSpeed Insights](https://pagespeed.web.dev/) with mobile mode:

- [ ] **LCP (Largest Contentful Paint)**: < 2.5s
- [ ] **FID (First Input Delay)**: < 100ms
- [ ] **CLS (Cumulative Layout Shift)**: < 0.1
- [ ] Overall score: > 80

### Lighthouse Mobile Audit

Run Lighthouse in Chrome DevTools (mobile mode):

- [ ] Performance: > 80
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 90

### Network Throttling Tests

Test with Chrome DevTools network throttling:

- [ ] Fast 3G: Usable experience
- [ ] Slow 4G: Pages load within 5s
- [ ] Offline: Proper error messages

---

## 5. Touch & Gesture Testing

### Tap Targets

- [ ] All interactive elements are at least 44x44px
- [ ] Adequate spacing between tap targets (min 8px)
- [ ] Touch feedback is immediate (visual or haptic)
- [ ] Accidental taps are prevented

### Gestures

- [ ] Swipe works where expected (carousels, modals)
- [ ] Pinch-to-zoom works on images
- [ ] Double-tap doesn't cause unwanted zoom
- [ ] Long-press doesn't trigger context menu unexpectedly
- [ ] Pull-to-refresh doesn't conflict with app scrolling

### Keyboard Behavior

- [ ] Keyboard opens for text inputs
- [ ] Correct keyboard type (email, number, etc.)
- [ ] Keyboard doesn't obscure input field
- [ ] "Done" button dismisses keyboard
- [ ] Tab order is logical

---

## 6. Mobile-Specific Features

### Safari iOS

- [ ] Add to Home Screen works
- [ ] PWA manifest is correct
- [ ] App icons display correctly
- [ ] Status bar color is set
- [ ] Viewport meta tag is correct

### Android Chrome

- [ ] Add to Home Screen works
- [ ] PWA install prompt appears
- [ ] Theme color matches branding
- [ ] App works in standalone mode

---

## 7. Accessibility on Mobile

### Screen Reader Testing

- [ ] VoiceOver (iOS) navigates correctly
- [ ] TalkBack (Android) announces elements properly
- [ ] ARIA labels are present and descriptive
- [ ] Tab order is logical
- [ ] Form labels are associated correctly

### Visual Accessibility

- [ ] Text is at least 16px base size
- [ ] Contrast ratio meets WCAG AA (4.5:1)
- [ ] Focus indicators are visible
- [ ] Color isn't the only information indicator
- [ ] Text can be resized without breaking layout

### Motor Accessibility

- [ ] All features work without precise taps
- [ ] Time limits can be extended (if any)
- [ ] Drag operations have keyboard alternatives
- [ ] No hover-only interactions

---

## 8. Common Mobile Issues & Fixes

### Issue: Text Too Small

**Fix:** Ensure base font-size is at least 16px

```css
html {
  font-size: 16px;
}
```

### Issue: Inputs Zoom on Focus (iOS)

**Fix:** Set font-size to at least 16px on inputs

```css
input,
textarea,
select {
  font-size: 16px;
}
```

### Issue: Horizontal Scrolling

**Fix:** Check for fixed-width elements

```css
* {
  max-width: 100%;
  box-sizing: border-box;
}
```

### Issue: Tap Delays

**Fix:** Remove 300ms tap delay

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
```

### Issue: Viewport Not Responsive

**Fix:** Ensure viewport meta tag is present

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

---

## 9. Testing Documentation Template

For each test session, document:

```markdown
## Test Session: [Date]

**Device:** [iPhone 14, Samsung Galaxy S21, etc.]
**OS Version:** [iOS 16.5, Android 13, etc.]
**Browser:** [Safari, Chrome, Firefox]
**Network:** [WiFi, 4G, 3G]

### Issues Found:

1. **[Page/Component Name]**
   - **Issue:** [Description]
   - **Severity:** [Critical/High/Medium/Low]
   - **Steps to Reproduce:**
     1. Step 1
     2. Step 2
   - **Expected:** [What should happen]
   - **Actual:** [What actually happened]
   - **Screenshot:** [Link if available]

### Test Results:

- [✓] Feature 1 works correctly
- [✗] Feature 2 has issue (see above)
- [✓] Feature 3 works correctly
```

---

## 10. Quick Reference: Viewport Sizes

| Device            | Width  | Height | Common Use     |
| ----------------- | ------ | ------ | -------------- |
| iPhone SE         | 375px  | 667px  | Small phone    |
| iPhone 14 Pro     | 393px  | 852px  | Standard phone |
| iPhone 14 Pro Max | 430px  | 932px  | Large phone    |
| Galaxy S21        | 360px  | 800px  | Android phone  |
| iPad Mini         | 768px  | 1024px | Small tablet   |
| iPad Air          | 820px  | 1180px | Medium tablet  |
| iPad Pro          | 1024px | 1366px | Large tablet   |

### Breakpoints Used in PixelPerfect

```css
/* Tailwind default breakpoints */
sm: 640px   /* Small devices */
md: 768px   /* Medium devices / tablets */
lg: 1024px  /* Large devices / desktops */
xl: 1280px  /* Extra large screens */
2xl: 1536px /* XXL screens */
```

---

## 11. Automated Mobile Testing (Optional)

### Playwright Mobile Tests

Already implemented in `tests/e2e/` directory. Run mobile tests:

```bash
yarn test:e2e:mobile
```

### Custom Playwright Mobile Test

Example for adding new mobile tests:

```typescript
import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 14 Pro'],
});

test('mobile navigation works', async ({ page }) => {
  await page.goto('/');

  // Test hamburger menu
  await page.click('[aria-label="Open menu"]');
  await expect(page.locator('nav')).toBeVisible();

  // Test navigation
  await page.click('text=Pricing');
  await expect(page).toHaveURL('/pricing');
});
```

---

## 12. Pre-Launch Mobile Checklist

Before launching to production:

### Critical (Must Fix)

- [ ] All pages load on iPhone Safari
- [ ] All pages load on Android Chrome
- [ ] Upload/download works on mobile
- [ ] Payment flow works on mobile
- [ ] Authentication works on mobile
- [ ] No horizontal scrolling anywhere
- [ ] All tap targets meet minimum size
- [ ] Forms work with mobile keyboards

### Important (Should Fix)

- [ ] Performance scores > 80 on mobile
- [ ] PWA features work correctly
- [ ] Offline handling is graceful
- [ ] Touch gestures feel natural
- [ ] Loading states are clear

### Nice to Have (Can Defer)

- [ ] Landscape mode is optimized
- [ ] Tablet layouts are custom
- [ ] Advanced PWA features (push notifications)
- [ ] Device-specific optimizations

---

## Resources

- [Google Mobile-Friendly Test](https://search.google.com/test/mobile-friendly)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [WebPageTest Mobile Testing](https://www.webpagetest.org/)
- [Can I Use (Mobile Browser Support)](https://caniuse.com/)
- [MDN Touch Events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
