# Dev's POS Render Deployment

## Recommended Free Link

Use Render's free web service. If the name is available, the link should be:

```txt
https://thedevpos.onrender.com
```

## Render Settings

- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `node server.js`
- Plan: Free

## Environment Variables

Add these in Render under Environment:

```txt
OWNER_EMAIL=patelbuiz1@gmail.com
OWNER_PHONE=+19049087030
RESEND_FROM=Dev's POS <onboarding@resend.dev>
RESEND_API_KEY=your_resend_api_key
```

Do not put `RESEND_API_KEY` directly in public code.
