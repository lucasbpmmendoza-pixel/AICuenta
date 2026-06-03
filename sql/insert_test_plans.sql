-- Insertar planes de prueba
-- Nota: Reemplazar los stripe_product_id y stripe_price_id con los valores reales de Stripe

INSERT INTO plans (nombre, costo, duracion_meses, stripe_product_id, stripe_price_id, descripcion, es_activo) 
VALUES
('Gratis', 0.00, 1, 'prod_test_gratis', 'price_test_gratis', 'Plan gratuito con características básicas', 1),
('Profesional', 10.00, 1, 'prod_test_10', 'price_test_10_usd', 'Plan profesional - $10 USD/mes', 1),
('Empresarial', 20.00, 1, 'prod_test_20', 'price_test_20_usd', 'Plan empresarial - $20 USD/mes', 1);
