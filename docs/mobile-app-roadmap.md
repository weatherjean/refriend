# Mobile App Roadmap

Guide to publishing Riff on iOS App Store and Google Play Store using Capacitor.

## Overview

Capacitor wraps our existing React web app in native iOS/Android shells, giving us:
- App Store / Play Store presence
- Native notifications (badge + local)
- Share sheet integration
- Native UI feel (haptics, status bar, safe areas)

No major code rewrites needed - our React app stays 99% the same.

## Prerequisites

| Requirement | Purpose | Cost |
|-------------|---------|------|
| Mac with Xcode | iOS builds (Apple requirement) | - |
| Apple Developer Account | App Store publishing | $99/year |
| Google Play Developer Account | Play Store publishing | $25 one-time |
| App icons (1024x1024 source) | Store listings | - |
| Privacy policy URL | Required by both stores | - |

## Phase 1: Capacitor Setup (30 min)

### Install Capacitor

```bash
cd web
npm install @capacitor/core @capacitor/cli
npx cap init "Riff" "com.yourcompany.riff"
```

### Configure `capacitor.config.ts`

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourcompany.riff',
  appName: 'Riff',
  webDir: 'dist',
  server: {
    // For development, proxy to local API
    // Remove for production
    url: 'http://localhost:5173',
    cleartext: true
  }
};

export default config;
```

### Add Platforms

```bash
npm run build
npx cap add ios
npx cap add android
```

### Test in Simulators

```bash
npx cap open ios      # Opens Xcode - Run in Simulator
npx cap open android  # Opens Android Studio - Run in Emulator
```

## Phase 2: Native Features (1-2 hours)

### App Badge (unread count on icon)

```bash
npm install @capacitor/badge
npx cap sync
```

```typescript
// src/lib/native.ts
import { Capacitor } from '@capacitor/core';
import { Badge } from '@capacitor/badge';

export async function updateBadgeCount(count: number) {
  if (Capacitor.isNativePlatform()) {
    await Badge.set({ count });
  }
}

export async function clearBadge() {
  if (Capacitor.isNativePlatform()) {
    await Badge.clear();
  }
}
```

Call `updateBadgeCount()` after fetching unread notification count.

### Local Notifications

```bash
npm install @capacitor/local-notifications
npx cap sync
```

```typescript
import { LocalNotifications } from '@capacitor/local-notifications';

export async function requestNotificationPermission() {
  const result = await LocalNotifications.requestPermissions();
  return result.display === 'granted';
}

export async function showLocalNotification(title: string, body: string) {
  await LocalNotifications.schedule({
    notifications: [{
      id: Date.now(),
      title,
      body,
      smallIcon: 'ic_notification', // Android only
      actionTypeId: 'OPEN_APP'
    }]
  });
}
```

### Share Sheet

```bash
npm install @capacitor/share
npx cap sync
```

```typescript
import { Share } from '@capacitor/share';

export async function sharePost(post: { id: string; content: string }) {
  await Share.share({
    title: 'Check out this post on Riff',
    text: post.content.slice(0, 100),
    url: `https://yourdomain.com/posts/${post.id}`,
    dialogTitle: 'Share this post'
  });
}
```

Add share button to `PostCard.tsx`:

```tsx
<button onClick={() => sharePost(post)}>
  <i className="bi bi-share"></i>
</button>
```

### Haptic Feedback

```bash
npm install @capacitor/haptics
npx cap sync
```

```typescript
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export async function hapticTap() {
  await Haptics.impact({ style: ImpactStyle.Light });
}
```

Add to like/boost buttons for tactile feedback.

### Status Bar & Safe Areas

```bash
npm install @capacitor/status-bar
npx cap sync
```

```typescript
import { StatusBar, Style } from '@capacitor/status-bar';

// In app initialization
StatusBar.setStyle({ style: Style.Dark });
```

CSS for safe areas (iPhone notch, etc.):

```css
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
}

body {
  padding-top: var(--safe-area-top);
  padding-bottom: var(--safe-area-bottom);
}
```

## Phase 3: Polish (1-2 hours)

### App Icons

Generate all required sizes from a 1024x1024 source image.

**Tools:**
- https://appicon.co - generates all sizes
- https://makeappicon.com

Place generated icons in:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- `android/app/src/main/res/mipmap-*/`

### Splash Screen

```bash
npm install @capacitor/splash-screen
npx cap sync
```

Configure in `capacitor.config.ts`:

```typescript
{
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      backgroundColor: '#ffffff'
    }
  }
}
```

### Deep Links (optional)

Allow `yourapp://` and `https://yourdomain.com` links to open the app.

Requires configuration in:
- iOS: `ios/App/App/Info.plist`
- Android: `android/app/src/main/AndroidManifest.xml`

## Phase 4: Build & Submit (2-4 hours first time)

### iOS App Store

1. **In Xcode:**
   - Set Bundle Identifier: `com.yourcompany.riff`
   - Set Version: `1.0.0`
   - Set Build: `1`
   - Select "Any iOS Device" as target
   - Product → Archive

2. **In App Store Connect (appstoreconnect.apple.com):**
   - Create new app
   - Fill in metadata (description, screenshots, keywords)
   - Upload build from Xcode Organizer
   - Submit for review

**Required assets:**
- Screenshots (6.5" and 5.5" iPhone sizes minimum)
- App description (4000 chars max)
- Keywords (100 chars max)
- Privacy policy URL
- Support URL

### Google Play Store

1. **In Android Studio:**
   - Build → Generate Signed Bundle/APK
   - Choose Android App Bundle (.aab)
   - Create keystore (save this forever!)
   - Build release bundle

2. **In Google Play Console (play.google.com/console):**
   - Create new app
   - Fill in store listing
   - Upload .aab file
   - Submit for review

**Required assets:**
- Screenshots (phone + tablet)
- Feature graphic (1024x500)
- App description
- Privacy policy URL

## Development Workflow

### Daily Development

```bash
# Make changes to React app
npm run dev

# Test in browser first
# Then sync to native:
npm run build
npx cap sync
npx cap open ios  # or android
```

### Live Reload (optional)

For faster native testing, enable live reload in `capacitor.config.ts`:

```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:5173',
  cleartext: true
}
```

Then run `npm run dev` and changes appear instantly in simulator.

**Remember to remove this for production builds!**

## Checklist Before Submission

- [ ] Remove any development `server.url` from capacitor.config.ts
- [ ] App icons in all sizes
- [ ] Splash screen configured
- [ ] Version number set
- [ ] Privacy policy URL live
- [ ] Test on real devices (not just simulators)
- [ ] Test offline behavior
- [ ] Test notification permissions
- [ ] Screenshots captured
- [ ] App description written

## Estimated Timeline

| Phase | Time |
|-------|------|
| Capacitor setup | 30 min |
| Native features | 1-2 hours |
| Polish & icons | 1-2 hours |
| First iOS submission | 2-3 hours |
| First Android submission | 1-2 hours |
| **Total** | **5-10 hours** |

Review times:
- iOS: 24-48 hours typically
- Android: Few hours to 1 day

## Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)
- [App Icon Generator](https://appicon.co)
