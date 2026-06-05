import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terminos y Condiciones | AIcuenta",
  description: "Terminos y condiciones de uso de la plataforma AIcuenta.",
};

const sections = [
  {
    title: "1. Aceptacion",
    body: "Al crear una cuenta o usar AIcuenta, aceptas estos Terminos y Condiciones. Si no estas de acuerdo, no debes usar la plataforma.",
  },
  {
    title: "2. Servicio",
    body: "AIcuenta ofrece herramientas para carga, procesamiento y analisis de informacion fiscal y contable. El servicio puede evolucionar y agregar, ajustar o retirar funciones cuando sea necesario.",
  },
  {
    title: "3. Cuenta y seguridad",
    body: "Eres responsable de la confidencialidad de tus credenciales y de la actividad realizada en tu cuenta. Debes notificar cualquier uso no autorizado en cuanto lo detectes.",
  },
  {
    title: "4. Uso permitido",
    body: "No esta permitido usar AIcuenta para actividades ilicitas, para vulnerar sistemas, ni para cargar contenido sin autorizacion legal. El uso debe cumplir con la normativa aplicable en Mexico.",
  },
  {
    title: "5. Datos y documentos",
    body: "Los datos que cargues (XML, PDF y otros documentos) siguen siendo tuyos o de tus representados. Nos autorizas a procesarlos unicamente para prestar el servicio solicitado y mejorar la experiencia del producto.",
  },
  {
    title: "6. Exactitud de resultados",
    body: "AIcuenta busca ofrecer analisis confiables, pero no sustituye asesoria fiscal o legal profesional. Eres responsable de validar la informacion antes de tomar decisiones o presentar declaraciones.",
  },
  {
    title: "7. Disponibilidad",
    body: "Hacemos esfuerzos razonables para mantener disponibilidad continua, pero puede haber interrupciones por mantenimiento, fallas tecnicas o causas externas fuera de nuestro control.",
  },
  {
    title: "8. Propiedad intelectual",
    body: "El software, marca, diseno, codigo y contenido de AIcuenta son propiedad de sus titulares y estan protegidos por la legislacion aplicable. No se concede licencia distinta al uso normal de la plataforma.",
  },
  {
    title: "9. Limitacion de responsabilidad",
    body: "En la medida permitida por la ley, AIcuenta no sera responsable por daños indirectos, incidentales o consecuenciales derivados del uso o imposibilidad de uso del servicio.",
  },
  {
    title: "10. Cambios a estos terminos",
    body: "Podemos actualizar estos terminos en cualquier momento. Publicaremos la version vigente en esta pagina. El uso continuo del servicio implica aceptacion de los cambios.",
  },
  {
    title: "11. Contacto",
    body: "Para dudas legales o contractuales, escribe a soporte@aicuenta.com.",
  },
];

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Legal
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Terminos y Condiciones
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Ultima actualizacion: 22 de mayo de 2026
        </p>

        <p className="mt-8 text-sm leading-7 text-slate-600">
          Estos terminos regulan el acceso y uso de AIcuenta. Te recomendamos leerlos con atencion antes de continuar usando la plataforma.
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
