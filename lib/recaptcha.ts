interface RecaptchaResponse {
  success: boolean;
  score: number;
  action: string;
  "error-codes"?: string[];
}

/**
 * Verifica un token de reCAPTCHA v3 con Google.
 * Lanza un error si el token es inválido o el score es demasiado bajo.
 */
export async function verifyRecaptcha(token: string, expectedAction: string): Promise<void> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) throw new Error("RECAPTCHA_SECRET_KEY not set");

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  const data: RecaptchaResponse = await res.json();

  if (!data.success) {
    throw new Error(`reCAPTCHA failed: ${(data["error-codes"] ?? []).join(", ")}`);
  }

  if (data.action !== expectedAction) {
    throw new Error(`reCAPTCHA action mismatch: expected ${expectedAction}, got ${data.action}`);
  }

  // Score: 1.0 = humano, 0.0 = bot. Umbral conservador: 0.5
  if (data.score < 0.5) {
    throw new Error(`reCAPTCHA score too low: ${data.score}`);
  }
}
