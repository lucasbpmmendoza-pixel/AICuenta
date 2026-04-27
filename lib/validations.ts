import { z } from "zod";

const PASSWORD_MIN = 8;

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Correo electronico invalido")
    .max(254, "El correo no puede exceder 254 caracteres"),

  password: z
    .string()
    .min(PASSWORD_MIN, `La contrasena debe tener al menos ${PASSWORD_MIN} caracteres`)
    .max(128, "La contrasena no puede exceder 128 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayuscula")
    .regex(/[0-9]/, "Debe contener al menos un numero"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
