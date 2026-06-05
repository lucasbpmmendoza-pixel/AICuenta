'use client'

interface Props {
  /** Posicion relativa al elemento padre */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  /** Color del beacon: 'brand' (morado), 'green', 'amber' */
  color?: 'brand' | 'green' | 'amber'
  /** Tamaño del círculo central en px */
  size?: number
  className?: string
  onClick?: () => void
}

const COLORS = {
  brand: {
    ring: 'bg-[#7b6fe8]',
    pulse: 'bg-[#7b6fe8]',
  },
  green: {
    ring: 'bg-emerald-500',
    pulse: 'bg-emerald-500',
  },
  amber: {
    ring: 'bg-amber-400',
    pulse: 'bg-amber-400',
  },
}

const POSITIONS: Record<NonNullable<Props['position']>, string> = {
  'top-right':    'top-0 right-0 -translate-y-1/2 translate-x-1/2',
  'top-left':     'top-0 left-0 -translate-y-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-0 right-0 translate-y-1/2 translate-x-1/2',
  'bottom-left':  'bottom-0 left-0 translate-y-1/2 -translate-x-1/2',
}

export default function OnboardingBeacon({
  position = 'top-right',
  color = 'brand',
  size = 10,
  className = '',
  onClick,
}: Props) {
  const { ring, pulse } = COLORS[color]
  const pos = POSITIONS[position]

  return (
    <span
      role="presentation"
      onClick={onClick}
      className={`absolute ${pos} z-30 inline-flex items-center justify-center ${onClick ? 'cursor-pointer' : 'pointer-events-none'} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Anillo exterior — animacion ping */}
      <span
        className={`absolute inline-flex rounded-full opacity-75 animate-ping ${pulse}`}
        style={{ width: size, height: size }}
      />
      {/* Punto central */}
      <span
        className={`relative inline-flex rounded-full ${ring}`}
        style={{ width: size * 0.6, height: size * 0.6 }}
      />
    </span>
  )
}
