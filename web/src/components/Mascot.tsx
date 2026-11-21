import Image from 'next/image'

export type MascotPose =
  | 'cheer'
  | 'confused'
  | 'curious'
  | 'graduate'
  | 'idea'
  | 'jump'
  | 'keep-going'
  | 'laptop'
  | 'love'
  | 'peek'
  | 'reading'
  | 'sad'
  | 'sleep'
  | 'surprised'
  | 'thumbs-up'

export function Mascot({
  pose,
  size = 120,
  className = '',
}: {
  pose: MascotPose
  size?: number
  className?: string
}) {
  return (
    <Image
      src={`/mascot/${pose}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      unoptimized
      draggable={false}
      className={`mascot pointer-events-none flex-none select-none ${className}`}
    />
  )
}
