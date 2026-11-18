import { useId } from 'react'
import { faceFromSeed, type FaceLook } from '../lib/avatar'

const CRESCENT: Record<
  Exclude<FaceLook['crescent'], 'none'>,
  { cx: number; cy: number }
> = {
  left: { cx: 0, cy: 50 },
  'top-left': { cx: 0, cy: 0 },
  right: { cx: 100, cy: 50 },
}

const MOUTH: Record<FaceLook['smile'], string> = {
  small: 'M 44 59 Q 50 64 56 59',
  medium: 'M 42 59 Q 50 66 58 59',
  big: 'M 39 58 Q 50 69 61 58',
}

type Props = {
  seed: string
  size?: number
  className?: string
  title?: string
}

export function Avatar({ seed, size = 32, className, title }: Props) {
  const face = faceFromSeed(seed)
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const crescent = face.crescent === 'none' ? null : CRESCENT[face.crescent]
  const leftEye = 50 - face.eyeGap / 2
  const rightEye = 50 + face.eyeGap / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}

      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <circle cx="50" cy="50" r="48" fill={face.base} />
        {crescent && face.accent && (
          <circle
            cx={crescent.cx}
            cy={crescent.cy}
            r="48"
            fill={face.accent}
          />
        )}
      </g>

      <circle cx={leftEye} cy={face.eyeY} r={face.eyeSize} fill={face.ink} />
      <circle cx={rightEye} cy={face.eyeY} r={face.eyeSize} fill={face.ink} />
      <path
        d={MOUTH[face.smile]}
        fill="none"
        stroke={face.ink}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
