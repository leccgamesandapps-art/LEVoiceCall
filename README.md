# LEVoiceCall v1.0.0

Browser-based voice & video call website for Vercel.

## Features

- Facebook authentication (public profile)
- Multiple independent call rooms
- Unique join codes (one code = one room)
- Voice and video calls (WebRTC)
- Creator shutdown (only that room)
- Best-effort screenshot & screen-recording protection
- Responsive mobile & desktop UI
- Permission handling (mic / camera / notifications)

## Setup

1. Create a Facebook App at https://developers.facebook.com/
2. Add your domain to Valid OAuth Redirect URIs and App Domains
3. Set App ID via `window.LEVC_FB_APP_ID` or localStorage `levc_fb_app_id`
4. (Optional) Connect Vercel KV for persistent multi-instance room storage
5. Deploy to Vercel (HTTPS required for getUserMedia)

## Structure

```
index.html          Landing + Facebook sign-in
main/main.html      Home (Create / Join)
main/about.html     About
main/call.html      Specific call room (?call=CODE)
api/                Serverless room + signaling endpoints
js/                 Client logic
css/                Styles
```

## Notes

- Rooms are isolated by join code. Closing one room never affects others.
- Screenshot/recording protection is best-effort within browser limits.
- Serverless memory is per-instance; use Vercel KV in production for shared state.
