import { useState, useEffect } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function useDevice(): DeviceType {
  const [device, setDevice] = useState<DeviceType>('desktop')

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth
      if (width < 768) setDevice('mobile')
      else if (width < 1024) setDevice('tablet')
      else setDevice('desktop')
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return device
}
