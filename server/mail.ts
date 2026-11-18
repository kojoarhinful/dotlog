import type { Env } from "./db";
import { configuredOrigin } from "./origin";

const NAME = "dotlog";

/**
 * Workers cannot open an SMTP connection, so mail goes out through Brevo's
 * HTTP API. Without BREVO_API_KEY the message is printed to the terminal,
 * which is what happens in local development.
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER = ` <no-reply@example.com>`;
const DEFAULT_ORIGIN = "https://dotlog.tryapp.workers.dev";

/** `dotlog <log@example.com>` becomes `{ name: 'dotlog', email: 'log@example.com' }`. */
function sender(raw: string): { name: string; email: string } {
	const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	if (!match) return { name: NAME, email: raw.trim() };
	return { name: match[1] || NAME, email: match[2] };
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function layout(env: Env, body: string): string {
	const origin = configuredOrigin(env) ?? DEFAULT_ORIGIN;
	const logo = `${origin}/logo.png`;
	return `
    <style>@import url("https://fonts.googleapis.com/css2?family=Fredoka:wght@500&display=swap");</style>
    <div style="background:#1b1b1b;padding:32px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#ececec">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
        <tr>
          <td style="padding:0 8px 0 0;vertical-align:middle">
            <img src="${logo}" width="24" height="24" alt="${NAME}" style="display:block;border:0">
          </td>
          <td style="vertical-align:middle;font-family:'Fredoka','Trebuchet MS',Verdana,sans-serif;font-size:18px;font-weight:500;color:#f2f2f2">${NAME}</td>
        </tr>
      </table>
      ${body}
    </div>
  `;
}

/** One big, unmissable block for the six digits. */
function codeBlock(code: string): string {
	return `
      <div style="margin:0 0 20px;padding:16px 0;border:1px dashed #3a3a3a;border-radius:10px;background:#232323;text-align:center">
        <span style="font-size:30px;letter-spacing:8px;font-weight:600;color:#ffd23f">${escapeHtml(code)}</span>
      </div>
    `;
}

type Message = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

async function deliver(env: Env, message: Message): Promise<void> {
	const key = env.BREVO_API_KEY;

	if (!key) {
		console.log(
			[
				"",
				`  Mail to ${message.to}`,
				"  -----------------------------",
				...message.text.split("\n").map((line) => `  ${line}`),
				"",
			].join("\n"),
		);
		return;
	}

	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"api-key": key,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			sender: sender(env.EMAIL_FROM ?? DEFAULT_SENDER),
			to: [{ email: message.to }],
			subject: message.subject,
			textContent: message.text,
			htmlContent: message.html,
		}),
	});

	const detail = await response.text();

	if (!response.ok) {
		console.error("Brevo rejected the message", response.status, detail);
		throw new Error("The email could not be sent. Try again.");
	}

	console.log(
		"Brevo accepted",
		response.status,
		`sender=${env.EMAIL_FROM}`,
		`to=${message.to}`,
		detail,
	);
}

export function sendSignupCode(
	env: Env,
	to: string,
	code: string,
	minutes: number,
) {
	return deliver(env, {
		to,
		subject: `Your ${NAME} sign up code: ${code}`,
		text: `Your sign up code is ${code}. It expires in ${minutes} minutes.`,
		html: layout(env, `
      <p style="margin:0 0 20px;font-size:15px">Type this code to finish signing up:</p>
      ${codeBlock(code)}
      <p style="margin:0;font-size:12px;color:#6a6a6a">The code expires in ${minutes} minutes. If you did not ask for this, ignore it.</p>
    `),
	});
}

export function sendLoginCode(
	env: Env,
	to: string,
	code: string,
	minutes: number,
) {
	return deliver(env, {
		to,
		subject: `Your ${NAME} code: ${code}`,
		text: `Your sign in code is ${code}. It expires in ${minutes} minutes.`,
		html: layout(env, `
      <p style="margin:0 0 20px;font-size:15px">Your sign in code:</p>
      ${codeBlock(code)}
      <p style="margin:0;font-size:12px;color:#6a6a6a">The code expires in ${minutes} minutes. If you did not try to sign in, change your password.</p>
    `),
	});
}

export function sendRecoveryCode(
	env: Env,
	to: string,
	code: string,
	minutes: number,
) {
	return deliver(env, {
		to,
		subject: `Your ${NAME} reset code: ${code}`,
		text: `Your password reset code is ${code}. It expires in ${minutes} minutes.`,
		html: layout(env, `
      <p style="margin:0 0 20px;font-size:15px">Type this code to reset your password:</p>
      ${codeBlock(code)}
      <p style="margin:0;font-size:12px;color:#6a6a6a">The code expires in ${minutes} minutes. You will also need the recovery code you saved when you signed up.</p>
    `),
	});
}

export function sendDeleteCode(
	env: Env,
	to: string,
	code: string,
	minutes: number,
) {
	return deliver(env, {
		to,
		subject: `Your ${NAME} deletion code: ${code}`,
		text: `Someone asked to delete this ${NAME} account. Use ${code} to confirm. It expires in ${minutes} minutes. Do not share this code. If this was not you, change your password.`,
		html: layout(env, `
      <p style="margin:0 0 20px;font-size:15px">Someone asked to delete this ${NAME} account. Enter this code to confirm:</p>
      ${codeBlock(code)}
      <p style="margin:0;font-size:12px;color:#6a6a6a">Do not share this code. It expires in ${minutes} minutes. If this was not you, change your password.</p>
    `),
	});
}

export function sendExistingAccount(env: Env, to: string, url: string) {
	return deliver(env, {
		to,
		subject: `You already have a ${NAME} account`,
		text: `Someone tried to sign up with this address. Sign in or reset your password:\n\n${url}`,
		html: layout(env, `
      <p style="margin:0 0 20px;font-size:15px">An account with this address already exists. Sign in, or reset your password.</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Go to ${NAME}</a>
      </p>
      <p style="margin:0;font-size:12px;color:#6a6a6a">If this was not you, ignore it.</p>
    `),
	});
}
