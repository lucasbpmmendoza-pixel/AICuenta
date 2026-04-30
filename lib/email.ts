import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

// Para producción, cambia por tu dominio verificado en Resend
const FROM = "AIcuenta <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Restablece tu contrasena en AIcuenta",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h1 style="font-size:24px;font-weight:900;color:#0f172a;margin-bottom:8px">
          Hola, ${name} 👋
        </h1>
        <p style="color:#475569;line-height:1.6">
          Recibimos una solicitud para restablecer la contrasena de tu cuenta en <strong>AIcuenta</strong>.<br/>
          El enlace expira en <strong>1 hora</strong>.
        </p>
        <a href="${url}"
           style="display:inline-block;margin-top:24px;padding:12px 24px;background:#0f172a;color:#fff;border-radius:16px;text-decoration:none;font-weight:700;font-size:14px">
          Restablecer contrasena
        </a>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8;word-break:break-all">
          O copia este enlace: ${url}
        </p>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8">
          Si no solicitaste esto, ignora este correo. Tu contrasena no cambiara.
        </p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Verifica tu correo en AIcuenta",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h1 style="font-size:24px;font-weight:900;color:#0f172a;margin-bottom:8px">
          Hola, ${name} 👋
        </h1>
        <p style="color:#475569;line-height:1.6">
          Gracias por registrarte en <strong>AIcuenta</strong>.<br/>
          Confirma tu correo para activar tu cuenta.
          El enlace expira en <strong>24 horas</strong>.
        </p>
        <a href="${url}"
           style="display:inline-block;margin-top:24px;padding:12px 24px;background:#0f172a;color:#fff;border-radius:16px;text-decoration:none;font-weight:700;font-size:14px">
          Verificar correo
        </a>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8;word-break:break-all">
          O copia este enlace: ${url}
        </p>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8">
          Si no creaste esta cuenta, ignora este correo.
        </p>
      </div>
    `,
  });
}

export async function sendSupportEmail(opts: {
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
}) {
  return resend.emails.send({
    from: FROM,
    to: process.env.SUPPORT_EMAIL ?? "soporte@aicuenta.mx",
    replyTo: opts.fromEmail,
    subject: `[Soporte] ${opts.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
        <h2 style="font-size:20px;font-weight:900;color:#0f172a;margin-bottom:4px">
          Nuevo ticket de soporte
        </h2>
        <p style="font-size:13px;color:#64748b;margin-bottom:24px">AIcuenta · Soporte interno</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
          <tr>
            <td style="padding:8px 0;color:#64748b;width:90px;vertical-align:top">De</td>
            <td style="padding:8px 0;color:#0f172a;font-weight:600">${opts.fromName} &lt;${opts.fromEmail}&gt;</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;vertical-align:top">Asunto</td>
            <td style="padding:8px 0;color:#0f172a;font-weight:600">${opts.subject}</td>
          </tr>
        </table>
        <div style="background:#f8fafc;border-radius:12px;padding:20px;line-height:1.7;color:#334155;font-size:14px;white-space:pre-wrap">${opts.message}</div>
        <p style="margin-top:20px;font-size:12px;color:#94a3b8">
          Puedes responder directamente a este correo para contactar al usuario.
        </p>
      </div>
    `,
  });
}
