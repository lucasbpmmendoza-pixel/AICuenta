-- Tabla para llevar logs de uso de botones y pestañas por usuario
CREATE TABLE logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(36) NOT NULL,
    lastupdate DATETIME2 DEFAULT GETDATE(),
    btn_descargar_excel_facturas INT DEFAULT 0,
    btn_descargar_pagos_facturas INT DEFAULT 0,
    btn_descargar_flujo_facturas INT DEFAULT 0,
    btn_descargar_notas_facturas INT DEFAULT 0,
    btn_descargar_estados_financieros INT DEFAULT 0,
    btn_benchmark_estados_financieros INT DEFAULT 0,
    btn_audit_conceptos_estados_financieros INT DEFAULT 0,
    tab_rfc INT DEFAULT 0,
    tab_usuarios INT DEFAULT 0,
    tab_dashboard INT DEFAULT 0,
    tab_asistente_ia INT DEFAULT 0,
    tab_asistente_docs INT DEFAULT 0,
    tab_aichikenelo INT DEFAULT 0
);

-- Cada vez que un usuario presione un botón o seleccione una pestaña, se debe hacer un UPDATE sumando 1 al campo correspondiente para ese user_id, o un INSERT si no existe registro para ese usuario.
