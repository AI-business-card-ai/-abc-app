interface Props {
  initials: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: { outer: 'w-9 h-9', inner: 'text-xs', text: 'text-xs' },
  md: { outer: 'w-11 h-11', inner: 'text-sm', text: 'text-sm' },
  lg: { outer: 'w-[52px] h-[52px]', inner: 'text-lg', text: 'text-lg' },
  xl: { outer: 'w-20 h-20', inner: 'text-2xl', text: 'text-2xl' },
}

export default function GradientAvatar({ initials, size = 'md', className = '' }: Props) {
  const s = sizes[size]
  return (
    <div className={`gradient-ring shrink-0 ${s.outer} ${className}`}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-bold text-text-primary bg-card ${s.inner}`}
      >
        {initials}
      </div>
    </div>
  )
}
