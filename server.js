const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const root = __dirname;
const publicDir = path.join(root, "public");
const envPath = path.join(root, ".env");

loadEnv(envPath);

const PORT = Number(process.env.PORT || 4173);
const OWNER_EMAIL = process.env.OWNER_EMAIL || "patelbuiz1@gmail.com";
const OWNER_PHONE = process.env.OWNER_PHONE || "+19049087030";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/enquiries") {
      const body = await readJson(req);
      const enquiry = validateEnquiry(body);
      const prepared = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source: "Dev's POS website",
        ...enquiry
      };
      const notifications = await notifyOwner(prepared);

      return sendJson(res, 201, {
        ok: true,
        message: "Your quote request has been sent. Dev's POS will contact you shortly.",
        enquiryId: prepared.id,
        notifications
      });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { ok: false, error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Dev's POS website is running at http://localhost:${PORT}`);
  console.log("Submit the form to test email delivery and notification hooks.");
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/"
    ? "index.html"
    : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
    return sendJson(res, 403, { ok: false, error: "Forbidden" });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(path.join(publicDir, "index.html")));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function validateEnquiry(input) {
  const enquiry = {
    firstName: clean(input.firstName),
    lastName: clean(input.lastName),
    email: clean(input.email).toLowerCase(),
    companyName: clean(input.companyName),
    phone: clean(input.phone),
    businessType: clean(input.businessType),
    message: clean(input.message || "")
  };

  const required = ["firstName", "lastName", "email", "companyName", "phone", "businessType"];
  for (const field of required) {
    if (!enquiry[field]) {
      throw Object.assign(new Error(`Please enter ${field.replace(/[A-Z]/g, m => ` ${m.toLowerCase()}`)}.`), { status: 400 });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)) {
    throw Object.assign(new Error("Please enter a valid email address."), { status: 400 });
  }

  return enquiry;
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 500);
}

async function notifyOwner(enquiry) {
  const summary = [
    `New Dev's POS quote request`,
    `Name: ${enquiry.firstName} ${enquiry.lastName}`,
    `Company: ${enquiry.companyName}`,
    `Business type: ${enquiry.businessType}`,
    `Email: ${enquiry.email}`,
    `Phone: ${enquiry.phone}`,
    enquiry.message ? `Message: ${enquiry.message}` : ""
  ].filter(Boolean).join("\n");

  const results = {
    email: await sendEmail(summary, enquiry),
    sms: await sendTwilioMessage(OWNER_PHONE, summary, "sms"),
    whatsapp: await sendTwilioMessage(`whatsapp:${OWNER_PHONE}`, summary, "whatsapp")
  };

  console.log("\n--- New Dev's POS Enquiry ---");
  console.log(summary);
  console.log("Notification status:", results);
  console.log("-----------------------------\n");
  return results;
}

async function sendEmail(summary, enquiry) {
  if (!process.env.RESEND_API_KEY) {
    return { mode: "demo", status: "logged", to: OWNER_EMAIL };
  }

  const payload = {
    from: process.env.RESEND_FROM || "Dev's POS <onboarding@resend.dev>",
    to: OWNER_EMAIL,
    subject: `New quote request from ${enquiry.companyName}`,
    text: summary
  };

  return postJson("api.resend.com", "/emails", payload, {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`
  });
}

async function sendTwilioMessage(to, body, channel) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === "whatsapp"
    ? process.env.TWILIO_WHATSAPP_FROM
    : process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    return { mode: "demo", status: "logged", to };
  }

  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  return postForm(
    "api.twilio.com",
    `/2010-04-01/Accounts/${sid}/Messages.json`,
    form.toString(),
    { Authorization: `Basic ${auth}` }
  );
}

function postJson(hostname, endpoint, payload, headers = {}) {
  return request(hostname, endpoint, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...headers
  });
}

function postForm(hostname, endpoint, body, headers = {}) {
  return request(hostname, endpoint, body, {
    "Content-Type": "application/x-www-form-urlencoded",
    ...headers
  });
}

function request(hostname, endpoint, body, headers) {
  return new Promise(resolve => {
    const req = https.request({
      hostname,
      path: endpoint,
      method: "POST",
      headers: {
        "Content-Length": Buffer.byteLength(body),
        ...headers
      }
    }, res => {
      let response = "";
      res.on("data", chunk => response += chunk);
      res.on("end", () => resolve({ mode: "live", status: res.statusCode, response: safeJson(response) }));
    });

    req.on("error", error => resolve({ mode: "live", status: "failed", error: error.message }));
    req.write(body);
    req.end();
  });
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
