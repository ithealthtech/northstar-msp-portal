# Accessibility

Northstar targets WCAG 2.1 Level AA for released portal workflows. Automated checks are a release gate, not a substitute for review by people who use assistive technology.

## Automated release gate

Run the browser suite on Node.js 24 or later with Google Chrome installed:

```powershell
npm run test:e2e
```

The suite builds the production bundle and checks:

- WCAG 2 A/AA axe rules on sign-in and the end-user, client-admin, and MSP dashboards.
- A visible keyboard skip link and deterministic focus movement to the main region.
- Focus movement when navigating between portal pages.
- Dialog initial focus, keyboard trapping, Escape dismissal, and focus restoration.
- Mobile-menu expanded state and the absence of horizontal page overflow at 390 by 844 pixels.

CI runs the same suite after unit, build, and smoke verification. Failed browser checks retain a screenshot and Playwright trace for diagnosis.

## Manual release checklist

Complete these checks for every material workflow or visual redesign:

1. Use the full workflow with only a keyboard at 100%, 200%, and 400% zoom.
2. Verify screen-reader names, roles, states, announcements, landmarks, headings, tables, validation errors, and dialog boundaries with current NVDA and Chrome on Windows.
3. Confirm content remains understandable when color, icons, animation, or background images are unavailable.
4. Test Windows high-contrast mode and reduced-motion preferences.
5. Check responsive reflow at 320 CSS pixels without two-dimensional scrolling, except where a data table requires it.
6. Verify touch targets, error recovery, timeout behavior, and authentication failure messaging.
7. Record the browser, assistive technology, tester, date, findings, and remediation owner in the release evidence.

## Known boundary

Automated axe coverage can detect many structural and contrast issues, but it cannot prove that labels are understandable, focus order is ideal, announcements are timely, or a workflow is usable. Northstar must not claim accessibility certification based only on this suite.
