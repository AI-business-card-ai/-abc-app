'use client'

import { useEffect, useRef, useState } from 'react'

export default function HeroGlobe() {
  const globeRef = useRef<{ controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean }; pointOfView: (pov: { lat: number; lng: number; altitude: number }) => void } | null>(null)
  const [Globe, setGlobe] = useState<React.ComponentType<Record<string, unknown>> | null>(null)

  useEffect(() => {
    import('react-globe.gl').then((mod) => setGlobe(() => mod.default as React.ComponentType<Record<string, unknown>>))
  }, [])

  const arcsData = [
    { startLat: 51.5, startLng: -0.1, endLat: 25.2, endLng: 55.3, color: '#00d4d4', label: 'London → Dubai' },
    { startLat: 40.7, startLng: -74.0, endLat: 51.5, endLng: -0.1, color: '#f0197d', label: 'New York → London' },
    { startLat: 51.2, startLng: 6.8, endLat: 35.7, endLng: 139.7, color: '#8b5cf6', label: 'Düsseldorf → Tokyo' },
    { startLat: 1.3, startLng: 103.8, endLat: 48.9, endLng: 2.3, color: '#00d4d4', label: 'Singapore → Paris' },
    { startLat: 37.6, startLng: -122.4, endLat: 52.5, endLng: 13.4, color: '#f0197d', label: 'SF → Berlin' },
    { startLat: -33.9, startLng: 151.2, endLat: 25.2, endLng: 55.3, color: '#8b5cf6', label: 'Sydney → Dubai' },
    { startLat: 48.9, startLng: 2.3, endLat: 1.3, endLng: 103.8, color: '#00d4d4', label: 'Paris → Singapore' },
    { startLat: 19.4, startLng: -99.1, endLat: 40.7, endLng: -74.0, color: '#f0197d', label: 'Mexico → NY' },
  ]

  const pointsData = [
    { lat: 51.5, lng: -0.1, label: 'London · SaaS', color: '#00d4d4' },
    { lat: 25.2, lng: 55.3, label: 'Dubai · Finance', color: '#00d4d4' },
    { lat: 40.7, lng: -74.0, label: 'New York · FinTech', color: '#f0197d' },
    { lat: 51.2, lng: 6.8, label: 'Düsseldorf · Pharma', color: '#8b5cf6' },
    { lat: 35.7, lng: 139.7, label: 'Tokyo · Tech', color: '#8b5cf6' },
    { lat: 1.3, lng: 103.8, label: 'Singapore · Trade', color: '#00d4d4' },
    { lat: 37.6, lng: -122.4, label: 'San Francisco · AI', color: '#f0197d' },
    { lat: 52.5, lng: 13.4, label: 'Berlin · MedTech', color: '#f0197d' },
    { lat: 48.9, lng: 2.3, label: 'Paris · Luxury', color: '#8b5cf6' },
    { lat: -33.9, lng: 151.2, label: 'Sydney · Mining', color: '#00d4d4' },
  ]

  useEffect(() => {
    if (!globeRef.current) return
    globeRef.current.controls().autoRotate = true
    globeRef.current.controls().autoRotateSpeed = 0.8
    globeRef.current.controls().enableZoom = false
    globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.2 })
  }, [Globe])

  if (!Globe) {
    return (
      <div
        style={{
          position: 'absolute',
          right: '-50px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '700px',
          height: '700px',
          background: 'radial-gradient(circle, #0a1628, #050a14)',
          borderRadius: '50%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    )
  }

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(90deg, #0d0f1a 45%, rgba(13,15,26,0.3) 75%, transparent 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-80px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '750px',
          height: '750px',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-30px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(0,212,212,0.12) 0%, rgba(139,92,246,0.08) 50%, transparent 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none',
          }}
        />

        <Globe
          ref={globeRef}
          width={750}
          height={750}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          atmosphereColor="rgba(0,180,255,0.4)"
          atmosphereAltitude={0.15}
          arcsData={arcsData}
          arcColor={(d: { color: string }) => [d.color, d.color]}
          arcDashLength={0.3}
          arcDashGap={0.15}
          arcDashAnimateTime={2000}
          arcStroke={0.5}
          arcAltitude={0.3}
          arcAltitudeAutoScale={0.3}
          pointsData={pointsData}
          pointColor="color"
          pointAltitude={0.01}
          pointRadius={0.4}
          pointsMerge={false}
          pointLabel="label"
        />
      </div>
    </>
  )
}
