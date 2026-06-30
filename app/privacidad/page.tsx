import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de Privacidad | AIcuenta",
  description: "Aviso de privacidad de la plataforma AIcuenta.",
};

const sections = [
  {
    title: "1. Responsable del tratamiento",
    body: "AIcuenta es responsable del tratamiento de los datos personales recabados a través de la plataforma, conforme a la legislación aplicable en México.",
  },
  {
    title: "2. Datos que recabamos",
    body: "Podemos recabar datos de identificación y contacto, datos de cuenta, información fiscal y documentos que el usuario cargue para el uso de las funcionalidades del servicio.",
  },
  {
    title: "3. Finalidades del tratamiento",
    body: "Usamos los datos para habilitar el acceso a la plataforma, procesar documentos, generar análisis contables/fiscales, brindar soporte técnico y mejorar el producto.",
  },
  {
    title: "4. Transferencias",
    body: "No compartimos datos personales con terceros salvo cuando sea necesario para prestar el servicio, por requerimiento legal o con autorización del titular.",
  },
  {
    title: "5. Conservación y seguridad",
    body: "Implementamos medidas razonables administrativas, técnicas y físicas para proteger la información contra acceso no autorizado, pérdida, alteración o destrucción.",
  },
  {
    title: "6. Derechos ARCO",
    body: "El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición, así como revocar su consentimiento, mediante solicitud al correo de contacto.",
  },
  {
    title: "7. Uso de cookies y tecnologías similares",
    body: "Podemos utilizar cookies y tecnologías similares para mantener sesión, mejorar la experiencia y obtener métricas de uso. Puedes administrar su uso desde tu navegador.",
  },
  {
    title: "8. Cambios al aviso",
    body: "Podemos actualizar este aviso de privacidad en cualquier momento. La versión vigente estará disponible en esta misma página.",
  },
  {
    title: "9. Contacto",
    body: "Para dudas sobre este aviso o para ejercer derechos ARCO, escribe a soporte@aicuenta.com.",
  },
];

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Legal
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Aviso de Privacidad
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Última actualización: 22 de mayo de 2026
        </p>

        <p className="mt-8 text-sm leading-7 text-slate-600">
          Este aviso describe cómo recopilamos, usamos y protegemos los datos personales de los usuarios de AIcuenta.
        </p>

        <div className="mt-10 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
