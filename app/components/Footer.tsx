const links = [
  {
    heading: "Producto",
    items: [
      { label: "Como funciona", href: "#proceso" },
      { label: "Entregables", href: "#entregables" },
      { label: "Precios", href: "#" },
    ],
  },
  {
    heading: "Empresa",
    items: [
      { label: "Acerca de", href: "#" },
      { label: "Contacto", href: "#" },
      { label: "Aviso de privacidad", href: "/privacidad" },
      { label: "Terminos y condiciones", href: "/terminos" },
    ],
  },
  {
    heading: "Recursos",
    items: [
      { label: "Guia de inicio", href: "#" },
      { label: "Preguntas frecuentes", href: "#" },
      { label: "Agendar demo", href: "#cta" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-slate-900/10 bg-white">
      <div className="mx-auto w-full max-w-[1560px] px-5 py-12 sm:px-8 lg:px-12 2xl:px-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-950">
              AIcuenta
            </p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">
              Claridad fiscal desde tus XML. De certificados a dashboards ejecutivos en un solo flujo.
            </p>
          </div>

          {/* Link columns */}
          {links.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm text-slate-600 transition hover:text-slate-950"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-slate-900/8 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-400">
            © {year} AIcuenta. Todos los derechos reservados.
          </p>
          <p className="text-xs text-slate-400">
            Hecho en Mexico · Datos seguros · Sin captura manual
          </p>
        </div>
      </div>
    </footer>
  );
}
