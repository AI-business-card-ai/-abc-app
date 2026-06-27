'use client'

export default function HeroGlobe() {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          background:
            'linear-gradient(90deg, #0d0f1a 45%, rgba(13,15,26,0.3) 75%, transparent 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-50px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '700px',
          height: '700px',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        {/* Atmosphere glow */}
        <div
          style={{
            position: 'absolute',
            inset: '-20px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(0,212,212,0.15) 0%, rgba(139,92,246,0.1) 50%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* Real Earth globe using NASA texture via CSS */}
        <div
          className="hero-earth-globe"
          style={{
            width: '700px',
            height: '700px',
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            boxShadow:
              '0 0 80px rgba(0,100,200,0.4), inset -30px -10px 60px rgba(0,0,0,0.8)',
          }}
        >
          {/* Ocean base */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #1a5276, #0a2d4a, #051525)',
            }}
          />

          {/* Continents using SVG world map */}
          <svg
            viewBox="0 0 1000 500"
            className="hero-earth-map"
            style={{
              position: 'absolute',
              width: '200%',
              height: '100%',
              left: '0%',
              top: 0,
            }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M480,120 L510,110 L530,115 L545,105 L555,115 L550,130 L530,140 L510,145 L490,140 L475,130 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path d="M460,108 L470,100 L475,110 L468,118 L458,115 Z" fill="#2d6a3f" opacity="0.9" />
            <path d="M490,80 L505,70 L515,80 L510,100 L495,105 L485,95 Z" fill="#2d6a3f" opacity="0.9" />
            <path
              d="M490,155 L520,150 L545,160 L555,190 L550,230 L535,260 L515,270 L495,260 L480,230 L478,195 L485,165 Z"
              fill="#8b6914"
              opacity="0.85"
            />
            <path
              d="M555,90 L620,80 L680,85 L720,100 L730,120 L710,140 L680,150 L640,145 L600,150 L570,145 L555,130 L550,110 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path
              d="M620,145 L640,140 L645,165 L635,185 L620,190 L610,175 L612,155 Z"
              fill="#2d6a3f"
              opacity="0.85"
            />
            <path
              d="M660,130 L700,125 L720,135 L715,155 L695,165 L665,160 L650,148 Z"
              fill="#2d6a3f"
              opacity="0.85"
            />
            <path
              d="M180,95 L230,85 L270,90 L300,105 L310,130 L295,155 L260,165 L220,160 L185,145 L165,120 L168,100 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path d="M335,55 L370,45 L385,60 L375,80 L350,85 L330,72 Z" fill="#4a9e6b" opacity="0.7" />
            <path
              d="M240,185 L270,175 L290,185 L295,215 L285,250 L265,280 L245,285 L230,265 L225,235 L228,205 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path
              d="M720,210 L760,205 L780,215 L785,240 L775,260 L750,265 L725,255 L715,235 L718,215 Z"
              fill="#8b6914"
              opacity="0.85"
            />
            <path d="M738,105 L745,100 L750,110 L744,120 L737,115 Z" fill="#2d6a3f" opacity="0.9" />

            <path
              d="M1480,120 L1510,110 L1530,115 L1545,105 L1555,115 L1550,130 L1530,140 L1510,145 L1490,140 L1475,130 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path d="M1460,108 L1470,100 L1475,110 L1468,118 L1458,115 Z" fill="#2d6a3f" opacity="0.9" />
            <path d="M1490,80 L1505,70 L1515,80 L1510,100 L1495,105 L1485,95 Z" fill="#2d6a3f" opacity="0.9" />
            <path
              d="M1490,155 L1520,150 L1545,160 L1555,190 L1550,230 L1535,260 L1515,270 L1495,260 L1480,230 L1478,195 L1485,165 Z"
              fill="#8b6914"
              opacity="0.85"
            />
            <path
              d="M1555,90 L1620,80 L1680,85 L1720,100 L1730,120 L1710,140 L1680,150 L1640,145 L1600,150 L1570,145 L1555,130 L1550,110 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path
              d="M1620,145 L1640,140 L1645,165 L1635,185 L1620,190 L1610,175 L1612,155 Z"
              fill="#2d6a3f"
              opacity="0.85"
            />
            <path
              d="M1660,130 L1700,125 L1720,135 L1715,155 L1695,165 L1665,160 L1650,148 Z"
              fill="#2d6a3f"
              opacity="0.85"
            />
            <path
              d="M1180,95 L1230,85 L1270,90 L1300,105 L1310,130 L1295,155 L1260,165 L1220,160 L1185,145 L1165,120 L1168,100 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path
              d="M1240,185 L1270,175 L1290,185 L1295,215 L1285,250 L1265,280 L1245,285 L1230,265 L1225,235 L1228,205 Z"
              fill="#2d6a3f"
              opacity="0.9"
            />
            <path
              d="M1720,210 L1760,205 L1780,215 L1785,240 L1775,260 L1750,265 L1725,255 L1715,235 L1718,215 Z"
              fill="#8b6914"
              opacity="0.85"
            />
            <path d="M1738,105 L1745,100 L1750,110 L1744,120 L1737,115 Z" fill="#2d6a3f" opacity="0.9" />
          </svg>

          {/* Light source overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 0%, transparent 60%)',
              pointerEvents: 'none',
            }}
          />

          {/* Dark edge */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 70% 65%, rgba(0,0,0,0.7) 20%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Connection arrows - positioned absolutely around globe */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '700px',
            height: '700px',
            overflow: 'visible',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker id="arrow1" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#00d4d4" />
            </marker>
            <marker id="arrow2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#f0197d" />
            </marker>
            <marker id="arrow3" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#8b5cf6" />
            </marker>
          </defs>

          <path
            d="M 320,210 Q 420,150 520,220"
            stroke="#00d4d4"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrow1)"
            strokeDasharray="8,4"
            opacity="0.9"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2s" repeatCount="indefinite" />
          </path>

          <path
            d="M 180,240 Q 250,180 320,215"
            stroke="#f0197d"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrow2)"
            strokeDasharray="8,4"
            opacity="0.9"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.5s" repeatCount="indefinite" />
          </path>

          <path
            d="M 330,225 Q 340,290 320,350"
            stroke="#8b5cf6"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrow3)"
            strokeDasharray="8,4"
            opacity="0.9"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="3s" repeatCount="indefinite" />
          </path>

          <path
            d="M 530,230 Q 560,310 520,370"
            stroke="#00d4d4"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrow1)"
            strokeDasharray="8,4"
            opacity="0.9"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.2s" repeatCount="indefinite" />
          </path>

          <path
            d="M 195,255 Q 185,310 200,370"
            stroke="#f0197d"
            strokeWidth="2"
            fill="none"
            markerEnd="url(#arrow2)"
            strokeDasharray="8,4"
            opacity="0.8"
          >
            <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2.8s" repeatCount="indefinite" />
          </path>

          <circle cx="320" cy="210" r="6" fill="#00d4d4" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="520" cy="220" r="6" fill="#00d4d4" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="2.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="180" cy="240" r="6" fill="#f0197d" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="320" cy="350" r="6" fill="#8b5cf6" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="520" cy="370" r="6" fill="#00d4d4" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="200" cy="370" r="6" fill="#f0197d" opacity="0.9">
            <animate attributeName="r" values="5;9;5" dur="2.2s" repeatCount="indefinite" />
          </circle>

          <g>
            <rect x="330" y="200" width="80" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00d4d4" strokeWidth="0.5" />
            <text x="370" y="213" textAnchor="middle" fill="#00d4d4" fontSize="9" fontFamily="system-ui">
              London · SaaS
            </text>
          </g>
          <g>
            <rect x="530" y="208" width="90" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00d4d4" strokeWidth="0.5" />
            <text x="575" y="221" textAnchor="middle" fill="#00d4d4" fontSize="9" fontFamily="system-ui">
              Dubai · Finance
            </text>
          </g>
          <g>
            <rect x="100" y="228" width="105" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#f0197d" strokeWidth="0.5" />
            <text x="152" y="241" textAnchor="middle" fill="#f0197d" fontSize="9" fontFamily="system-ui">
              New York · FinTech
            </text>
          </g>
          <g>
            <rect x="230" y="340" width="110" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#8b5cf6" strokeWidth="0.5" />
            <text x="285" y="353" textAnchor="middle" fill="#8b5cf6" fontSize="9" fontFamily="system-ui">
              Düsseldorf · Pharma
            </text>
          </g>
          <g>
            <rect x="530" y="375" width="105" height="18" rx="4" fill="rgba(0,0,0,0.8)" stroke="#00d4d4" strokeWidth="0.5" />
            <text x="582" y="388" textAnchor="middle" fill="#00d4d4" fontSize="9" fontFamily="system-ui">
              Singapore · Trade
            </text>
          </g>
        </svg>
      </div>

      <style jsx global>{`
        .hero-earth-map {
          animation: heroMapScroll 40s linear infinite;
        }
        @keyframes heroMapScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-earth-map {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
