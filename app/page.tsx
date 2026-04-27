import type { Metadata } from "next";
import RevealOnScroll from "./components/RevealOnScroll";

export const metadata: Metadata = {
  title: "AIcuenta | Claridad fiscal desde tus XML",
  description:
    "Sube tu .cer, .key y contrasena FIEL para descargar XML, organizarlos en Excel y convertirlos en dashboards con ingresos, egresos, ISR e IVA estimado.",
};

export default function Home() {
  const trustSignals = [
    { value: "12 h", label: "para ver tu primer tablero accionable" },
    { value: "1 flujo", label: "de certificados a reportes listos para usar" },
    { value: "0 captura", label: "manual para clasificar XML uno por uno" },
  ];

  const painPoints = [
    {
      title: "Tu cierre depende de perseguir XML.",
      copy: "Cada mes empieza con descargas, carpetas sueltas y conciliaciones manuales que consumen horas clave.",
    },
    {
      title: "Direccion ve numeros, pero no contexto fiscal.",
      copy: "Sin orden por cliente, proveedor o producto, las decisiones salen tarde o con demasiada intuicion.",
    },
    {
      title: "ISR e IVA aparecen cuando ya no puedes maniobrar.",
      copy: "Sin estimados continuos, el impacto fiscal llega como sorpresa en vez de convertirse en estrategia.",
    },
  ];

  const extractionItems = [
    "Ingresos",
    "Egresos",
    "Notas de credito",
    "Complementos de pago",
    "Retenciones",
    "Nomina",
  ];

  const dashboardItems = [
    "Ingresos por cliente",
    "Egresos por cliente",
    "Egresos por proveedor",
    "Ingresos por producto o servicio",
    "ISR estimado a pagar",
    "IVA estimado a pagar",
  ];

  const excelRows = [
    {
      concept: "Factura emitida / Cliente Norte",
      type: "Ingreso",
      tax: "IVA 16%",
      total: "$148,000",
    },
    {
      concept: "Compra insumos / Proveedor Delta",
      type: "Egreso",
      tax: "IVA acreditable",
      total: "$62,400",
    },
    {
      concept: "Complemento de pago / Cliente Centro",
      type: "Cobranza",
      tax: "Relacionado",
      total: "$89,500",
    },
  ];

  const workflow = [
    {
      step: "01",
      title: "Carga segura de .cer, .key y contrasena FIEL",
      copy: "El cliente comparte sus credenciales en un flujo controlado para habilitar la descarga de XML oficiales.",
    },
    {
      step: "02",
      title: "Descarga, lectura y clasificacion fiscal",
      copy: "Los XML se convierten en una estructura usable para contabilidad, administracion y direccion sin hojas improvisadas.",
    },
    {
      step: "03",
      title: "Excel operativo + dashboards de direccion",
      copy: "Entregamos informacion lista para corte, analisis comercial y estimacion fiscal por cliente, proveedor y producto.",
    },
  ];

  const dashboardBars = [
    { label: "Cliente Norte", amount: "$930k", width: "78%" },
    { label: "Cliente Centro", amount: "$610k", width: "56%" },
    { label: "Cliente Bajio", amount: "$430k", width: "39%" },
  ];

  const executiveSignals = [
    "Ingresos por cliente con concentracion comercial visible",
    "Egresos por proveedor y tipo de gasto en la misma lectura",
    "ISR e IVA estimados antes del cierre mensual",
  ];

  return (
    <div className="min-h-screen bg-[#fcfdfc] font-sans text-slate-900">
      <main className="mx-auto w-full max-w-[1560px] px-5 pb-20 pt-6 sm:px-8 lg:px-12 2xl:px-16">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#fbfcff_58%,#f7fafc_100%)] shadow-[0_30px_90px_rgba(148,163,184,0.16)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.26),_transparent_52%)]" />
          <div className="pointer-events-none absolute right-0 top-12 h-80 w-80 rounded-full bg-[#dbeafe]/40 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-20 h-56 w-56 rounded-full bg-[#e2e8f0]/40 blur-3xl" />

          <div className="relative px-5 py-8 sm:px-8 lg:px-10 lg:py-8 xl:px-14 xl:py-10">
            <div className="flex flex-col gap-3 border-b border-slate-900/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.34em] text-slate-500">
                  AIcuenta
                </p>
                <p className="mt-1 hidden text-sm text-slate-600 sm:block">
                  Inteligencia fiscal util para direccion, finanzas y despachos.
                </p>
              </div>
              <div className="hidden flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 sm:flex">
                <span className="rounded-full border border-slate-900/10 bg-white/80 px-3 py-1.5">
                  XML oficiales
                </span>
                <span className="rounded-full border border-slate-900/10 bg-white/80 px-3 py-1.5">
                  Excel operativo
                </span>
                <span className="rounded-full border border-slate-900/10 bg-white/80 px-3 py-1.5">
                  Dashboards ejecutivos
                </span>
                <div className="ml-3 flex items-center gap-2">
                  <a
                    href="/login"
                    className="rounded-full border border-slate-900/15 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    Iniciar sesion
                  </a>
                  <a
                    href="/register"
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800"
                  >
                    Probar gratis
                  </a>
                </div>
              </div>
            </div>

            <div className="grid gap-6 py-7 lg:grid-cols-12 lg:gap-8 lg:py-7 xl:gap-10 xl:py-8">
              <div className="lg:col-span-7 2xl:col-span-8">
                <p className="animate-fade-up inline-flex rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-4 py-1.5 text-sm font-bold text-[#1e3a8a]" style={{ animationDelay: "60ms" }}>
                  Menos persecucion de XML. Mas lectura de negocio y control fiscal.
                </p>
                <h1 className="animate-fade-up mt-4 max-w-[900px] text-4xl font-black leading-[1.02] tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-5xl xl:text-[3.8rem] 2xl:text-[4.4rem]" style={{ animationDelay: "160ms" }}>
                  Deja de administrar archivos. Empieza a leer el negocio que ya tienes.
                </h1>
                <p className="animate-fade-up mt-4 max-w-3xl text-base leading-7 text-slate-700 sm:text-base sm:leading-7 lg:text-[1.05rem] lg:leading-7 xl:text-[1.12rem] xl:leading-8" style={{ animationDelay: "280ms" }}>
                  Tu informacion fiscal ya esta en el SAT. AIcuenta la trae, la ordena y te la pone en pantalla: quien te compra, quien te cobra, cuanto ISR e IVA se acumula y donde esta el riesgo — antes de que el contador te llame.
                </p>

                <div className="animate-fade-up mt-6 flex flex-col gap-3 sm:flex-row lg:mt-6" style={{ animationDelay: "380ms" }}>
                  <a
                    href="/register"
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-8 text-sm font-extrabold text-white transition hover:bg-slate-800"
                  >
                    Probar gratis
                  </a>
                  <a
                    href="/login"
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-900/15 bg-white/90 px-8 text-sm font-bold text-slate-900 transition hover:border-slate-900/30 hover:bg-white"
                  >
                    Iniciar sesion
                  </a>
                </div>

                <div className="animate-fade-up mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:mt-6 xl:mt-7" style={{ animationDelay: "460ms" }}>
                  {trustSignals.map((signal) => (
                    <div
                      key={signal.label}
                      className="rounded-[1.6rem] border border-slate-900/10 bg-white/88 px-5 py-5 shadow-[0_18px_45px_rgba(148,163,184,0.12)]"
                    >
                      <p className="text-3xl font-black text-slate-950">{signal.value}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{signal.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="animate-fade-in relative hidden lg:col-span-5 lg:block 2xl:col-span-4" style={{ animationDelay: "300ms" }}>
                <div className="rounded-[2rem] border border-[#d8e6df] bg-white/88 p-6 shadow-[0_28px_80px_rgba(148,163,184,0.22)] backdrop-blur sm:p-7">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                    <span>Vista ejecutiva</span>
                    <span>Actualizado hoy</span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="rounded-[1.4rem] bg-[#f8fafc] p-4">
                      <p className="text-sm text-slate-500">Ingresos del periodo</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">$2.84M</p>
                      <p className="mt-1 text-xs text-[#15846d]">+12.4% vs corte anterior</p>
                    </div>
                    <div className="grid gap-4">
                      <div className="rounded-[1.4rem] bg-[#f0f9ff] p-4">
                        <p className="text-sm text-[#1e3a8a]">ISR estimado</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">$182,450</p>
                      </div>
                      <div className="rounded-[1.4rem] bg-[#f8fafc] p-4">
                        <p className="text-sm text-slate-600">IVA estimado</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">$136,220</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.6rem] border border-slate-900/8 bg-[#fdfcf9] p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">Ingresos por cliente</p>
                      <p className="text-xs text-slate-500">Ultimo corte</p>
                    </div>
                    <div className="mt-5 space-y-4">
                      {dashboardBars.map((bar) => (
                        <div key={bar.label}>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                            <span>{bar.label}</span>
                            <span>{bar.amount}</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[#e8eef2]">
                            <div
                              className="h-2.5 rounded-full bg-gradient-to-r from-[#77d8c0] via-[#64c8d7] to-[#8baee8]"
                              style={{ width: bar.width }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(148,163,184,0.12)]">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                    Lo que se ordena automatico
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {extractionItems.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-slate-900/10 pt-6 lg:grid-cols-3">
              <div className="rounded-[1.6rem] border border-[#dbeafe] bg-[#f0f9ff] px-5 py-5">
                <p className="text-sm font-bold text-slate-950">Sin instalacion. Sin configuracion. Listo en menos de 24 horas.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Subes tus certificados, nosotros hacemos el resto. Tu primer tablero accionable aparece el mismo dia.
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-slate-900/10 bg-white/88 px-5 py-5">
                <p className="text-sm font-bold text-slate-950">Listo para Excel, analisis y seguimiento.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  La data no se queda en lo visual; aterriza en formatos que tu equipo puede operar de inmediato.
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-[#e2e8f0] bg-[#f8fafc] px-5 py-5">
                <p className="text-sm font-bold text-slate-950">Pensado para quien responde por el numero final.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Direccion, finanzas, administracion y despacho comparten la misma lectura del cierre.
                </p>
              </div>
            </div>
          </div>
        </section>

        <RevealOnScroll>
        <section className="mt-14 grid gap-6 lg:grid-cols-12">
          <article className="rounded-[2rem] border border-[#dbeafe] bg-[#f0f9ff] p-7 shadow-[0_18px_50px_rgba(148,163,184,0.10)] lg:col-span-4 lg:p-8">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#1e3a8a]">
              El problema real
            </p>
            <h2 className="mt-4 max-w-md text-3xl font-black leading-tight text-slate-950 sm:text-4xl lg:text-[2.5rem] xl:text-[2.7rem]">
              Tus datos fiscales existen, pero hoy no se leen como negocio.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-700">
              La mayor perdida no es bajar XML. La mayor perdida es llegar al escritorio de direccion sin contexto claro para decidir rapido.
            </p>
          </article>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:col-span-8">
            {painPoints.map((point, index) => (
              <article
                key={point.title}
                className={`rounded-[2rem] border p-6 shadow-[0_18px_50px_rgba(148,163,184,0.10)] ${
                  index === 1
                    ? "border-[#dbeafe] bg-[#f0f9ff]"
                    : "border-[#d9d1c3] bg-white/92"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                  Punto {index + 1}
                </p>
                <p className="mt-4 text-xl font-black leading-snug text-slate-950">
                  {point.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{point.copy}</p>
              </article>
            ))}
          </div>
        </section>
        </RevealOnScroll>

        <RevealOnScroll>
        <section id="entregables" className="mt-14 grid gap-6 lg:grid-cols-12">
          <article className="rounded-[2rem] border border-slate-900/10 bg-white p-7 shadow-[0_20px_55px_rgba(148,163,184,0.12)] lg:col-span-7 lg:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                  Que recibes
                </p>
                <h2 className="mt-3 max-w-2xl text-2xl font-black leading-tight text-slate-950 sm:text-3xl lg:text-4xl">
                  Una capa de claridad fiscal lista para operar desde PC desde el dia uno.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                Sin archivos dispersos ni reportes improvisados. Lo que se descarga se acomoda para analisis comercial, operativo y fiscal.
              </p>
            </div>

            <div className="mt-8 rounded-[1.8rem] border border-[#e2e8f0] bg-[#f8fafc] p-5 lg:p-6">
              <div className="flex items-center justify-between border-b border-slate-900/8 pb-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                <span>Excel operativo</span>
                <span>Corte fiscal</span>
              </div>
              <div className="mt-4 space-y-3">
                {excelRows.map((row) => (
                  <div
                    key={row.concept}
                    className="flex flex-col gap-1 rounded-[1.2rem] border border-slate-900/8 bg-white px-4 py-4 text-sm md:grid md:grid-cols-[1.55fr_0.75fr_0.85fr_0.7fr] md:items-center md:gap-3"
                  >
                    <span className="font-semibold text-slate-950">{row.concept}</span>
                    <span className="text-slate-500 md:text-slate-600">{row.type}</span>
                    <span className="text-slate-500 md:text-slate-600">{row.tax}</span>
                    <span className="font-bold text-[#145649]">{row.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <div className="grid gap-6 lg:col-span-5">
            <article className="rounded-[2rem] border border-[#dbeafe] bg-[#f0f9ff] p-7 shadow-[0_18px_50px_rgba(148,163,184,0.10)] lg:p-8">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#1e3a8a]">
                Dashboards amplios
              </p>
              <h3 className="mt-3 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Lectura ejecutiva que se entiende mejor en escritorio.
              </h3>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dashboardItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-[1.4rem] border border-slate-900/8 bg-white/90 px-4 py-4 text-sm font-bold text-slate-900"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-7 shadow-[0_18px_50px_rgba(148,163,184,0.10)] lg:p-8">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                Clasificacion inmediata
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {extractionItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-[1.2rem] bg-white px-4 py-4 text-sm font-semibold text-slate-800 shadow-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
        </RevealOnScroll>

        <RevealOnScroll>
        <section id="proceso" className="mt-14 rounded-[2.2rem] border border-slate-900/10 bg-white p-7 shadow-[0_20px_60px_rgba(148,163,184,0.12)] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                Como funciona
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-slate-950 sm:text-4xl lg:text-[2.7rem]">
                De la FIEL a una vista ejecutiva util en tres pasos claros.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              La operacion baja XML; AIcuenta los convierte en lectura para administracion, finanzas y direccion.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {workflow.map((item) => (
              <article
                key={item.step}
                className="rounded-[1.8rem] border border-slate-900/10 bg-[#f8fafc] p-6"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-slate-900 text-lg font-black text-white">
                  {item.step}
                </div>
                <p className="mt-5 text-xl font-black leading-snug text-slate-950">{item.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.copy}</p>
              </article>
            ))}
          </div>
        </section>
        </RevealOnScroll>

        <RevealOnScroll delay={100}>
        <section id="cta" className="mt-14 overflow-hidden rounded-[2.25rem] border border-[#e2e8f0] bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#eff6ff_100%)] shadow-[0_24px_70px_rgba(148,163,184,0.14)]">
          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-12 lg:items-end lg:px-12 lg:py-12">
            <div className="lg:col-span-7">
              <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-[3.4rem]">
                Si tus XML ya existen, tu claridad fiscal deberia verse igual de clara en pantalla grande.
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">
                Agenda una demo y te mostramos como pasar de certificados y archivos sueltos a un tablero amplio, entendible y listo para tomar decisiones con contexto fiscal real.
              </p>
            </div>

            <div className="rounded-[1.9rem] border border-slate-900/10 bg-white p-6 shadow-[0_18px_45px_rgba(148,163,184,0.12)] lg:col-span-5 lg:p-7">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Lo que veras en la llamada
              </p>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                {executiveSignals.map((item) => (
                  <p key={item} className="rounded-[1.2rem] bg-[#f4f7fb] px-4 py-3">
                    {item}
                  </p>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#proceso"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-6 text-sm font-extrabold text-white transition hover:bg-slate-800"
                >
                  Ver como arrancamos
                </a>
                <a
                  href="#entregables"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-900/10 px-6 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
                >
                  Revisar entregables
                </a>
              </div>
            </div>
          </div>
        </section>
        </RevealOnScroll>
      </main>
    </div>
  );
}
