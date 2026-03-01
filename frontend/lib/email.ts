import nodemailer from "nodemailer";

type TicketCreatedEmailInput = {
  to: string;
  trackingNumber: string;
  ticketType?: string | null;
};

type TicketStatusEmailInput = {
  to: string;
  trackingNumber: string;
  status: string;
  remarks?: string | null;
};

function asTrimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: string | undefined, fallback = false): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTransportConfig() {
  const host = asTrimmed(process.env.SMTP_HOST);
  const portRaw = asTrimmed(process.env.SMTP_PORT);
  const user = asTrimmed(process.env.SMTP_USER);
  const pass = asTrimmed(process.env.SMTP_PASS);

  if (!host || !portRaw || !user || !pass) {
    return null;
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  return {
    host,
    port,
    secure: normalizeBoolean(process.env.SMTP_SECURE, port === 465),
    auth: { user, pass },
  };
}

const transportConfig = getTransportConfig();

const transporter = transportConfig ? nodemailer.createTransport(transportConfig) : null;

function getSenderAddress() {
  return asTrimmed(process.env.SMTP_FROM) || asTrimmed(process.env.SMTP_USER);
}

export function isEmailConfigured(): boolean {
  return !!transporter && !!getSenderAddress();
}

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendEmail(input: SendEmailInput) {
  if (!transporter) {
    throw new Error("SMTP is not configured. Missing SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS.");
  }

  const from = getSenderAddress();
  if (!from) {
    throw new Error("SMTP sender is not configured. Missing SMTP_FROM/SMTP_USER.");
  }

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendTicketCreatedEmail(input: TicketCreatedEmailInput) {
  const ticketType = input.ticketType?.trim() || "complaint";
  const tracking = input.trackingNumber.trim();

  const subject = "Insighta: Ticket received";
  const text = [
    `Your ${ticketType} has been received by Insighta.`,
    "",
    `Tracking number: ${tracking}`,
    "",
    "Use this tracking number on the Track Ticket page to check your status.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Ticket received</h2>
      <p style="margin: 0 0 12px;">Your ${escapeHtml(ticketType)} has been received by Insighta.</p>
      <p style="margin: 0 0 6px; font-weight: 700;">Tracking number</p>
      <p style="margin: 0 0 16px; font-family: monospace; font-size: 16px; color: #1d4ed8;">${escapeHtml(tracking)}</p>
      <p style="margin: 0;">Use this tracking number on the Track Ticket page to check your status.</p>
    </div>
  `;

  await sendEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}

export async function sendTicketStatusUpdatedEmail(input: TicketStatusEmailInput) {
  const tracking = input.trackingNumber.trim();
  const status = input.status.trim();
  const remarks = input.remarks?.trim();

  const subject = `Insighta: Ticket status updated to ${status}`;
  const text = [
    "Your ticket status has been updated.",
    "",
    `Tracking number: ${tracking}`,
    `New status: ${status}`,
    ...(remarks ? ["", `Remarks: ${remarks}`] : []),
    "",
    "Use your tracking number on the Track Ticket page to view the latest status.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Ticket status updated</h2>
      <p style="margin: 0 0 6px;"><strong>Tracking number:</strong> <span style="font-family: monospace; color: #1d4ed8;">${escapeHtml(tracking)}</span></p>
      <p style="margin: 0 0 6px;"><strong>New status:</strong> ${escapeHtml(status)}</p>
      ${remarks ? `<p style="margin: 0 0 6px;"><strong>Remarks:</strong> ${escapeHtml(remarks)}</p>` : ""}
      <p style="margin: 12px 0 0;">Use your tracking number on the Track Ticket page to view the latest status.</p>
    </div>
  `;

  await sendEmail({
    to: input.to,
    subject,
    text,
    html,
  });
}
